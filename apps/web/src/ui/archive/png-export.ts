// Télécharger une archive en PNG (Écart §15, JOURNAL 2026-10-06) : le dessin visible, case par case, sans lissage.
// Chaque case devient un bloc de pixels entiers, au plus proche voisin ; une case transparente prend le fond choisi.

import { type Timestamp, toParisDay } from "@liveplace/domain";

// Le plus grand côté de l'image arrive à 1000 pixels au moins.
export const PNG_TARGET_SIDE = 1000;

export const pngScale = (width: number, height: number): number =>
  Math.max(1, Math.ceil(PNG_TARGET_SIDE / Math.max(width, height)));

// Lisible : le pseudo, et le jour de l'archivage.
export const pngFileName = (login: string, archivedAt: Timestamp): string =>
  `liveplace-${login}-${toParisDay(archivedAt)}.png`;

type Rgba = readonly [number, number, number, number];

// Le fond des cases transparentes, à choisir au téléchargement : le noir et le blanc sont purs, et opaques.
export type PngBackground = "transparent" | "black" | "white";

const BACKGROUND_RGBA: Record<PngBackground, Rgba> = {
  transparent: [0, 0, 0, 0],
  black: [0, 0, 0, 255],
  white: [255, 255, 255, 255],
};

// Six ou huit chiffres hexadécimaux : la case transparente de la palette a un alpha nul.
const toRgba = (color: string): Rgba => {
  const hex = color.replace("#", "");
  const channel = (index: number) => Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  return [channel(0), channel(1), channel(2), hex.length >= 8 ? channel(3) : 255];
};

const fillBlock = (
  rgba: Uint8ClampedArray,
  side: number,
  x: number,
  y: number,
  scale: number,
  color: Rgba,
) => {
  for (let row = 0; row < scale; row++) {
    const first = ((y * scale + row) * side + x * scale) * 4;
    for (let column = 0; column < scale; column++) rgba.set(color, first + column * 4);
  }
};

export function toPngPixels(
  state: Uint8Array,
  width: number,
  height: number,
  palette: readonly string[],
  scale: number,
  background: PngBackground,
): Uint8ClampedArray<ArrayBuffer> {
  const side = width * scale;
  const rgba = new Uint8ClampedArray(side * height * scale * 4);
  const rgbaByIndex = palette.map(toRgba);
  const empty = BACKGROUND_RGBA[background];
  state.forEach((colorIndex, index) => {
    const color = rgbaByIndex[colorIndex];
    const shown = color && color[3] > 0 ? color : empty;
    if (shown[3] > 0) fillBlock(rgba, side, index % width, Math.floor(index / width), scale, shown);
  });
  return rgba;
}

// Le navigateur seul : le dessin sur une surface, le PNG, puis un lien qu'on clique pour l'enregistrer.
export async function downloadPng(
  rgba: Uint8ClampedArray<ArrayBuffer>,
  width: number,
  height: number,
  fileName: string,
): Promise<void> {
  const surface = document.createElement("canvas");
  surface.width = width;
  surface.height = height;
  const context = surface.getContext("2d");
  if (!context) throw new Error("png-export : contexte 2d indisponible");
  context.putImageData(new ImageData(rgba, width, height), 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => surface.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("png-export : le navigateur n'a pas produit de PNG");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
