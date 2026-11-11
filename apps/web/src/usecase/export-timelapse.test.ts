import { DEVELOPER_USER_ID, toCellKey } from "@liveplace/domain";
import {
  CHUNK_SCHEMA_VERSION,
  type Chunk,
  type ChunkEntry,
  HistoryTimeoutError,
} from "@liveplace/domain/chunk";
import type {
  ChunkListing,
  ChunkReader,
  DownloadedChunk,
  SessionVerifier,
  TimelapseSource,
} from "@liveplace/domain/ports";
import type { PileEntry, Tombstones } from "@liveplace/domain/snapshot";
import { createTimelapseBuilder, type TimelapseFrame } from "@liveplace/domain/timelapse";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportTimelapse, exportTimelapseAsDeveloper, type TimelapseProgress } from "./export-timelapse";

const NO_TOMBSTONES: Tombstones = {
  clearedVersions: new Map(),
  clearedPlacements: new Set(),
  clearedRanges: new Map(),
};

const placeEntry = (version: number, x: number, y: number, colorIndex: number): ChunkEntry => [
  version,
  `p${String(version).padStart(8, "0")}`,
  {
    version,
    kind: "place",
    authorId: "author-a",
    occurredAt: 1_000 + version,
    cells: [{ x, y, colorIndex, previousColorIndex: 0, placedAt: 1_000 + version }],
  },
];

const chunkOf = (entries: ChunkEntry[]): Chunk => ({
  schemaVersion: CHUNK_SCHEMA_VERSION,
  canvasId: "canvas-1",
  fromVersion: entries[0]?.[0] ?? 0,
  toVersion: entries.at(-1)?.[0] ?? 0,
  entries,
});

// Une fresque de 10 × 10 avec les poses 1 à 3 en (1, 1), (2, 2) et (3, 3).
const frameOf = (maxVersion: number): TimelapseFrame => {
  const state = new Uint8Array(100);
  const piles = [1, 2, 3].map((version) => {
    state[version * 10 + version] = version + 4;
    return {
      cellKey: toCellKey(version, version),
      entries: [
        {
          authorId: "author-a",
          colorIndex: version + 4,
          placedAt: 1_000 + version,
          version,
          placementId: `p${String(version).padStart(8, "0")}`,
        },
      ],
    };
  });
  return {
    size: { width: 10, height: 10 },
    corner: { x: 0, y: 0 },
    state,
    maxVersion,
    piles,
    tombstones: NO_TOMBSTONES,
  };
};

const sourceOf = (frame: TimelapseFrame | null, stream: ChunkEntry[]) => {
  const listStreamEntries = vi.fn(async function* (_canvasId: string, afterVersion: number) {
    for (const entry of stream) if (entry[0] > afterVersion) yield entry;
  });
  const source: TimelapseSource = { getFrame: async () => frame, listStreamEntries };
  return { source, listStreamEntries };
};

const downloadedOf = (chunk: Chunk): DownloadedChunk => ({ chunk, bytes: 10 });

// Comme Convex : seulement les chunks qui commencent avant `beforeVersion`, chacun entier.
const readerOf = (chunks: Chunk[]): ChunkReader => ({
  listChunks: vi.fn(async (_canvasId, options): Promise<ChunkListing> => {
    const wanted = chunks.filter(({ fromVersion }) => fromVersion < (options?.beforeVersion ?? Infinity));
    return {
      total: wanted.length,
      chunks: (async function* () {
        for (const chunk of wanted) yield downloadedOf(chunk);
      })(),
    };
  }),
});

