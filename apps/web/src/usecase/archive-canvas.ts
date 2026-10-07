// Écart §10.3 (JOURNAL 2026-10-06) : archiver le canvas actif, et repartir sur un canvas vide.
// L'ordre fait l'opération fiable : tant que Convex n'a pas tranché, tout se défait ; après, plus rien ne l'empêche.

import { type CanvasMeta, MAX_ARCHIVES, toArchiveName } from "@liveplace/domain";
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

export type ArchiveRequest = { canvasId: string; name: string; progress: ProgressChoice };

// Le canvas vide qui prend la place : la même taille, les mêmes jauges de départ et maximale, la même recharge.
const toIncomingMeta = (meta: CanvasMeta): CanvasMeta => ({
  ownerId: meta.ownerId,
  width: meta.width,
  height: meta.height,
  gaugeMaxStart: meta.gaugeMaxStart,
  gaugeMaxCeiling: meta.gaugeMaxCeiling,
  refillMs: meta.refillMs,
  refillCharges: meta.refillCharges,
  obsDelayMs: meta.obsDelayMs,
  obsBackground: meta.obsBackground,
});

// Défaire : le canvas qui sortait redevient actif tel qu'il était, celui qu'on préparait est effacé.
const undo = async (deps: SwitchDeps, outgoingId: string, incomingId: string): Promise<void> => {
  await bestEffort("canvas sortant non défigé", () => deps.redis.markActive(outgoingId));
  await bestEffort("canvas entrant non effacé", () => deps.redis.discardCanvas(incomingId));
};

const archive = async (deps: SwitchDeps, ownerId: string, request: ArchiveRequest): Promise<SwitchResult> => {
  // Avant d'écrire quoi que ce soit : c'est bien le canvas actif de ce propriétaire, et il reste de la place.
  const { active, archives } = await deps.durable.listCanvasesForOwner(ownerId);
  if (active?.canvasId !== request.canvasId) return refused("not_active");
  if (archives.length >= MAX_ARCHIVES) return refused("archives_full");
  const outgoing = await deps.redis.getCanvas(active.canvasId);
  if (!outgoing) return refused("failed");

  const incoming = { canvasId: deps.randomCanvasId(), width: outgoing.width, height: outgoing.height };
  const archivedAt = deps.now();
  const name = toArchiveName(request.name);
  try {
    // Le nouveau canvas sans `ready` : personne ne le sert. Puis le sortant figé d'un seul `HSET` : dès lors, aucun
    // script n'y écrit plus, et personne ne voit un nouveau canvas à moitié copié.
    await deps.redis.prepareCanvas(incoming.canvasId, toIncomingMeta(outgoing));
    await deps.redis.markArchived(active.canvasId, { archivedAt, successorId: incoming.canvasId });
    await deps.redis.copyShared(active.canvasId, incoming.canvasId);
    if (request.progress === "keep") await deps.redis.copyProgress(active.canvasId, incoming.canvasId);
    await deps.redis.markReady(incoming.canvasId);
  } catch (error) {
    console.error("canvases : archivage défait avant Convex", error);
    await undo(deps, active.canvasId, incoming.canvasId);
    return refused("failed");
  }

  const committed = await commitToDurable(deps, ownerId, incoming.canvasId, () =>
    deps.durable.archiveActiveCanvas({
      ownerId,
      outgoingId: active.canvasId,
      incoming,
      archivedAt,
      linkCode: active.linkCode ?? deps.randomLinkCode(),
      ...(name ? { name } : {}),
    }),
  );
  if (!committed.ok) {
    await undo(deps, active.canvasId, incoming.canvasId);
    return committed;
  }

  await bestEffort("signalements non classés", () => deps.redis.settleReports(active.canvasId));
  await bestEffort("statut non publié", () => deps.redis.publishStatus(active.canvasId, "archived"));
  return succeeded;
};

export function archiveCanvas(
  deps: SwitchDeps,
  ownerId: string,
  request: ArchiveRequest,
): Promise<SwitchResult> {
  return withOwnerLock(deps, ownerId, () => archive(deps, ownerId, request));
}
