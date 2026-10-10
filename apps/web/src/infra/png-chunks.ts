// Les morceaux d'un PNG écrit à la main, communs à l'image à palette et à l'image en couleurs vraies : `node:zlib` donne le CRC.

import { crc32 } from "node:zlib";

export const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export const BIT_DEPTH = 8;
export const COLOR_TYPE_RGB = 2;
export const COLOR_TYPE_INDEXED = 3;
export const FILTER_NONE = 0;
const CHUNK_FRAME_BYTES = 12; // longueur, type et CRC autour du contenu

// Un chunk : la longueur du contenu, le type, le contenu, puis le CRC-32 du type et du contenu.
export const pngChunk = (type: string, body: Uint8Array): Buffer => {
  const typeAndBody = Buffer.concat([Buffer.from(type, "latin1"), body]);
  const frame = Buffer.alloc(body.length + CHUNK_FRAME_BYTES);
  frame.writeUInt32BE(body.length, 0);
  typeAndBody.copy(frame, 4);
  frame.writeUInt32BE(crc32(typeAndBody), frame.length - 4);
  return frame;
};

export const pngHeader = (width: number, height: number, colorType: number): Buffer => {
  const body = Buffer.alloc(13); // compression, filtrage et entrelacement restent à 0
  body.writeUInt32BE(width, 0);
  body.writeUInt32BE(height, 4);
  body[8] = BIT_DEPTH;
  body[9] = colorType;
  return pngChunk("IHDR", body);
};