// Les octets du base64 dans un tampon à eux : `Buffer.from` peut partager le tampon commun de Node.
const changesOf = (changes: string): number[] =>
  Array.from(new Uint32Array(Uint8Array.from(Buffer.from(changes, "base64")).buffer));

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("exportTimelapse (JOURNAL 2026-11-11)", () => {
  // Quand l'historique est en chunks et en flux, alors le web rejoue les chunks d'avant le flux, puis tout le flux, sans doublon.
  it("replays the chunks before the stream, then the whole stream, without a duplicate", async () => {
    const { source, listStreamEntries } = sourceOf(frameOf(3), [
      placeEntry(2, 2, 2, 6), // le chunk la porte aussi : seul le flux la rejoue
      placeEntry(3, 3, 3, 7),
    ]);
    const chunks = readerOf([chunkOf([placeEntry(1, 1, 1, 5), placeEntry(2, 2, 2, 6)])]);

    const result = await exportTimelapse({ source, chunks }, "canvas-1");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(listStreamEntries).toHaveBeenCalledWith("canvas-1", 0);
    expect(result.value.width).toBe(10);
    expect(result.value.height).toBe(10);
    expect(Buffer.from(result.value.initial, "base64")).toEqual(Buffer.alloc(100));
    expect(changesOf(result.value.changes)).toEqual([
      (11 << 8) | 5, // (1, 1) : stateOffset 11
      (22 << 8) | 6,
      (33 << 8) | 7,
    ]);
  });

  // Quand le flux seul porte l'historique, alors la lecture des chunks vides ne change rien.
  it("reads the stream alone when Convex has no chunk", async () => {
    const { source } = sourceOf(frameOf(3), [
      placeEntry(1, 1, 1, 5),
      placeEntry(2, 2, 2, 6),
      placeEntry(3, 3, 3, 7),
    ]);

    const result = await exportTimelapse({ source, chunks: readerOf([]) }, "canvas-1");

    expect(result.ok && changesOf(result.value.changes)).toHaveLength(3);
  });

  // Si le canvas est absent, alors le web refuse par une erreur nommée.
  it("refuses a canvas that Redis does not know", async () => {
    const { source } = sourceOf(null, []);

    expect(await exportTimelapse({ source, chunks: readerOf([]) }, "absent")).toEqual({
      ok: false,
      error: "canvas_not_found",
    });
  });

  // Si rien ne change, alors le web refuse par une erreur nommée, que la fenêtre affichera.
  it("refuses a canvas where nothing changes", async () => {
    const empty: TimelapseFrame = { ...frameOf(0), state: new Uint8Array(100), piles: [] };
    const { source } = sourceOf(empty, []);

    expect(await exportTimelapse({ source, chunks: readerOf([]) }, "canvas-1")).toEqual({
      ok: false,
      error: "no_changes",
    });
  });

  // Quand le flux commence à la version 1, alors Convex n'est pas appelé du tout.
  it("does not call Convex when the stream starts at version 1", async () => {
    const { source } = sourceOf(frameOf(3), [
      placeEntry(1, 1, 1, 5),
      placeEntry(2, 2, 2, 6),
      placeEntry(3, 3, 3, 7),
    ]);
    const chunks = readerOf([chunkOf([placeEntry(1, 1, 1, 5)])]);

    await exportTimelapse({ source, chunks }, "canvas-1");

    expect(chunks.listChunks).not.toHaveBeenCalled();
  });

  // Si le flux a perdu son début, alors seuls les chunks d'avant sa première version sont demandés.
  it("asks only for the chunks before the first version of a trimmed stream", async () => {
    const { source } = sourceOf(frameOf(3), [placeEntry(3, 3, 3, 7)]);
    const chunks = readerOf([chunkOf([placeEntry(1, 1, 1, 5), placeEntry(2, 2, 2, 6)])]);
    const controller = new AbortController();

    await exportTimelapse({ source, chunks }, "canvas-1", { signal: controller.signal });

    expect(chunks.listChunks).toHaveBeenCalledWith("canvas-1", {
      beforeVersion: 3,
      signal: controller.signal,
    });
  });

  // Quand un chunk est à cheval sur la première version du flux, alors le flux fait foi dès cette version.
  it("takes the versions from the first one of the stream on from the stream, not from a straddling chunk", async () => {
    const { source } = sourceOf(frameOf(3), [placeEntry(3, 3, 3, 7)]);
    const chunks = readerOf([
      chunkOf([placeEntry(1, 1, 1, 5), placeEntry(2, 2, 2, 6), placeEntry(3, 3, 3, 9)]), // la version 3 y est autre
    ]);

    const result = await exportTimelapse({ source, chunks }, "canvas-1");

    expect(result.ok && changesOf(result.value.changes)).toEqual([
      (11 << 8) | 5,
      (22 << 8) | 6,
      (33 << 8) | 7,
    ]);
  });

  // Quand le flux est vide (fresque récupérée), alors tous les chunks sont demandés.
  it("asks for every chunk when the stream is empty", async () => {
    const { source } = sourceOf(frameOf(3), []);
    const chunks = readerOf([
      chunkOf([placeEntry(1, 1, 1, 5)]),
      chunkOf([placeEntry(2, 2, 2, 6), placeEntry(3, 3, 3, 7)]),
    ]);

    const result = await exportTimelapse({ source, chunks }, "canvas-1");

    expect(vi.mocked(chunks.listChunks).mock.calls[0]?.[1]?.beforeVersion).toBeUndefined();
    expect(result.ok && changesOf(result.value.changes)).toHaveLength(3);
  });
});

