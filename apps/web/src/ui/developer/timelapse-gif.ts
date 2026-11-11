// Le GIF d'un timelapse (JOURNAL 2026-11-11) : la première image entière, puis pour chacune le rectangle des cases touchées depuis la
// précédente. La palette est celle du jeu, sans quantification ; l'index de plus est le transparent du GIF.

import { PALETTE } from "@liveplace/domain";
import { planStills } from "@liveplace/domain/timelapse-stills";
import type { Result } from "@liveplace/shared";
import { toRgba } from "../archive/png-export";
import { createGifWriter, type Rgb } from "./gif-writer";
import {
  type CellRect,
  changedRect,
  colorIndexOf,
  type DecodedTimelapse,
  gifScale,
  placeCell,
  stateOffsetOf,
} from "./timelapse-frames";

export type TimelapseGif = { bytes: Uint8Array<ArrayBuffer>; width: number; height: number; seconds: number };

const TRANSPARENT_GIF_INDEX = PALETTE.length; // une couleur de plus que le jeu : la case que l'image n'a pas touchée
const TRANSPARENT_GAME_INDEX = 0;

// L'index 0 du jeu est transparent : le GIF le peint de `empty`, la case vide du jeu.
const gifPalette = (empty: Rgb): Rgb[] => [
  empty,
  ...PALETTE.slice(1).map((color): Rgb => {
    const [red, green, blue] = toRgba(color);
    return [red, green, blue];
  }),
  [0, 0, 0],
];

// Le dessin d'un rectangle de cases, `shown` donnant la couleur de chacune ; `isTouched` laisse les autres transparentes.
const placeRect = (
  { rect, scale, gridWidth }: { rect: CellRect; scale: number; gridWidth: number },
  shown: Uint8Array,
  isTouched: ((stateOffset: number) => boolean) | null,
): Uint8Array => {
  const stride = rect.width * scale;
  const pixels = new Uint8Array(stride * rect.height * scale).fill(TRANSPARENT_GIF_INDEX);
  for (let y = 0; y < rect.height; y++)
    for (let x = 0; x < rect.width; x++) {
      const stateOffset = (rect.top + y) * gridWidth + rect.left + x;
      if (isTouched?.(stateOffset) === false) continue;
      placeCell(pixels, stride, { x, y, scale }, shown[stateOffset] ?? TRANSPARENT_GAME_INDEX);
    }
  return pixels;
};

// `onProgress(done, total)` : une fois par image.
export function buildTimelapseGif(
  { width, height, initial, changes }: DecodedTimelapse,
  empty: Rgb,
  onProgress: (done: number, total: number) => void,
): Result<TimelapseGif, "no_changes"> {
  const stills = planStills(changes.length);
  if (!stills.ok) return stills;
  const scale = gifScale(width, height);
  const [pixelWidth, pixelHeight] = [width * scale, height * scale];
  const writer = createGifWriter({
    width: pixelWidth,
    height: pixelHeight,
    palette: gifPalette(empty),
    transparentIndex: TRANSPARENT_GIF_INDEX,
  });
  const shown = initial.slice();
  const touchedIn = new Uint32Array(shown.length); // le numéro de la dernière image qui a touché chaque case
  let applied = 0;
  let totalCs = 0;
  for (const [number, { changesApplied, delayCs }] of stills.value.entries()) {
    const from = applied;
    for (; applied < changesApplied; applied++) {
      const packed = changes[applied] ?? 0;
      shown[stateOffsetOf(packed)] = colorIndexOf(packed);
      touchedIn[stateOffsetOf(packed)] = number;
    }
    const rect =
      number === 0 ? { left: 0, top: 0, width, height } : changedRect(changes, from, applied, width);
    if (rect) {
      const isTouched = number === 0 ? null : (stateOffset: number) => touchedIn[stateOffset] === number;
      writer.addFrame({
        left: rect.left * scale,
        top: rect.top * scale,
        width: rect.width * scale,
        height: rect.height * scale,
        indexes: placeRect({ rect, scale, gridWidth: width }, shown, isTouched),
        delayCs,
      });
    }
    totalCs += delayCs;
    onProgress(number + 1, stills.value.length);
  }
  return {
    ok: true,
    value: {
      bytes: writer.finish(),
      width: pixelWidth,
      height: pixelHeight,
      seconds: Math.round(totalCs / 100),
    },
  };
}
