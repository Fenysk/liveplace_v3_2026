import { CHUNK_SCHEMA_VERSION, type Chunk, HistoryTimeoutError } from "@liveplace/domain/chunk";
import type { DownloadedChunk } from "@liveplace/domain/ports";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHUNKS_IN_FLIGHT, type ChunkFileUrl, type ChunkSource, createChunkListing } from "./chunk-reader";

const TIMEOUT_MS = 20; // un délai court : les vrais 20 s ne se testent pas

const fileOf = (index: number): ChunkFileUrl => ({
  url: `https://files.test/${index}`,
  fromVersion: index * 10 + 1,
  toVersion: index * 10 + 10,
});

const chunkOf = ({ fromVersion, toVersion }: ChunkFileUrl): Chunk => ({
  schemaVersion: CHUNK_SCHEMA_VERSION,
  canvasId: "canvas-1",
  fromVersion,
  toVersion,
  entries: [],
});

const downloaded = (file: ChunkFileUrl): DownloadedChunk => ({ chunk: chunkOf(file), bytes: 100 });

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Une source dont les pages viennent d'un tableau de pages, et dont `getChunk` est celui du test.
const sourceOf = (
  pages: ChunkFileUrl[][],
  getChunk: ChunkSource["getChunk"],
): ChunkSource & { listPage: ReturnType<typeof vi.fn<ChunkSource["listPage"]>> } => ({
  listPage: vi.fn(async (cursor) => {
    const at = cursor === null ? 0 : Number(cursor);
    return { files: pages[at] ?? [], next: at + 1 < pages.length ? String(at + 1) : null };
  }),
  getChunk,
});

const collect = async (chunks: AsyncIterable<DownloadedChunk>) => {
  const versions: number[] = [];
  for await (const { chunk } of chunks) versions.push(chunk?.fromVersion ?? -1);
  return versions;
};

// Un fichier qui ne répond jamais, sauf par l'arrêt de son signal.
const hang = (signal: AbortSignal) =>
  new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(signal.reason)));

