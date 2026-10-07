// Écart §10.3 (JOURNAL 2026-10-06) : ce que partagent archiver, rouvrir et supprimer. Le web les fait après avoir vérifié
// le cookie du streamer, avec un verrou par propriétaire ; Convex tranche, Redis suit, et les pages l'apprennent.

import type { Timestamp } from "@liveplace/domain";
import type { ArchiveWrites, DurableStore } from "@liveplace/domain/ports";
import type { Result } from "@liveplace/shared";

// « Les viewers gardent leur progression actuelle », ou « Repartir de la progression de ce canvas ».
export type ProgressChoice = "keep" | "restart";

// `busy` : un autre changement est en cours. `not_active` et `not_archive` : la page n'est plus à jour. `failed` :
// rien n'a changé (ou tout a été défait), le streamer peut réessayer.
export type SwitchError = "busy" | "not_active" | "not_archive" | "archives_full" | "failed";
export type SwitchResult = Result<void, SwitchError>;

export type SwitchDeps = {
  durable: Pick<
    DurableStore,
    | "listCanvasesForOwner"
    | "getActiveCanvasForOwner"
    | "archiveActiveCanvas"
    | "reopenArchive"
    | "discardArchive"
  >;
  redis: ArchiveWrites;
  now: () => Timestamp;
  randomCanvasId: () => string;
  randomLinkCode: () => string;
};

export const refused = (error: SwitchError): SwitchResult => ({ ok: false, error });
export const succeeded: SwitchResult = { ok: true, value: undefined };

// Ce qui défait un changement manqué, ou le suit une fois que Convex a tranché, ne doit pas empêcher le reste : une
// erreur se journalise avec son contexte, et la suite continue.
export async function bestEffort(label: string, step: () => Promise<void>): Promise<void> {
  try {
    await step();
  } catch (error) {
    console.error(`canvases : ${label}`, error);
  }
}

// Un seul changement à la fois par propriétaire (double clic, deux onglets). Le verrou se rend à la fin, même en cas
// d'échec ; une erreur imprévue donne `failed` plutôt qu'un échec muet du serveur.
export async function withOwnerLock(
  deps: Pick<SwitchDeps, "redis">,
  ownerId: string,
  run: () => Promise<SwitchResult>,
): Promise<SwitchResult> {
  const lock = await deps.redis.acquireOwnerLock(ownerId);
  if (!lock) return refused("busy");
  try {
    return await run();
  } catch (error) {
    console.error("canvases : changement abandonné", error);
    return refused("failed");
  } finally {
    await bestEffort("verrou non rendu", () => deps.redis.releaseOwnerLock(lock));
  }
}

// Convex ne dit pas quel canvas est actif : on ne sait pas, donc on ne prétend pas que ce soit celui-là.
const hasActiveCanvas = async (
  deps: Pick<SwitchDeps, "durable">,
  ownerId: string,
  canvasId: string,
): Promise<boolean> => {
  try {
    return (await deps.durable.getActiveCanvasForOwner(ownerId))?.canvasId === canvasId;
  } catch (error) {
    console.error("canvases : Convex ne dit pas quel canvas est actif", error);
    return false;
  }
};

// Convex tranche : un refus est une valeur. Une réponse perdue, elle, n'est pas un refus : Convex a pu valider avant, et
// défaire Redis sur un changement qu'il a retenu laisserait le streamer sur un canvas qui n'existe plus. On regarde
// donc si `becomesActiveId` est le canvas actif, et seulement sinon l'opération échoue.
export async function commitToDurable(
  deps: Pick<SwitchDeps, "durable">,
  ownerId: string,
  becomesActiveId: string,
  write: () => Promise<SwitchResult>,
): Promise<SwitchResult> {
  try {
    return await write();
  } catch (error) {
    console.error("canvases : Convex n'a pas répondu", error);
    return (await hasActiveCanvas(deps, ownerId, becomesActiveId)) ? succeeded : refused("failed");
  }
}
