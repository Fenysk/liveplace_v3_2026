// Écart §9.1 (JOURNAL 2026-10-10) : les deux images du canvas que « F · Ambiance » pose sur la carte d'aperçu : le canvas net,
// à la taille exacte de sa place, et le fond, le même canvas en « cover », légèrement flou.

import { PALETTE, TRANSPARENT_COLOR_INDEX } from "@liveplace/domain";
import type { CanvasImage } from "@liveplace/domain/ports";
import type { IndexedImage, Rgb, RgbImage } from "../../shared/indexed-image";
import { toRgba } from "../canvas/canvas-image";
import { darkShade } from "../design/dark-shade";
import { PREVIEW_IMAGE_HEIGHT, PREVIEW_IMAGE_WIDTH } from "./link-preview";

const CHECKER_TILE = 16; // la case du damier du canvas vide, comme sur la page

const toRgb = (hex: string): Rgb => {
  const [red = 0, green = 0, blue = 0] = toRgba(hex);
  return [red, green, blue];
};

const CHECKER_A = toRgb(darkShade("--checker-a"));
const CHECKER_B = toRgb(darkShade("--checker-b"));
// L'index 0 du domaine (transparent) n'est jamais écrit : il porte la teinte A du damier, et la B vient après les couleurs.
const CHECKER_B_INDEX = PALETTE.length;
const CANVAS_PALETTE: readonly Rgb[] = [CHECKER_A, ...PALETTE.slice(1).map(toRgb), CHECKER_B];

// Le damier part du coin de l'image : sa première case est la teinte A. Les coordonnées sont celles de la carte.
const isCheckerB = (x: number, y: number): boolean =>
  (Math.floor(x / CHECKER_TILE) + Math.floor(y / CHECKER_TILE)) % 2 === 1;

// Un index que la palette ne connaît pas reste transparent, comme sur la page.
const isColor = (colorIndex: number): boolean =>
  colorIndex > TRANSPARENT_COLOR_INDEX && colorIndex < PALETTE.length;

// La case sous chaque colonne (ou rangée) de pixels : les cases se partagent les pixels, au plus proche voisin.
const cellsUnder = (pixels: number, cells: number): Int32Array =>
  Int32Array.from({ length: pixels }, (_, pixel) => Math.floor((pixel * cells) / pixels));

// L'index de palette d'un pixel du canvas net : la couleur de sa case, ou la teinte du damier si la case est transparente.
const pixelIndex = (colorIndex: number, x: number, y: number): number => {
  if (isColor(colorIndex)) return colorIndex;
  return isCheckerB(x, y) ? CHECKER_B_INDEX : 0;
};

// Le canvas net : exactement « width × height » pixels, que la mise en page pose tels quels, sans rien rééchantillonner.
// Le facteur n'a pas à être entier : quelques pixels d'écart entre les cases, le canvas remplit sa place.
export function renderCanvasBitmap(
  { width: cols, height: rows, state }: CanvasImage,
  width: number,
  height: number,
): IndexedImage {
  const [columns, lines] = [cellsUnder(width, cols), cellsUnder(height, rows)];
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const cellRow = (lines[y] ?? 0) * cols;
    for (let x = 0; x < width; x++)
      pixels[y * width + x] = pixelIndex(state[cellRow + (columns[x] ?? 0)] ?? TRANSPARENT_COLOR_INDEX, x, y);
  }
  return { width, height, palette: CANVAS_PALETTE, pixels };
}

// Le fond est dessiné au quart de la carte : le flou en coûte seize fois moins, et la mise en page l'agrandit en le lissant.
const BACKDROP_FACTOR = 4;
export const BACKDROP_WIDTH = PREVIEW_IMAGE_WIDTH / BACKDROP_FACTOR;
export const BACKDROP_HEIGHT = Math.ceil(PREVIEW_IMAGE_HEIGHT / BACKDROP_FACTOR);
// Agrandi de 4 % avant d'être coupé, comme le flou CSS que la maquette reprend : aucun liseré sur les bords.
const COVER_ZOOM = 1.04;
// Deux passes d'un flou en boîte de largeur 3 valent un flou gaussien d'environ 1 px sur le fond, 4 à 5 px sur la carte.
const BLUR_RADII = [1, 1] as const;

