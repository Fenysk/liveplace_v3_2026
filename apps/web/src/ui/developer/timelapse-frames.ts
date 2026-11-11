// Les images du GIF timelapse (JOURNAL 2026-11-11), en pur : le décodage de ce que le serveur envoie, l'échelle, le rectangle des
// cases changées et le dessin d'une case. Le Web Worker les assemble ; rien ici ne touche au navigateur.

import type { TimelapseWire } from "../../usecase/export-timelapse";

// `initial` : l'index de palette de chaque case au départ ; `changes` : `stateOffset << 8 | colorIndex`, dans l'ordre.
export type DecodedTimelapse = { width: number; height: number; initial: Uint8Array; changes: Uint32Array };

// Le plus grand côté de l'image d'un GIF, en pixels.
export const GIF_TARGET_SIDE = 640;

const COLOR_BITS = 8;

const bytesOf = (base64: string): Uint8Array => Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));

// Les changements sont des entiers de 32 bits petit-boutistes : lus un à un, la machine n'y change rien.
const changesOf = (bytes: Uint8Array): Uint32Array => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Uint32Array.from({ length: Math.floor(bytes.byteLength / 4) }, (_, index) =>
    view.getUint32(index * 4, true),
  );
};

export function decodeTimelapse({ width, height, initial, changes }: TimelapseWire): DecodedTimelapse {
  return { width, height, initial: bytesOf(initial), changes: changesOf(bytesOf(changes)) };
}

// Chaque case est un carré de `scale` pixels de côté : 1 au plus petit, et le plus grand côté tient dans `GIF_TARGET_SIDE`.
export const gifScale = (width: number, height: number): number =>
  Math.max(1, Math.floor(GIF_TARGET_SIDE / Math.max(width, height)));

export const stateOffsetOf = (packed: number): number => packed >>> COLOR_BITS;
export const colorIndexOf = (packed: number): number => packed & 0xff;

// Le plus petit rectangle de cases qui contient celles de `changes[from, to)`, `null` sans changement.
export type CellRect = { left: number; top: number; width: number; height: number };

export function changedRect(
  changes: Uint32Array,
  from: number,
  to: number,
  gridWidth: number,
): CellRect | null {
  if (from >= to) return null;
  let [left, top, right, bottom] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, -1, -1];
  for (let at = from; at < to; at++) {
    const stateOffset = stateOffsetOf(changes[at] ?? 0);
    const [x, y] = [stateOffset % gridWidth, Math.floor(stateOffset / gridWidth)];
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

// Un carré de `scale` pixels de `index`, posé dans `pixels` (de largeur `stride`) à la case (`x`, `y`) du rectangle.
export function placeCell(
  pixels: Uint8Array,
  stride: number,
  { x, y, scale }: { x: number; y: number; scale: number },
  index: number,
): void {
  for (let row = 0; row < scale; row++) {
    const first = (y * scale + row) * stride + x * scale;
    pixels.fill(index, first, first + scale);
  }
}
