// La taille du canvas (CDC 2026 §1, JOURNAL 2026-09-29) : où se range une taille dans le tableau des formats, et ce
// qu'une nouvelle taille laisse hors du cadre. Pur : la section Canvas l'affiche.

import { CANVAS_FORMATS, type CanvasFormat, type CanvasSize } from "@liveplace/domain";
import type { Pixel } from "@liveplace/domain/ports";
import { listCutPixels, planResize } from "@liveplace/domain/resize";

// Petit, Moyen, Grand : la place d'une taille dans son format.
export type SizeChoice = { format: CanvasFormat; sizeIndex: number };

// La taille des canvas d'avant les formats (256 × 256) n'est dans aucun : on propose alors le grand carré.
export function toSizeChoice({ width, height }: CanvasSize): SizeChoice {
  for (const { format, sizes } of CANVAS_FORMATS) {
    const sizeIndex = sizes.findIndex((size) => size.width === width && size.height === height);
    if (sizeIndex >= 0) return { format, sizeIndex };
  }
  return { format: "1:1", sizeIndex: 2 };
}

export function toCanvasSize({ format, sizeIndex }: SizeChoice): CanvasSize {
  const sizes = CANVAS_FORMATS.find((each) => each.format === format)?.sizes ?? CANVAS_FORMATS[0].sizes;
  return sizes[sizeIndex] ?? sizes[0];
}

// Écart §5.3 (JOURNAL 2026-10-24) : ce que montrera une nouvelle taille, du même plan que redis-core applique. `outside` : les
// pixels posés qu'elle laisse hors du cadre une fois les dessins rapprochés, gardés, invisibles jusqu'à un agrandissement, à leur
// place d'aujourd'hui. `hasMovedPixels` : au moins un dessin se rapproche.
export function previewResize(
  pixels: Uint8Array,
  current: CanvasSize,
  next: CanvasSize,
): { outside: Pixel[]; hasMovedPixels: boolean } {
  const plan = planResize(pixels, current, next);
  return { outside: listCutPixels(plan, pixels), hasMovedPixels: plan.hasMovedPixels };
}
