// La lecture des chunks d'un canvas (JOURNAL 2026-11-11) : la liste d'abord, puis les fichiers six à la fois, rendus dans l'ordre.

import { HistoryTimeoutError } from "@liveplace/domain/chunk";
import type { ChunkListing, DownloadedChunk } from "@liveplace/domain/ports";

export const CHUNK_FILES_PER_PAGE = 100; // le maximum de la requête Convex
export const CHUNKS_IN_FLIGHT = 6; // fichiers en vol ou décodés en attente de leur tour
export const CHUNK_TIMEOUT_MS = 20_000;
const ATTEMPTS = 2; // un délai dépassé se retente une fois

export type ChunkFileUrl = { url: string | null; fromVersion: number; toVersion: number };
export type ChunkFilesPage = { files: ChunkFileUrl[]; next: string | null };

// Ce que la lecture demande au concret : une page d'adresses, puis un fichier téléchargé et décodé.
export type ChunkSource = {
  listPage(cursor: string | null, beforeVersion: number | undefined): Promise<ChunkFilesPage>;
  getChunk(file: ChunkFileUrl, signal: AbortSignal): Promise<DownloadedChunk>;
};

export type ChunkListingOptions = { beforeVersion?: number; signal?: AbortSignal; timeoutMs?: number };

type Bounds = { signal: AbortSignal | undefined; timeoutMs: number };

// Le travail s'arrête avec le signal, même quand il ne sait pas s'y arrêter (la requête Convex n'en prend pas).
const raceAbort = <Value>(work: Promise<Value>, signal: AbortSignal): Promise<Value> =>
  new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
    if (signal.aborted) onAbort();
  });

// Un travail borné par le délai et par le signal de l'appelant : un délai dépassé se retente une fois, puis lève l'erreur nommée.
async function withDeadline<Value>(
  run: (signal: AbortSignal) => Promise<Value>,
  what: string,
  { signal, timeoutMs }: Bounds,
): Promise<Value> {
  for (let attempt = 1; ; attempt++) {
    const timeout = AbortSignal.timeout(timeoutMs);
    const bounded = signal ? AbortSignal.any([signal, timeout]) : timeout;
    try {
      return await raceAbort(run(bounded), bounded);
    } catch (error) {
      if (!timeout.aborted || signal?.aborted) throw error; // une autre panne, ou l'appelant a annulé
      console.error(`${what} : sans réponse en ${timeoutMs} ms (essai ${attempt} sur ${ATTEMPTS})`);
      if (attempt === ATTEMPTS) throw new HistoryTimeoutError(what);
    }
  }
}

// Les fichiers dans l'ordre des versions, au plus `CHUNKS_IN_FLIGHT` à la fois : un fichier de plus part quand le premier est rendu.
async function* downloadInOrder(
  files: readonly ChunkFileUrl[],
  source: ChunkSource,
  { signal, timeoutMs }: Bounds,
): AsyncGenerator<DownloadedChunk> {
  const stop = new AbortController();
  const stopped = signal ? AbortSignal.any([signal, stop.signal]) : stop.signal;
  const pending: Promise<DownloadedChunk>[] = [];
  let next = 0;
  try {
    for (;;) {
      signal?.throwIfAborted();
      const launched = files.slice(next, next + CHUNKS_IN_FLIGHT - pending.length);
      next += launched.length;
      for (const file of launched) {
        const what = `le chunk ${file.fromVersion}-${file.toVersion}`;
        const download = withDeadline((fileSignal) => source.getChunk(file, fileSignal), what, {
          signal: stopped,
          timeoutMs,
        });
        download.catch(() => undefined); // son échec se lève à son tour, dans l'ordre : jamais un rejet sans lecteur
        pending.push(download);
      }
      const head = pending.shift();
      if (!head) return;
      yield await head;
    }
  } finally {
    stop.abort(); // l'appelant a fini, ou un fichier a échoué : ceux en vol s'arrêtent
  }
}

export async function createChunkListing(
  source: ChunkSource,
  { beforeVersion, signal, timeoutMs = CHUNK_TIMEOUT_MS }: ChunkListingOptions,
): Promise<ChunkListing> {
  const bounds = { signal, timeoutMs };
  const files: ChunkFileUrl[] = [];
  let cursor: string | null = null;
  do {
    signal?.throwIfAborted();
    const at: string | null = cursor;
    const page: ChunkFilesPage = await withDeadline(
      () => source.listPage(at, beforeVersion),
      "la liste des chunks",
      bounds,
    );
    files.push(...page.files);
    cursor = page.next;
  } while (cursor !== null);
  return { total: files.length, chunks: downloadInOrder(files, source, bounds) };
}
