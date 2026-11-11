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
import type { Tombstones } from "@liveplace/domain/snapshot";
import type { TimelapseFrame } from "@liveplace/domain/timelapse";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type TimelapseResponseDeps, timelapseResponse } from "./timelapse-response";

const PUBLIC_URL = "https://liveplace.tv";

const NO_TOMBSTONES: Tombstones = {
  clearedVersions: new Map(),
  clearedPlacements: new Set(),
  clearedRanges: new Map(),
};

const placeEntry = (version: number): ChunkEntry => [
  version,
  `p${String(version).padStart(8, "0")}`,
  {
    version,
    kind: "place",
    authorId: "author-a",
    occurredAt: 1_000 + version,
    cells: [
      { x: version, y: version, colorIndex: version + 4, previousColorIndex: 0, placedAt: 1_000 + version },
    ],
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
const frame: TimelapseFrame = (() => {
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
    maxVersion: 3,
    piles,
    tombstones: NO_TOMBSTONES,
  };
})();

const verifierOf = (userId: string | null): SessionVerifier => ({
  verify: vi.fn(async () => (userId === null ? null : { userId, login: "login", displayName: "Nom" })),
});

type Setup = {
  userId?: string | null;
  getFrame?: () => Promise<TimelapseFrame | null>;
  stream?: ChunkEntry[];
  listChunks?: ChunkReader["listChunks"];
};

// Comme Convex : seulement les chunks qui commencent avant `beforeVersion`.
const convexOf = (chunks: Chunk[]): ChunkReader["listChunks"] =>
  vi.fn(async (_canvasId, options): Promise<ChunkListing> => {
    const wanted = chunks.filter(({ fromVersion }) => fromVersion < (options?.beforeVersion ?? Infinity));
    return {
      total: wanted.length,
      chunks: (async function* (): AsyncGenerator<DownloadedChunk> {
        for (const chunk of wanted) yield { chunk, bytes: 10 };
      })(),
    };
  });

const setup = (options: Setup = {}) => {
  const stream = options.stream ?? [placeEntry(1), placeEntry(2), placeEntry(3)];
  const getFrame = vi.fn(options.getFrame ?? (async () => frame));
  const listStreamEntries = vi.fn(async function* (_canvasId: string, afterVersion: number) {
    for (const entry of stream) if (entry[0] > afterVersion) yield entry;
  });
  const listChunks = vi.fn(options.listChunks ?? convexOf([]));
  const source: TimelapseSource = { getFrame, listStreamEntries };
  const verifier = verifierOf(options.userId === undefined ? DEVELOPER_USER_ID : options.userId);
  const deps: TimelapseResponseDeps = { source, chunks: { listChunks }, verifier, publicUrl: PUBLIC_URL };
  return { deps, getFrame, listStreamEntries, listChunks, verifier };
};

type PostOptions = { origin?: string | null; body?: string; signal?: AbortSignal };

const post = ({ origin = PUBLIC_URL, body = '{"canvasId":"canvas-1"}', signal }: PostOptions = {}) =>
  new Request(`${PUBLIC_URL}/dev/timelapse`, {
    method: "POST",
    headers: {
      cookie: "lp_session=abc",
      "content-type": "application/json",
      ...(origin === null ? {} : { origin }),
    },
    body,
    ...(signal ? { signal } : {}),
  });

const linesOf = async (response: Response): Promise<unknown[]> =>
  (await response.text())
    .split("\n")
    .filter((text) => text !== "")
    .map((text): unknown => JSON.parse(text));

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /dev/timelapse (JOURNAL 2026-11-11)", () => {
  // Quand le flux commence à la version 1, alors les lignes arrivent dans l'ordre : le flux, puis `done`, sans étape de chunks.
  it("sends the stream line then done when the stream starts at version 1", async () => {
    const { deps, listChunks } = setup();

    const response = await timelapseResponse(deps, post());
    const lines = await linesOf(response);

    expect(response.status).toBe(200);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual({ kind: "progress", step: "stream", poses: 3 });
    expect(lines[1]).toMatchObject({ kind: "done", value: { width: 10, height: 10 } });
    expect(listChunks).not.toHaveBeenCalled();
  });

  // Quand le flux ne dit pas tout, alors le flux, chaque chunk (dès le total connu) puis `done` arrivent dans l'ordre.
  it("sends the stream, every chunk and done in order", async () => {
    const { deps } = setup({
      stream: [placeEntry(2), placeEntry(3)],
      listChunks: convexOf([chunkOf([placeEntry(1), placeEntry(2)])]),
    });

    const lines = await linesOf(await timelapseResponse(deps, post()));

    expect(lines.slice(0, 3)).toEqual([
      { kind: "progress", step: "stream", poses: 2 },
      { kind: "progress", step: "chunks", done: 0, total: 1 },
      { kind: "progress", step: "chunks", done: 1, total: 1 },
    ]);
    expect(lines[3]).toMatchObject({ kind: "done" });
    expect(lines).toHaveLength(4);
  });

  // Quand la réponse part, alors aucun proxy ni cache ne garde les lignes, et le type dit NDJSON.
  it("is a non-buffered, non-cached NDJSON stream", async () => {
    const { deps } = setup();

    const response = await timelapseResponse(deps, post());
    await response.text();

    expect(response.headers.get("content-type")).toBe("application/x-ndjson; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store, no-transform");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
  });

  // Si personne n'est connecté, alors 401 et une ligne `failed`, sans rien lire.
  it("refuses a guest with 401 and reads nothing", async () => {
    const { deps, getFrame, listStreamEntries, listChunks } = setup({ userId: null });

    const response = await timelapseResponse(deps, post());

    expect(response.status).toBe(401);
    expect(await linesOf(response)).toEqual([{ kind: "failed", error: "unauthenticated" }]);
    expect(getFrame).not.toHaveBeenCalled();
    expect(listStreamEntries).not.toHaveBeenCalled();
    expect(listChunks).not.toHaveBeenCalled();
  });

  // Si la session n'est pas celle du développeur, alors 403 et une ligne `failed`, sans rien lire.
  it("refuses anyone but the developer with 403 and reads nothing", async () => {
    const { deps, getFrame, listStreamEntries, listChunks } = setup({ userId: "42" });

    const response = await timelapseResponse(deps, post());

    expect(response.status).toBe(403);
    expect(await linesOf(response)).toEqual([{ kind: "failed", error: "forbidden" }]);
    expect(getFrame).not.toHaveBeenCalled();
    expect(listStreamEntries).not.toHaveBeenCalled();
    expect(listChunks).not.toHaveBeenCalled();
  });

  // Si la requête ne vient pas de notre page, alors 403 : la session n'est même pas vérifiée.
  it("refuses a request that does not come from our page, before anything else", async () => {
    const { deps, verifier, getFrame } = setup();

    for (const origin of ["https://beta.liveplace.tv", "https://evil.example", null]) {
      const response = await timelapseResponse(deps, post({ origin }));
      expect(response.status).toBe(403);
      expect(await linesOf(response)).toEqual([{ kind: "failed", error: "forbidden" }]);
    }
    expect(verifier.verify).not.toHaveBeenCalled();
    expect(getFrame).not.toHaveBeenCalled();
  });

  // Si le corps n'est pas `{ canvasId }`, alors 400, sans rien lire.
  it("refuses a body that is not a canvas id with 400", async () => {
    const { deps, getFrame } = setup();

    for (const body of ["not json", "{}", '{"canvasId":""}', '{"canvasId":42}']) {
      const response = await timelapseResponse(deps, post({ body }));
      expect(response.status).toBe(400);
      expect(await linesOf(response)).toEqual([{ kind: "failed", error: "invalid_request" }]);
    }
    expect(getFrame).not.toHaveBeenCalled();
  });

  // Si la fresque n'existe pas, alors une ligne `failed` la nomme.
  it("sends a failed line when the canvas does not exist", async () => {
    const { deps } = setup({ getFrame: async () => null });

    expect(await linesOf(await timelapseResponse(deps, post()))).toEqual([
      { kind: "failed", error: "canvas_not_found" },
    ]);
  });

  // Si un fichier de l'historique ne répond pas, alors le flux a déjà dit où il en était et finit par `failed` `history_timeout`.
  it("ends with a history_timeout line when a file of the history never answers", async () => {
    const { deps } = setup({
      stream: [placeEntry(2), placeEntry(3)],
      listChunks: vi.fn(async () => ({
        total: 4,
        chunks: (async function* (): AsyncGenerator<DownloadedChunk> {
          yield { chunk: chunkOf([placeEntry(1)]), bytes: 10 };
          throw new HistoryTimeoutError("chunk 2");
        })(),
      })),
    });

    const lines = await linesOf(await timelapseResponse(deps, post()));

    expect(lines).toEqual([
      { kind: "progress", step: "stream", poses: 2 },
      { kind: "progress", step: "chunks", done: 0, total: 4 },
      { kind: "progress", step: "chunks", done: 1, total: 4 },
      { kind: "failed", error: "history_timeout" },
    ]);
  });

  // Si Redis ou Convex lève une exception imprévue, alors une dernière ligne `failed` générique, et le flux se ferme.
  it("ends with a generic failed line and closes the stream when the read throws", async () => {
    const { deps } = setup({
      stream: [placeEntry(2), placeEntry(3)],
      listChunks: vi.fn(async () => {
        throw new Error("convex down");
      }),
    });

    const lines = await linesOf(await timelapseResponse(deps, post()));

    expect(lines).toEqual([
      { kind: "progress", step: "stream", poses: 2 },
      { kind: "failed", error: "failed" },
    ]);
    expect(console.error).toHaveBeenCalledWith("timelapse : lecture en échec", expect.any(Error));
  });

  // Si l'exception arrive avant la moindre ligne, alors la réponse rend quand même une ligne `failed` et un flux fermé.
  it("answers with a failed line when the read throws before any progress", async () => {
    const { deps } = setup({
      getFrame: async () => {
        throw new Error("redis down");
      },
    });

    const response = await timelapseResponse(deps, post());

    expect(await linesOf(response)).toEqual([{ kind: "failed", error: "failed" }]);
  });
});

