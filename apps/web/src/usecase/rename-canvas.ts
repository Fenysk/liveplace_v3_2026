// Écart §15 (JOURNAL 2026-10-06) : nommer le canvas en cours, ou lui retirer son nom. Convex seul le garde (le nom n'est
// pas dans Redis) et tranche : ce doit être l'actif de ce propriétaire.

import { toArchiveName } from "@liveplace/domain";
import type { DurableStore } from "@liveplace/domain/ports";
import type { Result } from "@liveplace/shared";

// `not_active` : la page n'est plus à jour. `failed` : Convex n'a pas répondu, le nom a pu changer ou non.
export type RenameError = "not_active" | "failed";
export type RenameResult = Result<void, RenameError>;

export type RenameDeps = { durable: Pick<DurableStore, "renameActiveCanvas"> };

export type RenameRequest = { canvasId: string; name: string };

export async function renameCanvas(
  deps: RenameDeps,
  ownerId: string,
  { canvasId, name }: RenameRequest,
): Promise<RenameResult> {
  try {
    return await deps.durable.renameActiveCanvas(ownerId, canvasId, toArchiveName(name));
  } catch (error) {
    console.error("canvases : Convex n'a pas répondu au changement de nom", error);
    return { ok: false, error: "failed" };
  }
}
