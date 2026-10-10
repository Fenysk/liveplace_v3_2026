import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { IndexedImage } from "../shared/indexed-image";
import { encodeIndexedPng } from "./indexed-png";

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// Le CRC-32 de la norme PNG, bit à bit, écrit à part du code testé
const referenceCrc = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
};

type Chunk = { type: string; body: Buffer; crc: number; expectedCrc: number };

// Les chunks dans l'ordre du fichier : longueur, type, contenu, CRC lu et CRC recalculé sur type + contenu
const listChunks = (png: Uint8Array): Chunk[] => {
  const file = Buffer.from(png);
  const chunks: Chunk[] = [];
  for (let offset = SIGNATURE.length; offset < file.length; ) {
    const length = file.readUInt32BE(offset);
    const typeAndBody = file.subarray(offset + 4, offset + 8 + length);
    chunks.push({
      type: typeAndBody.subarray(0, 4).toString("latin1"),
      body: typeAndBody.subarray(4),
      crc: file.readUInt32BE(offset + 8 + length),
      expectedCrc: referenceCrc(typeAndBody),
    });
    offset += 12 + length;
  }
  return chunks;
};

const IMAGE: IndexedImage = {
  width: 3,
  height: 2,
  palette: [
    [0, 0, 0],
    [255, 128, 7],
    [1, 2, 3],
  ],
  pixels: Uint8Array.from([0, 1, 2, 2, 1, 0]),
};

describe("l'encodeur de PNG à palette", () => {
  // Quand une image est encodée, le système doit écrire la signature PNG puis IHDR, PLTE, IDAT et IEND, dans cet ordre
  it("writes the PNG signature then IHDR, PLTE, IDAT and IEND in that order", () => {
    const png = encodeIndexedPng(IMAGE);

    expect([...png.subarray(0, 8)]).toEqual(SIGNATURE);
    expect(listChunks(png).map(({ type }) => type)).toEqual(["IHDR", "PLTE", "IDAT", "IEND"]);
  });

  // Quand une image est encodée, le système doit dire sa taille et une couleur indexée sur 8 bits, sans entrelacement
  it("states the size and 8-bit indexed color without interlacing", () => {
    const [header] = listChunks(encodeIndexedPng(IMAGE));

    expect(header?.body.readUInt32BE(0)).toBe(3);
    expect(header?.body.readUInt32BE(4)).toBe(2);
    expect([...(header?.body.subarray(8) ?? [])]).toEqual([8, 3, 0, 0, 0]);
  });

  // Quand une image est encodée, le CRC de chaque chunk doit être celui de son type et de son contenu
  it("gives every chunk the CRC-32 of its type and its content", () => {
    const chunks = listChunks(encodeIndexedPng(IMAGE));

    expect(chunks).toHaveLength(4);
    for (const { type, crc, expectedCrc } of chunks) expect([type, crc]).toEqual([type, expectedCrc]);
  });

  // Quand une image est encodée, la palette doit être écrite couleur après couleur, en rouge, vert, bleu
  it("writes the palette color after color as red, green and blue", () => {
    const palette = listChunks(encodeIndexedPng(IMAGE)).find(({ type }) => type === "PLTE");

    expect([...(palette?.body ?? [])]).toEqual([0, 0, 0, 255, 128, 7, 1, 2, 3]);
  });

  // Quand une image est encodée, l'IDAT relu doit donner chaque ligne précédée du filtre 0, sans rien d'autre
  it("inflates the IDAT back to each row preceded by the filter 0", () => {
    const idat = listChunks(encodeIndexedPng(IMAGE)).find(({ type }) => type === "IDAT");

    expect([...inflateSync(idat?.body ?? Buffer.alloc(0))]).toEqual([0, 0, 1, 2, 0, 2, 1, 0]);
  });

  // Quand l'image est grande et unie, le système doit la compresser très en deçà de ses octets bruts
  it("compresses a large flat image far below its raw bytes", () => {
    const flat = encodeIndexedPng({
      width: 1200,
      height: 630,
      palette: IMAGE.palette,
      pixels: new Uint8Array(756000),
    });

    expect(flat.length).toBeLessThan(4000);
  });

  // Si le nombre de pixels n'est pas largeur × hauteur, ou que la palette dépasse 256 couleurs, alors le système doit refuser l'image
  it("refuses a pixel count that is not width times height, and a palette over 256 colors", () => {
    expect(() => encodeIndexedPng({ ...IMAGE, pixels: new Uint8Array(5) })).toThrow(/pixels/);
    expect(() =>
      encodeIndexedPng({ ...IMAGE, palette: Array.from({ length: 257 }, () => [0, 0, 0] as const) }),
    ).toThrow(/palette/);
  });
});