describe("POST /dev/timelapse : fermer la connexion arrête la lecture (JOURNAL 2026-11-11)", () => {
  // Un fournisseur de chunks qui attend l'annulation, et garde le signal reçu.
  const waitingForCancel = () => {
    const received: { signal?: AbortSignal } = {};
    const listChunks: ChunkReader["listChunks"] = vi.fn(async (_canvasId, options) => {
      if (options?.signal) received.signal = options.signal;
      await new Promise<void>((resolve) => options?.signal?.addEventListener("abort", () => resolve()));
      return {
        total: 1,
        chunks: (async function* (): AsyncGenerator<DownloadedChunk> {
          yield* [];
        })(),
      };
    });
    return { received, listChunks };
  };

  // Quand le signal de la requête s'annule, alors le signal de la lecture s'annule, et le flux finit par `failed` `cancelled`.
  it("passes the signal of the request to the read", async () => {
    const { received, listChunks } = waitingForCancel();
    const { deps } = setup({ stream: [placeEntry(2), placeEntry(3)], listChunks });
    const request = new AbortController();

    const response = await timelapseResponse(deps, post({ signal: request.signal }));
    expect(received.signal?.aborted).toBe(false);
    request.abort();
    const lines = await linesOf(response);

    expect(received.signal?.aborted).toBe(true);
    expect(lines.at(-1)).toEqual({ kind: "failed", error: "cancelled" });
  });

  // Quand le navigateur ferme la connexion (le corps est annulé), alors la lecture s'arrête et rien ne lève après.
  it("stops the read when the body is cancelled", async () => {
    const { received, listChunks } = waitingForCancel();
    const { deps } = setup({ stream: [placeEntry(2), placeEntry(3)], listChunks });

    const response = await timelapseResponse(deps, post());
    await response.body?.cancel();

    await vi.waitFor(() => expect(received.signal?.aborted).toBe(true));
    await vi.waitFor(() => expect(console.info).toHaveBeenCalledWith(expect.stringContaining("cancelled")));
  });
});
