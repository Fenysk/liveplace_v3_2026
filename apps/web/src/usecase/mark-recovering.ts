// Écart §4.2 (JOURNAL 2026-10-08) : au rendu d'une page, un canvas que Redis a perdu et dont ce scope garde une sauvegarde se dit
// « en récupération » tout de suite, sans attendre que le worker voie la perte. Un seul `EXISTS` quand il vit.
// Écart §4.2 (JOURNAL 2026-10-09) : une page déjà ouverte demande le même verdict quand le gateway ne trouve pas son canvas.

import type { RecoveryMarks, RecoveryStore } from "@liveplace/domain/ports";

export type MarkRecoveringDeps = {
  marks: RecoveryMarks;
  recovery: Pick<RecoveryStore, "hasSnapshot"> | undefined; // absent sans `DURABLE_SCOPE` : le rendu est celui d'avant
};

// `live` : Redis a sa `version` (prêt, ou le canvas neuf d'un archivage). `recovering` : perdu, une sauvegarde le ramènera.
// `missing` : perdu, rien ne le ramènera. `unknown` : Redis ou Convex n'ont pas répondu.
export type CanvasVerdict = "live" | "recovering" | "missing" | "unknown";

// Une panne n'empêche jamais la page : sans marque, le worker la pose au plus tard à son prochain tour.
export async function markRecoveringIfLost(
  { marks, recovery }: MarkRecoveringDeps,
  canvasId: string,
): Promise<CanvasVerdict> {
  if (!recovery) return "missing";
  try {
    if (await marks.isCanvasLive(canvasId)) return "live";
    if (!(await recovery.hasSnapshot(canvasId))) return "missing";
    await marks.markRecovering(canvasId);
    return "recovering";
  } catch (error) {
    console.error("recovery : marque non posée au rendu", error);
    return "unknown";
  }
}