const BYTES_PER_PIXEL = 3;
const PALETTE_RGB: readonly Rgb[] = [CHECKER_A, ...PALETTE.slice(1).map(toRgb)];

const clamp = (value: number, max: number): number => Math.min(Math.max(value, 0), max);

// Une passe de flou en boîte, sur un axe : chaque pixel prend la moyenne de ceux qui l'entourent, les bords se prolongent.
const blurAxis = (
  from: Uint8Array,
  to: Uint8Array,
  width: number,
  height: number,
  radius: number,
  isRow: boolean,
) => {
  const [lines, length] = isRow ? [height, width] : [width, height];
  const [lineStep, step] = isRow
    ? [width * BYTES_PER_PIXEL, BYTES_PER_PIXEL]
    : [BYTES_PER_PIXEL, width * BYTES_PER_PIXEL];
  const span = 2 * radius + 1;
  for (let line = 0; line < lines; line++)
    for (let channel = 0; channel < BYTES_PER_PIXEL; channel++) {
      const base = line * lineStep + channel;
      const at = (index: number): number => from[base + clamp(index, length - 1) * step] ?? 0;
      let sum = 0;
      for (let index = -radius; index <= radius; index++) sum += at(index);
      for (let index = 0; index < length; index++) {
        to[base + index * step] = Math.round(sum / span);
        sum += at(index + radius + 1) - at(index - radius);
      }
    }
};

const blur = ({ width, height, rgb }: RgbImage): RgbImage => {
  let from: Uint8Array = rgb;
  let to: Uint8Array = new Uint8Array(rgb.length);
  for (const radius of BLUR_RADII)
    for (const isRow of [true, false]) {
      blurAxis(from, to, width, height, radius, isRow);
      [from, to] = [to, from];
    }
  return { width, height, rgb: from };
};

// La case sous chaque colonne (ou rangée) du fond : le canvas est centré, et ce qui dépasse de la carte se coupe.
const coverCells = (pixels: number, cells: number, scale: number): Int32Array =>
  Int32Array.from({ length: pixels }, (_, pixel) =>
    clamp(Math.floor((pixel + 0.5 - pixels / 2) / scale + cells / 2), cells - 1),
  );

// La couleur d'un pixel du fond : celle de sa case, ou le damier si elle est transparente (les coordonnées de la carte).
const backdropColor = (colorIndex: number, x: number, y: number): Rgb => {
  if (isColor(colorIndex)) return PALETTE_RGB[colorIndex] ?? CHECKER_A;
  return isCheckerB(x * BACKDROP_FACTOR, y * BACKDROP_FACTOR) ? CHECKER_B : CHECKER_A;
};

// Le canvas en « cover » sur toute la carte, au plus proche voisin, agrandi de 4 % et centré ; les cases transparentes
// y prennent le damier ; puis le flou. Le voile est celui de la mise en page.
export function renderBackdrop({ width: cols, height: rows, state }: CanvasImage): RgbImage {
  const scale = Math.max(BACKDROP_WIDTH / cols, BACKDROP_HEIGHT / rows) * COVER_ZOOM;
  const [columns, lines] = [
    coverCells(BACKDROP_WIDTH, cols, scale),
    coverCells(BACKDROP_HEIGHT, rows, scale),
  ];
  const rgb = new Uint8Array(BACKDROP_WIDTH * BACKDROP_HEIGHT * BYTES_PER_PIXEL);
  for (let y = 0; y < BACKDROP_HEIGHT; y++)
    for (let x = 0; x < BACKDROP_WIDTH; x++) {
      const colorIndex = state[(lines[y] ?? 0) * cols + (columns[x] ?? 0)] ?? TRANSPARENT_COLOR_INDEX;
      rgb.set(backdropColor(colorIndex, x, y), (y * BACKDROP_WIDTH + x) * BYTES_PER_PIXEL);
    }
  return blur({ width: BACKDROP_WIDTH, height: BACKDROP_HEIGHT, rgb });
}
