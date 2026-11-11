// JOURNAL 2026-11-11 : le GIF timelapse d'une fresque, pour le développeur seul. Le serveur rejoue l'historique (le flux de Redis d'abord,
// puis les chunks de Convex seulement pour ce que le flux n'a plus) ; le navigateur dessine et encode les images.

import { type ChunkEntry, HistoryTimeoutError } from "@liveplace/domain/chunk";
import type { ChunkReader, SessionVerifier, TimelapseSource } from "@liveplace/domain/ports";
import { createTimelapseBuilder, type Timelapse, type TimelapseRefusal } from "@liveplace/domain/timelapse";
import type { Result } from "@liveplace/shared";
import { withDeveloperSession } from "./badges-section";

export type ExportTimelapseDeps = { source: TimelapseSource; chunks: ChunkReader };

// `initial` et `changes` en base64 : les octets de `Timelapse.initial` et de `Timelapse.changes` (des entiers de 32 bits, petit
// boutiste). Le navigateur les redécode, puis `planStills` dit quelles images montrer.
export type TimelapseWire = { width: number; height: number; initial: string; changes: string };

// `cancelled` : l'appelant a annulé la requête. `history_timeout` : un fichier de l'historique n'a pas répondu, deux fois.
export type ExportTimelapseRefusal = TimelapseRefusal | "canvas_not_found" | "history_timeout" | "cancelled";

// `stream` : le flux est lu (`poses`, les poses qu'il porte). `chunks` : `done` chunks lus sur `total`, dès que le total est connu.
export type TimelapseProgress =
  | { step: "stream"; poses: number }
  | { step: "chunks"; done: number; total: number };

export type ExportTimelapseOptions = {
  signal?: AbortSignal;
  onProgress?: (progress: TimelapseProgress) => void;
};

const toWire = ({ width, height, initial, changes }: Timelapse): TimelapseWire => ({
  width,
  height,
  initial: Buffer.from(initial).toString("base64"),
  changes: Buffer.from(changes.buffer, changes.byteOffset, changes.byteLength).toString("base64"),
});

// Ce qu'une lecture a lu, pour sa ligne de journal.
type Reading = { poses: number; firstVersion: number | null; chunks: number; bytes: number };

const journalLine = (
  canvasId: string,
  { poses, firstVersion, chunks, bytes }: Reading,
  milliseconds: number,
  outcome: string,
): string =>
  `timelapse ${canvasId.slice(0, 8)} : flux ${poses} ${poses > 1 ? "poses" : "pose"}${
    firstVersion === null ? "" : ` depuis v${firstVersion}`
  }, ${chunks} ${chunks > 1 ? "chunks" : "chunk"} (${bytes} o), ${milliseconds} ms, ${outcome}`;

// Tout le flux en mémoire (20 100 entrées au plus), avant le moindre chunk : une pose qui rogne son début pendant les téléchargements
// ne laisse plus de trou.
async function listStream(source: TimelapseSource, canvasId: string): Promise<ChunkEntry[]> {
  const entries: ChunkEntry[] = [];
  for await (const entry of source.listStreamEntries(canvasId, 0)) entries.push(entry);
  return entries;
}

// Les chunks d'avant la première version du flux (tous, si le flux est vide) : ce que le flux n'a plus. Au-delà de cette version, le flux fait foi.
async function addChunks(
  chunks: ChunkReader,
  canvasId: string,
  builder: ReturnType<typeof createTimelapseBuilder>,
  streamStart: number | null,
  { signal, onProgress }: ExportTimelapseOptions,
  reading: Reading,
): Promise<void> {
  const listing = await chunks.listChunks(canvasId, {
    ...(streamStart === null ? {} : { beforeVersion: streamStart }),
    ...(signal ? { signal } : {}),
  });
  onProgress?.({ step: "chunks", done: 0, total: listing.total });
  for await (const { chunk, bytes } of listing.chunks) {
    signal?.throwIfAborted();
    reading.chunks += 1;
    reading.bytes += bytes;
    if (builder.isFull()) break;
    for (const entry of chunk?.entries ?? [])
      if (streamStart === null || entry[0] < streamStart) builder.add(entry);
    onProgress?.({ step: "chunks", done: reading.chunks, total: listing.total });
  }
}

async function replay(
  deps: ExportTimelapseDeps,
  canvasId: string,
  options: ExportTimelapseOptions,
  reading: Reading,
): Promise<Result<TimelapseWire, ExportTimelapseRefusal>> {
  const { signal, onProgress } = options;
  signal?.throwIfAborted();
  const frame = await deps.source.getFrame(canvasId);
  if (!frame) return { ok: false, error: "canvas_not_found" };
  const builder = createTimelapseBuilder(frame);
  const stream = await listStream(deps.source, canvasId);
  reading.firstVersion = stream[0]?.[0] ?? null;
  reading.poses = stream.filter(([, , event]) => event.kind === "place").length;
  onProgress?.({ step: "stream", poses: reading.poses });
  if (reading.firstVersion === null || reading.firstVersion > 1)
    await addChunks(deps.chunks, canvasId, builder, reading.firstVersion, options, reading);
  signal?.throwIfAborted();
  for (const entry of stream) {
    if (builder.isFull()) break;
    builder.add(entry);
  }
  const timelapse = builder.finish();
  return timelapse.ok ? { ok: true, value: toWire(timelapse.value) } : timelapse;
}

// Une ligne de journal par GIF, réussi ou non : de quoi voir en prod ce qui a été lu et en combien de temps.
export async function exportTimelapse(
  deps: ExportTimelapseDeps,
  canvasId: string,
  options: ExportTimelapseOptions = {},
): Promise<Result<TimelapseWire, ExportTimelapseRefusal>> {
  const startedAt = Date.now();
  const reading: Reading = { poses: 0, firstVersion: null, chunks: 0, bytes: 0 };
  let outcome = "error";
  try {
    const result = await replay(deps, canvasId, options, reading);
    outcome = result.ok ? "ok" : result.error;
    return result;
  } catch (error) {
    if (options.signal?.aborted) {
      outcome = "cancelled";
      return { ok: false, error: "cancelled" };
    }
    if (!(error instanceof HistoryTimeoutError)) throw error;
    outcome = `history_timeout (${error.what})`;
    return { ok: false, error: "history_timeout" };
  } finally {
    console.info(journalLine(canvasId, reading, Date.now() - startedAt, outcome));
  }
}

// Le développeur seul : le rôle se vérifie sur la session, avant la moindre lecture.
export const exportTimelapseAsDeveloper = (
  deps: ExportTimelapseDeps & { verifier: SessionVerifier },
  cookieHeader: string | undefined,
  canvasId: string,
  options: ExportTimelapseOptions = {},
) => withDeveloperSession(deps.verifier, cookieHeader, () => exportTimelapse(deps, canvasId, options));
