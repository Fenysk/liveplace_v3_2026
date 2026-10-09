// Écart §8.1 (JOURNAL 2026-10-07) : donner un thème au canvas en cours, ou le lui retirer. Convex tranche : ce doit être
// l'actif de ce propriétaire. Redis suit en best effort, journalisé : la copie du gateway, puis le `ctl` qui l'apprend aux pages.

import { toTheme } from "@liveplace/domain";
import type { ArchiveWrites, DurableStore } from "@liveplace/domain/ports";
import type { Result } from "@liveplace/shared";
import { bestEffort } from "./canvas-switch";

// `not_active` : la page n'est plus à jour. `failed` : Convex n'a pas répondu, le thème a pu changer ou non.
export type ThemeError = "not_active" | "failed";
export type ThemeResult = Result<void, ThemeError>;

export type ThemeDeps = {
  durable: Pick<DurableStore, "setActiveCanvasTheme">;
  redis: Pick<ArchiveWrites, "setTheme" | "publishTheme">;
};

export type ThemeRequest = { canvasId: string; theme: string };

export async function setCanvasTheme(
  deps: ThemeDeps,
  ownerId: string,
  { canvasId, theme }: ThemeRequest,
): Promise<ThemeResult> {
  const cleaned = toTheme(theme);
  let result: ThemeResult;
  try {
    result = await deps.durable.setActiveCanvasTheme(ownerId, canvasId, cleaned);
  } catch (error) {
    console.error("canvases : Convex n'a pas répondu au changement de thème", error);
    return { ok: false, error: "failed" };
  }
  if (!result.ok) return result;
  // Sans la copie, rien à publier : une page qui arrive lirait l'ancien thème de `meta`.
  await bestEffort("thème non copié dans Redis", async () => {
    await deps.redis.setTheme(canvasId, cleaned);
    await deps.redis.publishTheme(canvasId, cleaned);
  });
  return result;
}
