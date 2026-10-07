// La miniature d'un canvas (Écart §15, JOURNAL 2026-10-06) : ses cases non transparentes, pour `PixelPreview`.

import { TRANSPARENT_COLOR_INDEX } from "@liveplace/domain";
import type { Pixel } from "@liveplace/domain/ports";

export function toThumbnailPixels(state: Uint8Array, width: number): Pixel[] {
  const pixels: Pixel[] = [];
  state.forEach((colorIndex, index) => {
    if (colorIndex !== TRANSPARENT_COLOR_INDEX)
      pixels.push({ x: index % width, y: Math.floor(index / width), colorIndex });
  });
  return pixels;
}
