// Un décodeur de PNG minimal (8 bits, sans entrelacement : palette, RVB, RVBA), pour que les tests relisent ce que resvg
// et `indexed-png` écrivent, pixel par pixel. Le serveur ne s'en sert jamais.

import { inflateSync } from "node:zlib";

export type DecodedPng = { width: number; height: number; rgba: Uint8Array };

const SIGNATURE_BYTES = 8;
const CHUNK_FRAME_BYTES = 12; // longueur, type et CRC autour du contenu
const COLOR_TYPE_RGB = 2;
const COLOR_TYPE_INDEXED = 3;
const COLOR_TYPE_RGBA = 6;
const BYTES_PER_PIXEL: Record<number, number | undefined> = {
  [COLOR_TYPE_INDEXED]: 1,
  [COLOR_TYPE_RGB]: 3,
  [COLOR_TYPE_RGBA]: 4,
};

type Chunk = { type: string; body: Buffer };

const listChunks = (file: Buffer): Chunk[] => {
  const chunks: Chunk[] = [];
  for (let offset = SIGNATURE_BYTES; offset < file.length; ) {
    const length = file.readUInt32BE(offset);
    chunks.push({
      type: file.toString("latin1", offset + 4, offset + 8),
      body: file.subarray(offset + 8, offset + 8 + length),
    });
    offset += length + CHUNK_FRAME_BYTES;
  }
  return chunks;
};

const paeth = (left: number, up: number, upLeft: number): number => {
  const estimate = left + up - upLeft;
  const [distanceLeft, distanceUp, distanceUpLeft] = [
    Math.abs(estimate - left),
    Math.abs(estimate - up),
    Math.abs(estimate - upLeft),
  ];
  if (distanceLeft <= distanceUp && distanceLeft <= distanceUpLeft) return left;
  return distanceUp <= distanceUpLeft ? up : upLeft;
};

// Les cinq filtres de la norme : aucun, Sub, Up, Average, Paeth.
const unfilter = (raw: Buffer, width: number, height: number, bytesPerPixel: number): Uint8Array => {
  const stride = width * bytesPerPixel;
  const rows = new Uint8Array(stride * height);
  const at = (row: number, index: number): number =>
    row < 0 || index < 0 ? 0 : (rows[row * stride + index] ?? 0);
  for (let row = 0; row < height; row++) {
    const filter = raw[row * (stride + 1)] ?? 0;
    for (let index = 0; index < stride; index++) {
      const filtered = raw[row * (stride + 1) + 1 + index] ?? 0;
      const [left, up, upLeft] = [
        at(row, index - bytesPerPixel),
        at(row - 1, index),
        at(row - 1, index - bytesPerPixel),
      ];
      const predicted = [0, left, up, (left + up) >> 1, paeth(left, up, upLeft)][filter] ?? 0;
      rows[row * stride + index] = (filtered + predicted) & 0xff;
    }
  }
  return rows;
};

// Le pixel qui commence à l'octet `first` des lignes : rouge, vert, bleu, alpha.
const pixelAt = (rows: Uint8Array, first: number, colorType: number, palette: Buffer): number[] => {
  if (colorType === COLOR_TYPE_INDEXED) {
    const color = (rows[first] ?? 0) * 3;
    return [palette[color] ?? 0, palette[color + 1] ?? 0, palette[color + 2] ?? 0, 255];
  }
  const alpha = colorType === COLOR_TYPE_RGBA ? (rows[first + 3] ?? 0) : 255;
  return [rows[first] ?? 0, rows[first + 1] ?? 0, rows[first + 2] ?? 0, alpha];
};

const toRgba = (rows: Uint8Array, count: number, colorType: number, palette: Buffer): Uint8Array => {
  const rgba = new Uint8Array(count * 4);
  const bytesPerPixel = BYTES_PER_PIXEL[colorType] ?? 1;
  for (let pixel = 0; pixel < count; pixel++)
    rgba.set(pixelAt(rows, pixel * bytesPerPixel, colorType, palette), pixel * 4);
  return rgba;
};

export function decodePng(png: Uint8Array): DecodedPng {
  const file = Buffer.from(png);
  if (file.length < SIGNATURE_BYTES || file.readUInt32BE(0) !== 0x89504e47)
    throw new Error("png-decoder : ce n'est pas un PNG");
  const chunks = listChunks(file);
  const header = chunks.find(({ type }) => type === "IHDR")?.body;
  if (!header) throw new Error("png-decoder : IHDR absent");
  const [width, height, colorType] = [header.readUInt32BE(0), header.readUInt32BE(4), header[9] ?? 0];
  if (header[8] !== 8 || header[12] !== 0)
    throw new Error("png-decoder : 8 bits sans entrelacement seulement");
  const bytesPerPixel = BYTES_PER_PIXEL[colorType];
  if (bytesPerPixel === undefined) throw new Error(`png-decoder : type de couleur ${colorType} non géré`);

  const compressed = Buffer.concat(chunks.filter(({ type }) => type === "IDAT").map(({ body }) => body));
  const rows = unfilter(inflateSync(compressed), width, height, bytesPerPixel);
  const palette = chunks.find(({ type }) => type === "PLTE")?.body ?? Buffer.alloc(0);
  return { width, height, rgba: toRgba(rows, width * height, colorType, palette) };
}