describe("createChunkListing (JOURNAL 2026-11-11)", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Quand les pages se suivent, alors le total est connu avant le premier téléchargement.
  it("lists every page before downloading the first file", async () => {
    const files = [0, 1, 2, 3, 4].map(fileOf);
    const getChunk = vi.fn(async (file: ChunkFileUrl) => downloaded(file));
    const source = sourceOf([files.slice(0, 2), files.slice(2, 4), files.slice(4)], getChunk);

    const listing = await createChunkListing(source, { beforeVersion: 500 });

    expect(listing.total).toBe(5);
    expect(getChunk).not.toHaveBeenCalled();
    expect(source.listPage.mock.calls.map(([cursor, before]) => [cursor, before])).toEqual([
      [null, 500],
      ["1", 500],
      ["2", 500],
    ]);
    expect(await collect(listing.chunks)).toEqual(files.map(({ fromVersion }) => fromVersion));
  });

  // Quand les téléchargements finissent dans le désordre, alors les chunks sortent dans l'ordre des versions.
  it("keeps the order of the versions when the downloads finish out of order", async () => {
    const files = Array.from({ length: 14 }, (_, index) => fileOf(index));
    const source = sourceOf([files], async (file, signal) => {
      await wait((14 - file.fromVersion / 10) * 2); // les derniers fichiers finissent les premiers
      signal.throwIfAborted();
      return downloaded(file);
    });

    const listing = await createChunkListing(source, { timeoutMs: 1_000 });

    expect(await collect(listing.chunks)).toEqual(files.map(({ fromVersion }) => fromVersion));
  });

  // Tant que le lecteur avance, alors jamais plus de six fichiers ne sont en vol ou décodés en attente.
  it("never holds more than six files in flight or decoded and waiting", async () => {
    const files = Array.from({ length: 20 }, (_, index) => fileOf(index));
    let started = 0;
    let received = 0;
    let widest = 0;
    const source = sourceOf([files], async (file) => {
      started += 1;
      widest = Math.max(widest, started - received);
      await wait(file.fromVersion % 3);
      return downloaded(file);
    });

    const listing = await createChunkListing(source, { timeoutMs: 1_000 });
    for await (const _ of listing.chunks) {
      received += 1;
      await wait(1);
    }

    expect(CHUNKS_IN_FLIGHT).toBe(6);
    expect(started).toBe(20);
    expect(widest).toBe(6);
  });

  // Si un fichier dépasse le délai une fois, alors un nouvel essai le rend, sans trou.
  it("tries a file again once after a timeout", async () => {
    const files = [0, 1, 2].map(fileOf);
    let attempts = 0;
    const source = sourceOf([files], async (file, signal) => {
      if (file.fromVersion === 11 && ++attempts === 1) return hang(signal);
      return downloaded(file);
    });

    const listing = await createChunkListing(source, { timeoutMs: TIMEOUT_MS });

    expect(await collect(listing.chunks)).toEqual([1, 11, 21]);
    expect(attempts).toBe(2);
  });

  // Si un fichier dépasse deux fois le délai, alors la lecture échoue par l'erreur nommée, avec l'intervalle du chunk.
  it("fails with the named error once a file timed out twice", async () => {
    const files = [0, 1, 2].map(fileOf);
    let attempts = 0;
    const source = sourceOf([files], async (file, signal) => {
      if (file.fromVersion !== 11) return downloaded(file);
      attempts += 1;
      return hang(signal);
    });

    const listing = await createChunkListing(source, { timeoutMs: TIMEOUT_MS });
    const read = collect(listing.chunks);

    await expect(read).rejects.toBeInstanceOf(HistoryTimeoutError);
    await expect(read).rejects.toThrow("11-20");
    expect(attempts).toBe(2);
    expect(console.error).toHaveBeenCalledTimes(2);
  });

  // Si la requête de la liste ne répond pas, alors elle aussi échoue par l'erreur nommée, après un nouvel essai.
  it("bounds the list request too, with the same named error", async () => {
    const source = sourceOf([], async (file) => downloaded(file));
    source.listPage.mockImplementation(() => new Promise<never>(() => undefined));

    await expect(createChunkListing(source, { timeoutMs: TIMEOUT_MS })).rejects.toBeInstanceOf(
      HistoryTimeoutError,
    );
    expect(source.listPage).toHaveBeenCalledTimes(2);
  });

  // Si la requête est annulée, alors plus aucun téléchargement ne part et ceux en vol s'arrêtent.
  it("starts no download after the signal aborts and stops the ones in flight", async () => {
    const files = Array.from({ length: 20 }, (_, index) => fileOf(index));
    const controller = new AbortController();
    const signals: AbortSignal[] = [];
    const source = sourceOf([files], async (file, signal) => {
      signals.push(signal);
      if (file.fromVersion > 11) return hang(signal); // les fichiers 3 et suivants restent en vol
      return downloaded(file);
    });

    const listing = await createChunkListing(source, { signal: controller.signal, timeoutMs: 1_000 });
    const versions: number[] = [];
    let startedAtAbort = 0;
    const read = (async () => {
      for await (const { chunk } of listing.chunks) {
        versions.push(chunk?.fromVersion ?? -1);
        if (versions.length === 2) {
          startedAtAbort = signals.length;
          controller.abort();
        }
      }
    })();

    await expect(read).rejects.toMatchObject({ name: "AbortError" });
    await wait(30);
    expect(versions).toEqual([1, 11]);
    expect(startedAtAbort).toBeGreaterThanOrEqual(CHUNKS_IN_FLIGHT);
    expect(signals).toHaveLength(startedAtAbort); // rien n'est parti après l'annulation
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  // Si la requête est déjà annulée, alors aucune page n'est demandée.
  it("asks for nothing when the signal is already aborted", async () => {
    const source = sourceOf([[fileOf(0)]], async (file) => downloaded(file));

    await expect(createChunkListing(source, { signal: AbortSignal.abort() })).rejects.toBeDefined();
    expect(source.listPage).not.toHaveBeenCalled();
  });

  // Si le fichier est illisible, alors son chunk est `null` et la lecture continue (le journal en garde la trace).
  it("passes an unreadable chunk through as null", async () => {
    const files = [0, 1].map(fileOf);
    const source = sourceOf([files], async (file) =>
      file.fromVersion === 1 ? { chunk: null, bytes: 7 } : downloaded(file),
    );

    const listing = await createChunkListing(source, {});

    expect(await collect(listing.chunks)).toEqual([-1, 11]);
  });
});
