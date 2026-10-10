// La fresque qui paraît en mosaïque : l'image par blocs de 8, 4 et 2 cases, puis nette. Pur : la scène en fait des images.

import type { CanvasSize } from "@liveplace/domain";
import { type MosaicLevel, toRgba } from "./canvas-image";

// La taille des blocs de chaque niveau, du plus gros au plus fin ; la dernière étape est l'image nette.
export const REVEAL_BLOCKS = [8, 4, 2] as const;
export const REVEAL_STEPS = REVEAL_BLOCKS.length + 1;

// La moyenne des cases d'un bloc, une case transparente comptant pour transparente : les couleurs pèsent selon leur opacité.
// Un bloc au bord, plus petit, se moyenne sur ses seules cases.
function averageBlock(
  pixels: Uint8Array,
  table: readonly (readonly number[])[],
  size: CanvasSize,
  [left, top]: readonly [number, number],
  block: number,
): [number, number, number, number] {
  const right = Math.min(left + block, size.width);
  const bottom = Math.min(top + block, size.height);
  let red = 0;
  let green = 0;
  let blue = 0;
  let alpha = 0;
  for (let y = top; y < bottom; y++)
    for (let x = left; x < right; x++) {
      const [r = 0, g = 0, b = 0, a = 0] = table[pixels[y * size.width + x] ?? 0] ?? [];
      red += r * a;
      green += g * a;
      blue += b * a;
      alpha += a;
    }
  const cells = (right - left) * (bottom - top);
  if (alpha === 0) return [0, 0, 0, 0];
  return [red / alpha, green / alpha, blue / alpha, alpha / cells];
}

export function mosaicLevels(
  pixels: Uint8Array,
  palette: readonly string[],
  size: CanvasSize,
  blocks: readonly number[] = REVEAL_BLOCKS,
): MosaicLevel[] {
  const table = palette.map(toRgba);
  return blocks.map((block) => {
    const width = Math.ceil(size.width / block);
    const height = Math.ceil(size.height / block);
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let row = 0; row < height; row++)
      for (let column = 0; column < width; column++)
        rgba.set(
          averageBlock(pixels, table, size, [column * block, row * block], block),
          (row * width + column) * 4,
        );
    return { width, height, rgba };
  });
}
