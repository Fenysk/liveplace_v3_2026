// L'image hors écran du §9.3 : un pixel par case, repeinte en entier (Écart §9.3, JOURNAL 2026-09-23).

import type { CanvasView } from "../../state/canvas-store";

// "#rrggbb" ou "#rrggbbaa" : la palette arrive en hexadécimal dans le `welcome` (§4.3).
const toRgba = (hex: string): number[] => {
  const channel = (start: number) => Number.parseInt(hex.slice(start, start + 2), 16);
  return [channel(1), channel(3), channel(5), hex.length > 7 ? channel(7) : 255];
};

// Les quatre octets RGBA d'une couleur, relus d'un coup en Uint32 : l'ordre en mémoire est gardé, quel que soit le processeur.
export function toColorTable(palette: readonly string[]): Uint32Array {
  const bytes = new Uint8ClampedArray(palette.length * 4);
  palette.forEach((hex, index) => {
    bytes.set(toRgba(hex), index * 4);
  });
  return new Uint32Array(bytes.buffer);
}

// Un index hors palette reste transparent.
export function fillImage(target: Uint32Array, pixels: Uint8Array, colorTable: Uint32Array): void {
  for (let offset = 0; offset < pixels.length; offset++)
    target[offset] = colorTable[pixels[offset] ?? 0] ?? 0;
}

export type CanvasImage = { source: HTMLCanvasElement; repaint(view: CanvasView): void };

export function createCanvasImage(): CanvasImage {
  const source = document.createElement("canvas");
  const context = source.getContext("2d");
  if (!context) throw new Error("canvas-image : contexte 2d indisponible");
  let palette: readonly string[] = [];
  let colorTable: Uint32Array = new Uint32Array(0);
  let image = context.createImageData(1, 1);

  return {
    source,
    repaint(view) {
      if (view.palette !== palette) {
        palette = view.palette;
        colorTable = toColorTable(palette);
      }
      if (image.width !== view.width || image.height !== view.height) {
        source.width = view.width;
        source.height = view.height;
        image = context.createImageData(view.width, view.height);
      }
      fillImage(new Uint32Array(image.data.buffer), view.pixels, colorTable);
      context.putImageData(image, 0, 0);
    },
  };
}
