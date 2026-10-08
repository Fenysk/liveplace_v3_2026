// Écart §4.2 (JOURNAL 2026-10-08) : au rendu d'une page, un canvas que Redis a perdu et dont ce scope garde une sauvegarde se dit
// « en récupération » tout de suite, sans attendre que le worker voie la perte (5 s au plus). Un seul `EXISTS` quand il vit.

import type { RecoveryMarks, RecoveryStore } from "@liveplace/domain/ports";

export type MarkRecoveringDeps = {
  marks: RecoveryMarks;
  recovery: Pick<RecoveryStore, "hasSnapshot"> | undefined; // absent sans `DURABLE_SCOPE` : le rendu est celui d'avant
};

// Une panne n'empêche jamais la page : sans marque, elle dirait « introuvable » quelques secondes, puis le worker la pose.
export async function markRecoveringIfLost(
  { marks, recovery }: MarkRecoveringDeps,
  canvasId: string,
): Promise<void> {
  if (!recovery) return;
  try {
    if (await marks.isCanvasLive(canvasId)) return;
    if (await recovery.hasSnapshot(canvasId)) await marks.markRecovering(canvasId);
  } catch (error) {
    console.error("recovery : marque non posée au rendu", error);
  }
}
