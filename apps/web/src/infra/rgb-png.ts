// Écart §9.1 (JOURNAL 2026-10-10) : un PNG en couleurs vraies (rouge, vert, bleu sur 8 bits) écrit à la main, pour le fond
// flou de l'image d'aperçu. Chaque ligne est filtrée « Sub » : un fond lisse se compresse bien mieux que brut.

import { deflateSync } from "node:zlib";
import type { RgbImage } from "../shared/indexed-image";
import { COLOR_TYPE_RGB, PNG_SIGNATURE, pngChunk, pngHeader } from "./png-chunks";

const BYTES_PER_PIXEL = 3;
const FILTER_SUB = 1;

const scanlines = ({ width, height, rgb }: RgbImage): Buffer => {
  const stride = width * BYTES_PER_PIXEL;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let row = 0; row < height; row++) {
    const [from, to] = [row * stride, row * (stride + 1) + 1];
    raw[to - 1] = FILTER_SUB;
    for (let index = 0; index < stride; index++)
      raw[to + index] =
        ((rgb[from + index] ?? 0) -
          (index >= BYTES_PER_PIXEL ? (rgb[from + index - BYTES_PER_PIXEL] ?? 0) : 0)) &
        0xff;
  }
  return raw;
};

export function encodeRgbPng(image: RgbImage): Uint8Array<ArrayBuffer> {
  const { width, height, rgb } = image;
  if (rgb.length !== width * height * BYTES_PER_PIXEL)
    throw new Error(`rgb-png : ${rgb.length} octets pour une image de ${width}×${height}`);
  return Buffer.concat([
    PNG_SIGNATURE,
    pngHeader(width, height, COLOR_TYPE_RGB),
    pngChunk("IDAT", deflateSync(scanlines(image))),
    pngChunk("IEND", new Uint8Array(0)),
  ]);
}
