// La taille du canvas (CDC 2026 §1, JOURNAL 2026-09-29) : où se range une taille dans le tableau des formats, et ce
// qu'une nouvelle taille laisse hors du cadre. Pur : la section Canvas l'affiche.

import { CANVAS_FORMATS, type CanvasFormat, type CanvasSize, toStateOffset } from "@liveplace/domain";
import type { Pixel } from "@liveplace/domain/ports";

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

// Les pixels posés que la nouvelle taille laisse hors du cadre : gardés, invisibles jusqu'à un agrandissement.
export function listOutsidePixels(pixels: Uint8Array, current: CanvasSize, next: CanvasSize): Pixel[] {
  const outside: Pixel[] = [];
  for (let y = 0; y < current.height; y++)
    for (let x = 0; x < current.width; x++) {
      const colorIndex = pixels[toStateOffset(x, y, current.width)] ?? 0;
      if (colorIndex !== 0 && (x >= next.width || y >= next.height)) outside.push({ x, y, colorIndex });
    }
  return outside;
}
