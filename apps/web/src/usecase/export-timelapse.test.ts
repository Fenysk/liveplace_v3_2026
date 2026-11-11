import { DEVELOPER_USER_ID, toCellKey } from "@liveplace/domain";
import { CHUNK_SCHEMA_VERSION, type Chunk, type ChunkEntry } from "@liveplace/domain/chunk";
import type { ChunkReader, SessionVerifier, TimelapseSource } from "@liveplace/domain/ports";
import type { Tombstones } from "@liveplace/domain/snapshot";
import type { TimelapseFrame } from "@liveplace/domain/timelapse";
import { describe, expect, it, vi } from "vitest";
import { exportTimelapse, exportTimelapseAsDeveloper } from "./export-timelapse";

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

const readerOf = (chunks: Chunk[]): ChunkReader => ({
  async *listChunks() {
    yield* chunks;
  },
});

// Les octets du base64 dans un tampon à eux : `Buffer.from` peut partager le tampon commun de Node.
const changesOf = (changes: string): number[] =>
  Array.from(new Uint32Array(Uint8Array.from(Buffer.from(changes, "base64")).buffer));

describe("exportTimelapse (JOURNAL 2026-11-11)", () => {
  // Quand l'historique est en chunks et en flux, alors le web rejoue les chunks puis la fin du flux, sans doublon.
  it("replays the chunks, then the stream after the last chunk, without a duplicate", async () => {
    const { source, listStreamEntries } = sourceOf(frameOf(3), [
      placeEntry(2, 2, 2, 6), // déjà dans le chunk : le flux reprend après la version 2
      placeEntry(3, 3, 3, 7),
    ]);
    const chunks = readerOf([chunkOf([placeEntry(1, 1, 1, 5), placeEntry(2, 2, 2, 6)])]);

    const result = await exportTimelapse({ source, chunks }, "canvas-1");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(listStreamEntries).toHaveBeenCalledWith("canvas-1", 2);
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
    const listChunks = vi.fn(async function* () {
      yield* [];
    });

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