// L'algorithme d'avant, gardé comme référence : tous les chunks, puis le flux après la dernière version vue.
const exportAsBefore = (frame: TimelapseFrame, chunks: Chunk[], stream: ChunkEntry[]) => {
  const builder = createTimelapseBuilder(frame);
  for (const chunk of chunks) {
    if (builder.isFull()) break;
    for (const entry of chunk.entries) builder.add(entry);
  }
  const lastVersion = builder.lastVersion();
  for (const entry of stream) {
    if (entry[0] <= lastVersion) continue;
    if (builder.isFull()) break;
    builder.add(entry);
  }
  return builder.finish();
};

const SIDE = 12;
const HISTORY_LENGTH = 60;
const CHUNK_LENGTH = 10;

// Un générateur à graine fixe (mulberry32).
const randomOf = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let mixed = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
  return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
};

// Une fresque de 12 × 12 et son historique : des poses de une à trois cases, quelques retraits, les piles de ce qui se voit.
const historyOf = (seed: number) => {
  const random = randomOf(seed);
  const state = new Uint8Array(SIDE * SIDE);
  const piles = new Map<number, PileEntry[]>();
  const entries: ChunkEntry[] = [];
  for (let version = 1; version <= HISTORY_LENGTH; version++) {
    const isClear = random() < 0.1;
    const offsets = new Set(
      Array.from({ length: 1 + Math.floor(random() * 3) }, () => Math.floor(random() * SIDE * SIDE)),
    );
    const cells = [...offsets].map((offset) => {
      const [x, y] = [offset % SIDE, Math.floor(offset / SIDE)];
      const previousColorIndex = state[offset] ?? 0;
      const colorIndex = isClear ? 0 : 1 + Math.floor(random() * 8);
      state[offset] = colorIndex;
      if (!isClear) {
        const pile = piles.get(toCellKey(x, y)) ?? [];
        pile.unshift({ authorId: "author-a", colorIndex, placedAt: 1_000 + version, version });
        piles.set(toCellKey(x, y), pile);
      }
      return { x, y, colorIndex, previousColorIndex, placedAt: 1_000 + version };
    });
    entries.push([
      version,
      isClear ? null : `p${String(version).padStart(8, "0")}`,
      {
        version,
        kind: isClear ? "clear" : "place",
        authorId: "author-a",
        occurredAt: 1_000 + version,
        cells,
      },
    ]);
  }
  const frame: TimelapseFrame = {
    size: { width: SIDE, height: SIDE },
    corner: { x: 0, y: 0 },
    state,
    maxVersion: HISTORY_LENGTH,
    piles: [...piles].map(([cellKey, pile]) => ({ cellKey, entries: pile })),
    tombstones: NO_TOMBSTONES,
  };
  return { frame, entries };
};

// Ce que le web rend, redécodé : comparable, octet pour octet, à ce que le constructeur rend.
const plainOf = (result: Awaited<ReturnType<typeof exportTimelapse>>) =>
  result.ok
    ? {
        ...result.value,
        initial: Array.from(Buffer.from(result.value.initial, "base64")),
        changes: changesOf(result.value.changes),
      }
    : result;

// Des chunks de dix versions qui couvrent 1 à `upTo`.
const chunksOf = (entries: ChunkEntry[], upTo: number): Chunk[] =>
  Array.from({ length: Math.ceil(upTo / CHUNK_LENGTH) }, (_, index) =>
    chunkOf(entries.slice(index * CHUNK_LENGTH, Math.min((index + 1) * CHUNK_LENGTH, upTo))),
  );

