// Un PNG à palette (couleur indexée sur 8 bits) écrit à la main : `node:zlib` compresse et donne le CRC, aucune dépendance.

import { deflateSync } from "node:zlib";
import type { IndexedImage } from "../shared/indexed-image";
import { COLOR_TYPE_INDEXED, FILTER_NONE, PNG_SIGNATURE, pngChunk, pngHeader } from "./png-chunks";

const MAX_PALETTE_SIZE = 256;

// Chaque ligne commence par son octet de filtre.
const scanlines = ({ width, height, pixels }: IndexedImage): Buffer => {
  const rowBytes = width + 1;
  const raw = Buffer.alloc(rowBytes * height);
  for (let row = 0; row < height; row++) {
    raw[row * rowBytes] = FILTER_NONE;
    raw.set(pixels.subarray(row * width, (row + 1) * width), row * rowBytes + 1);
  }
  return raw;
};

export function encodeIndexedPng(image: IndexedImage): Uint8Array<ArrayBuffer> {
  const { width, height, palette, pixels } = image;
  if (pixels.length !== width * height)
    throw new Error(`indexed-png : ${pixels.length} pixels pour une image de ${width}×${height}`);
  if (palette.length > MAX_PALETTE_SIZE)
    throw new Error(`indexed-png : une palette de ${palette.length} couleurs, au plus ${MAX_PALETTE_SIZE}`);
  return Buffer.concat([
    PNG_SIGNATURE,
    pngHeader(width, height, COLOR_TYPE_INDEXED),
    pngChunk("PLTE", Uint8Array.from(palette.flat())),
    pngChunk("IDAT", deflateSync(scanlines(image), { level: 9 })),
    pngChunk("IEND", new Uint8Array(0)),
  ]);
}
