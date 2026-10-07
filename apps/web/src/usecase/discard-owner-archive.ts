// Écart §10.3 (JOURNAL 2026-10-06) : supprimer une archive. C'est définitif : son lien cesse de répondre.
// Convex tranche d'abord (jamais le canvas actif, jamais celui d'un autre) ; Redis suit, et les pages le savent avant
// que les clés partent.

import {
  bestEffort,
  refused,
  type SwitchDeps,
  type SwitchResult,
  succeeded,
  withOwnerLock,
} from "./canvas-switch";

export type DiscardRequest = { canvasId: string };

const discard = async (
  deps: SwitchDeps,
  ownerId: string,
  { canvasId }: DiscardRequest,
): Promise<SwitchResult> => {
  const discarded = await deps.durable.discardArchive(ownerId, canvasId);
  if (!discarded.ok) return discarded;
  await bestEffort("statut supprimé non publié", () => deps.redis.publishStatus(canvasId, "discarded"));
  await bestEffort("clés de l'archive non effacées", () => deps.redis.discardCanvas(canvasId));
  return succeeded;
};

export function discardOwnerArchive(
  deps: SwitchDeps,
  ownerId: string,
  request: DiscardRequest,
): Promise<SwitchResult> {
  return withOwnerLock(deps, ownerId, async () => {
    try {
      return await discard(deps, ownerId, request);
    } catch (error) {
      console.error("canvases : Convex n'a pas répondu à la suppression", error);
      return refused("failed");
    }
  });
}