describe("the GIF stays the same as the one read from every chunk (JOURNAL 2026-11-11)", () => {
  // `streamFrom` : la première version du flux (`null` : vide) ; `chunkedUpTo` : la dernière version que les chunks portent.
  const SCENARIOS = [
    { name: "stream from version 1, chunks overlap it", streamFrom: 1, chunkedUpTo: 60 },
    { name: "stream from version 1, no chunk", streamFrom: 1, chunkedUpTo: 0 },
    { name: "trimmed stream, chunks cover everything", streamFrom: 25, chunkedUpTo: 60 },
    { name: "trimmed stream, a chunk straddles its first version", streamFrom: 25, chunkedUpTo: 30 },
    { name: "trimmed stream, chunks stop right before it", streamFrom: 31, chunkedUpTo: 30 },
    { name: "empty stream, chunks carry everything", streamFrom: null, chunkedUpTo: 60 },
  ];

  it.each(SCENARIOS)("$name", async ({ streamFrom, chunkedUpTo }) => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { frame, entries } = historyOf(seed);
      const chunks = chunksOf(entries, chunkedUpTo);
      const stream = streamFrom === null ? [] : entries.slice(streamFrom - 1);
      const reference = exportAsBefore(frame, chunks, stream);
      const reader = readerOf(chunks);

      const result = await exportTimelapse(
        { source: sourceOf(frame, stream).source, chunks: reader },
        "canvas-1",
      );

      expect(reference.ok).toBe(true);
      expect(plainOf(result)).toEqual(
        reference.ok
          ? {
              ...reference.value,
              initial: Array.from(reference.value.initial),
              changes: Array.from(reference.value.changes),
            }
          : reference,
      );
      if (streamFrom === 1) expect(reader.listChunks).not.toHaveBeenCalled();
      else
        expect(vi.mocked(reader.listChunks).mock.calls[0]?.[1]?.beforeVersion).toBe(streamFrom ?? undefined);
    }
  });
});

describe("exportTimelapse : progression, annulation, délai, journal (JOURNAL 2026-11-11)", () => {
  // Quand la lecture avance, alors le rappel dit les poses du flux, puis les chunks faits sur le total.
  it("reports the stream, then the chunks done over the total", async () => {
    const { source } = sourceOf(frameOf(3), [placeEntry(3, 3, 3, 7)]);
    const chunks = readerOf([chunkOf([placeEntry(1, 1, 1, 5), placeEntry(2, 2, 2, 6)])]);
    const steps: TimelapseProgress[] = [];

    await exportTimelapse({ source, chunks }, "canvas-1", { onProgress: (step) => steps.push(step) });

    expect(steps).toEqual([
      { step: "stream", poses: 1 },
      { step: "chunks", done: 0, total: 1 },
      { step: "chunks", done: 1, total: 1 },
    ]);
  });

  // Si la requête est déjà annulée, alors rien n'est lu.
  it("reads nothing when the request is already cancelled", async () => {
    const getFrame = vi.fn(async () => frameOf(1));
    const source: TimelapseSource = { getFrame, listStreamEntries: sourceOf(null, []).listStreamEntries };

    const result = await exportTimelapse({ source, chunks: readerOf([]) }, "canvas-1", {
      signal: AbortSignal.abort(),
    });

    expect(result).toEqual({ ok: false, error: "cancelled" });
    expect(getFrame).not.toHaveBeenCalled();
  });

  // Si la requête est annulée entre deux chunks, alors la lecture s'arrête avant le suivant.
  it("stops before the next chunk when the request is cancelled", async () => {
    const { source } = sourceOf(frameOf(3), [placeEntry(4, 3, 3, 7)]);
    const controller = new AbortController();
    let pulled = 0;
    const chunks: ChunkReader = {
      listChunks: async () => ({
        total: 3,
        chunks: (async function* () {
          for (const version of [1, 2, 3]) {
            pulled += 1;
            yield downloadedOf(chunkOf([placeEntry(version, version, version, version + 4)]));
            if (version === 1) controller.abort(); // reprise après le premier chunk : annulée, un lecteur peu soigneux rend le suivant
          }
        })(),
      }),
    };

    const result = await exportTimelapse({ source, chunks }, "canvas-1", { signal: controller.signal });

    expect(result).toEqual({ ok: false, error: "cancelled" });
    expect(pulled).toBe(2);
  });

  // Si la requête est annulée pendant un téléchargement, alors le lecteur lève son arrêt et la lecture rend `cancelled`.
  it("answers cancelled when the reader stops on the signal", async () => {
    const { source } = sourceOf(frameOf(3), [placeEntry(4, 3, 3, 7)]);
    const controller = new AbortController();
    const chunks: ChunkReader = {
      listChunks: async () => ({
        total: 2,
        chunks: (async function* () {
          yield downloadedOf(chunkOf([placeEntry(1, 1, 1, 5)]));
          controller.abort();
          throw controller.signal.reason;
        })(),
      }),
    };

    expect(await exportTimelapse({ source, chunks }, "canvas-1", { signal: controller.signal })).toEqual({
      ok: false,
      error: "cancelled",
    });
  });

  // Si un fichier dépasse le délai deux fois, alors le GIF échoue par `history_timeout`, jamais avec un trou.
  it.each([
    ["the list", "la liste des chunks"],
    ["a chunk", "le chunk 11-20"],
  ])("fails with history_timeout when %s times out twice", async (kind, what) => {
    const { source } = sourceOf(frameOf(3), [placeEntry(3, 3, 3, 7)]);
    const chunks: ChunkReader = {
      listChunks: async () => {
        if (kind === "the list") throw new HistoryTimeoutError(what);
        return {
          total: 1,
          chunks: (async function* (): AsyncGenerator<DownloadedChunk> {
            yield* [];
            throw new HistoryTimeoutError(what);
          })(),
        };
      },
    };

    expect(await exportTimelapse({ source, chunks }, "canvas-1")).toEqual({
      ok: false,
      error: "history_timeout",
    });
    expect(console.info).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`history_timeout \\(${what}\\)$`)),
    );
  });

  // Si la lecture échoue autrement, alors l'erreur remonte, et le journal la nomme.
  it("lets any other failure through, and logs it", async () => {
    const { source } = sourceOf(frameOf(3), [placeEntry(3, 3, 3, 7)]);
    const chunks: ChunkReader = {
      listChunks: async () => {
        throw new Error("Convex est tombé");
      },
    };

    await expect(exportTimelapse({ source, chunks }, "canvas-1")).rejects.toThrow("Convex est tombé");
    expect(console.info).toHaveBeenCalledWith(expect.stringMatching(/, error$/));
  });

  // Quand le GIF est lu, alors une ligne de journal dit la fresque (8 caractères), le flux, les chunks, les octets et l'issue.
  it("logs one line per GIF, without an account id", async () => {
    const stream = sourceOf(frameOf(3), [
      placeEntry(1, 1, 1, 5),
      placeEntry(2, 2, 2, 6),
      placeEntry(3, 3, 3, 7),
    ]);
    await exportTimelapse({ source: stream.source, chunks: readerOf([]) }, "46258c11-aaaa-bbbb");

    const trimmed = sourceOf(frameOf(3), [placeEntry(3, 3, 3, 7)]);
    const chunks = readerOf([chunkOf([placeEntry(1, 1, 1, 5), placeEntry(2, 2, 2, 6)])]);
    await exportTimelapse({ source: trimmed.source, chunks }, "46258c11-aaaa-bbbb");

    const lines = vi.mocked(console.info).mock.calls.map(([line]) => String(line));
    expect(lines[0]).toMatch(/^timelapse 46258c11 : flux 3 poses depuis v1, 0 chunk \(0 o\), \d+ ms, ok$/);
    expect(lines[1]).toMatch(/^timelapse 46258c11 : flux 1 pose depuis v3, 1 chunk \(10 o\), \d+ ms, ok$/);
    expect(lines).toHaveLength(2);
  });
});

