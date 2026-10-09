// Écart §10.3 (JOURNAL 2026-10-06) : rouvrir une archive. Le canvas actif prend sa place dans les archives.
// Tout ce qui détruit (la progression de l'archive, qu'« Garder » remplace) vient après la décision de Convex.

import {
  bestEffort,
  commitToDurable,
  type ProgressChoice,
  refused,
  type SwitchDeps,
  type SwitchResult,
  succeeded,
  withOwnerLock,
} from "./canvas-switch";

export type ReopenRequest = { canvasId: string; progress: ProgressChoice };

const reopen = async (deps: SwitchDeps, ownerId: string, request: ReopenRequest): Promise<SwitchResult> => {
  // Avant d'écrire quoi que ce soit : c'est bien une archive de ce propriétaire, et il a un canvas actif à mettre à sa place.
  const { active, archives } = await deps.durable.listCanvasesForOwner(ownerId);
  const reopened = archives.find((archive) => archive.canvasId === request.canvasId);
  if (!reopened) return refused("not_archive");
  if (!active) return refused("not_active");
  const archive = await deps.redis.getCanvas(reopened.canvasId);
  if (!archive) return refused("failed");

  const archivedAt = deps.now();
  // Défaire : le canvas actif redevient actif, l'archive retrouve son successeur d'avant.
  const undo = async (): Promise<void> => {
    await bestEffort("canvas actif non défigé", () => deps.redis.markActive(active.canvasId));
    await bestEffort("successeur de l'archive non remis", () =>
      deps.redis.setSuccessor(reopened.canvasId, archive.successorId ?? null),
    );
  };

  try {
    // L'archive reste figée, sans successeur ; puis l'actif la désigne comme le sien, et lui laisse le commun.
    await deps.redis.setSuccessor(reopened.canvasId, null);
    await deps.redis.markArchived(active.canvasId, { archivedAt, successorId: reopened.canvasId });
    await deps.redis.copyShared(active.canvasId, reopened.canvasId);
  } catch (error) {
    console.error("canvases : réouverture défaite avant Convex", error);
    await undo();
    return refused("failed");
  }

  const committed = await commitToDurable(deps, ownerId, reopened.canvasId, () =>
    deps.durable.reopenArchive({
      ownerId,
      outgoingId: active.canvasId,
      reopenedId: reopened.canvasId,
      archivedAt,
      linkCode: active.linkCode ?? deps.randomLinkCode(),
    }),
  );
  if (!committed.ok) {
    await undo();
    return committed;
  }

  if (request.progress === "keep")
    await bestEffort("progression non recopiée", () =>
      deps.redis.copyProgress(active.canvasId, reopened.canvasId),
    );
  await bestEffort("signalements non classés", () => deps.redis.settleReports(active.canvasId));
  // La copie de l'archive égale Convex avant qu'elle ne serve : son thème, qui s'affiche alors à tous (Écart §8.1, JOURNAL 2026-10-07).
  await bestEffort("thème de l'archive rouverte non copié", () =>
    deps.redis.setTheme(reopened.canvasId, reopened.theme),
  );
  await bestEffort("archive non rouverte", () => deps.redis.markActive(reopened.canvasId));
  await bestEffort("statut de l'archive quittée non publié", () =>
    deps.redis.publishStatus(active.canvasId, "archived"),
  );
  await bestEffort("statut de l'archive rouverte non publié", () =>
    deps.redis.publishStatus(reopened.canvasId, "active"),
  );
  return succeeded;
};

export function reopenCanvas(
  deps: SwitchDeps,
  ownerId: string,
  request: ReopenRequest,
): Promise<SwitchResult> {
  return withOwnerLock(deps, ownerId, () => reopen(deps, ownerId, request));
}
