// JOURNAL 2026-11-11 : le GIF timelapse d'une fresque, pour le développeur seul. Le serveur rejoue l'historique (les chunks de Convex
// un par un, puis la fin du flux) ; le navigateur dessine et encode les images.

import type { ChunkReader, SessionVerifier, TimelapseSource } from "@liveplace/domain/ports";
import { createTimelapseBuilder, type Timelapse, type TimelapseRefusal } from "@liveplace/domain/timelapse";
import type { Result } from "@liveplace/shared";
import { withDeveloperSession } from "./badges-section";

export type ExportTimelapseDeps = { source: TimelapseSource; chunks: ChunkReader };

// `initial` et `changes` en base64 : les octets de `Timelapse.initial` et de `Timelapse.changes` (des entiers de 32 bits, petit
// boutiste). Le navigateur les redécode, puis `planStills` dit quelles images montrer.
export type TimelapseWire = { width: number; height: number; initial: string; changes: string };

export type ExportTimelapseRefusal = TimelapseRefusal | "canvas_not_found";

const toWire = ({ width, height, initial, changes }: Timelapse): TimelapseWire => ({
  width,
  height,
  initial: Buffer.from(initial).toString("base64"),
  changes: Buffer.from(changes.buffer, changes.byteOffset, changes.byteLength).toString("base64"),
});

// Les chunks d'abord, un par un (la mémoire n'en garde qu'un), puis le flux depuis la dernière version vue.
export async function exportTimelapse(
  deps: ExportTimelapseDeps,
  canvasId: string,
): Promise<Result<TimelapseWire, ExportTimelapseRefusal>> {
  const frame = await deps.source.getFrame(canvasId);
  if (!frame) return { ok: false, error: "canvas_not_found" };
  const builder = createTimelapseBuilder(frame);
  for await (const chunk of deps.chunks.listChunks(canvasId)) {
    if (builder.isFull()) break;
    for (const entry of chunk.entries) builder.add(entry);
  }
  for await (const entry of deps.source.listStreamEntries(canvasId, builder.lastVersion())) {
    if (builder.isFull()) break;
    builder.add(entry);
  }
  const timelapse = builder.finish();
  return timelapse.ok ? { ok: true, value: toWire(timelapse.value) } : timelapse;
}

// Le développeur seul : le rôle se vérifie sur la session, avant la moindre lecture.
export const exportTimelapseAsDeveloper = (
  deps: ExportTimelapseDeps & { verifier: SessionVerifier },
  cookieHeader: string | undefined,
  canvasId: string,
) => withDeveloperSession(deps.verifier, cookieHeader, () => exportTimelapse(deps, canvasId));
