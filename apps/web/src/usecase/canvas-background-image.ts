// Écart §8.1 (JOURNAL 2026-10-10) : poser l'image du fond du canvas en cours, ou la retirer. Convex tranche : ce doit être l'actif
// de ce propriétaire. Redis suit en best effort, journalisé : la copie du gateway, puis les frames qui l'apprennent aux pages.

import { BACKGROUND_IMAGE_MAX_BYTES } from "@liveplace/domain";
import type { ArchiveWrites, DurableStore } from "@liveplace/domain/ports";
import type { Result } from "@liveplace/shared";
import { bestEffort } from "./canvas-switch";

// `too_big` et `invalid_image` : la page n'a pas respecté ses propres bornes. `not_active` : elle n'est plus à jour.
// `failed` : Convex n'a pas répondu, l'image a pu changer ou non.
export type BackgroundImageError = "too_big" | "invalid_image" | "not_active" | "failed";
export type ClearBackgroundImageError = "not_active" | "failed";

export type BackgroundImageDeps = {
  durable: Pick<DurableStore, "setActiveCanvasBackgroundImage" | "clearActiveCanvasBackgroundImage">;
  redis: Pick<ArchiveWrites, "setBackgroundImage" | "clearBackgroundImage">;
};

// Le fichier d'une page est du WebP, jamais ce que dit son en-tête : `RIFF`, la taille sur quatre octets, puis `WEBP`.
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];
const WEBP_HEADER_LENGTH = 12;

export const isWebp = (bytes: Uint8Array): boolean =>
  bytes.length >= WEBP_HEADER_LENGTH &&
  RIFF.every((byte, index) => bytes[index] === byte) &&
  WEBP.every((byte, index) => bytes[8 + index] === byte);

export type BackgroundImageRequest = { canvasId: string; image: Uint8Array };

export async function setCanvasBackgroundImage(
  deps: BackgroundImageDeps,
  ownerId: string,
  { canvasId, image }: BackgroundImageRequest,
): Promise<Result<void, BackgroundImageError>> {
  if (image.byteLength > BACKGROUND_IMAGE_MAX_BYTES) return { ok: false, error: "too_big" };
  if (!isWebp(image)) return { ok: false, error: "invalid_image" };
  let stored: Awaited<ReturnType<BackgroundImageDeps["durable"]["setActiveCanvasBackgroundImage"]>>;
  try {
    stored = await deps.durable.setActiveCanvasBackgroundImage(ownerId, canvasId, image);
  } catch (error) {
    console.error("canvases : Convex n'a pas répondu pour l'image du fond", error);
    return { ok: false, error: "failed" };
  }
  if (!stored.ok) return stored;
  await bestEffort("image du fond non copiée dans Redis", () =>
    deps.redis.setBackgroundImage(canvasId, stored.value.at),
  );
  return { ok: true, value: undefined };
}

export async function clearCanvasBackgroundImage(
  deps: BackgroundImageDeps,
  ownerId: string,
  { canvasId }: { canvasId: string },
): Promise<Result<void, ClearBackgroundImageError>> {
  let cleared: Awaited<ReturnType<BackgroundImageDeps["durable"]["clearActiveCanvasBackgroundImage"]>>;
  try {
    cleared = await deps.durable.clearActiveCanvasBackgroundImage(ownerId, canvasId);
  } catch (error) {
    console.error("canvases : Convex n'a pas répondu pour l'image du fond", error);
    return { ok: false, error: "failed" };
  }
  if (!cleared.ok) return cleared;
  await bestEffort("image du fond non retirée de Redis", () => deps.redis.clearBackgroundImage(canvasId));
  return cleared;
}