describe("exportTimelapseAsDeveloper (le rôle se vérifie côté serveur, §10.3)", () => {
  const verifierOf = (userId: string | null): SessionVerifier => ({
    verify: async () => (userId === null ? null : { userId, login: "login", displayName: "Nom" }),
  });

  // Quand le développeur demande le GIF, alors le web le rend.
  it("serves the developer", async () => {
    const { source } = sourceOf(frameOf(1), [placeEntry(1, 1, 1, 5)]);

    const result = await exportTimelapseAsDeveloper(
      { source, chunks: readerOf([]), verifier: verifierOf(DEVELOPER_USER_ID) },
      "cookie",
      "canvas-1",
    );

    expect(result.ok).toBe(true);
  });

  // Si la session n'est pas celle du développeur, alors le web refuse (`forbidden`) sans lire ni Redis ni Convex.
  it("refuses anyone else without reading anything", async () => {
    const getFrame = vi.fn(async () => frameOf(1));
    const listChunks = vi.fn(async () => ({
      total: 0,
      chunks: (async function* (): AsyncGenerator<DownloadedChunk> {
        yield* [];
      })(),
    }));

    const result = await exportTimelapseAsDeveloper(
      {
        source: { getFrame, listStreamEntries: sourceOf(null, []).listStreamEntries },
        chunks: { listChunks },
        verifier: verifierOf("42"),
      },
      "cookie",
      "canvas-1",
    );

    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(getFrame).not.toHaveBeenCalled();
    expect(listChunks).not.toHaveBeenCalled();
  });

  // Si personne n'est connecté, alors le web refuse (`unauthenticated`).
  it("refuses a guest", async () => {
    const { source } = sourceOf(frameOf(1), []);

    expect(
      await exportTimelapseAsDeveloper(
        { source, chunks: readerOf([]), verifier: verifierOf(null) },
        undefined,
        "canvas-1",
      ),
    ).toEqual({ ok: false, error: "unauthenticated" });
  });
});
