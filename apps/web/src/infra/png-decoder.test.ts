import { crc32, deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { encodeIndexedPng } from "./indexed-png";
import { decodePng } from "./png-decoder";

const chunk = (type: string, body: Buffer): Buffer => {
  const typeAndBody = Buffer.concat([Buffer.from(type, "latin1"), body]);
  const frame = Buffer.alloc(body.length + 12);
  frame.writeUInt32BE(body.length, 0);
  typeAndBody.copy(frame, 4);
  frame.writeUInt32BE(crc32(typeAndBody), frame.length - 4);
  return frame;
};

// Un PNG en couleurs vraies 8 bits, dont chaque ligne est déjà filtrée : `raw` = octet de filtre puis octets de la ligne
const truecolorPng = (width: number, height: number, colorType: 2 | 6, raw: number[]): Uint8Array => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = colorType;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.from(raw))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};

describe("le décodeur de PNG des tests", () => {
  // Quand un PNG à palette est décodé, le système doit rendre la couleur de chaque pixel en rouge, vert, bleu, alpha
  it("gives the color of every pixel of an indexed PNG as red, green, blue and alpha", () => {
    const png = encodeIndexedPng({
      width: 2,
      height: 1,
      palette: [
        [255, 0, 0],
        [1, 2, 3],
      ],
      pixels: Uint8Array.from([1, 0]),
    });

    expect(decodePng(png)).toEqual({
      width: 2,
      height: 1,
      rgba: Uint8Array.from([1, 2, 3, 255, 255, 0, 0, 255]),
    });
  });

  // Quand un PNG en couleurs vraies a des lignes filtrées « Sub » puis « Up », le système doit les défiltrer
  it("unfilters the rows of a truecolor PNG filtered with Sub then Up", () => {
    const png = truecolorPng(2, 2, 6, [
      1,
      10,
      20,
      30,
      255,
      5,
      5,
      5,
      0, // Sub : le second pixel s'ajoute au premier
      2,
      1,
      1,
      1,
      0,
      0,
      0,
      0,
      0, // Up : chaque octet s'ajoute à celui de la ligne du dessus
    ]);

    expect(decodePng(png).rgba).toEqual(
      Uint8Array.from([10, 20, 30, 255, 15, 25, 35, 255, 11, 21, 31, 255, 15, 25, 35, 255]),
    );
  });

  // Quand un PNG en rouge, vert, bleu sans alpha est décodé, le système doit le rendre opaque
  it("makes an RGB PNG without alpha opaque", () => {
    expect(decodePng(truecolorPng(1, 1, 2, [0, 9, 8, 7])).rgba).toEqual(Uint8Array.from([9, 8, 7, 255]));
  });

  // Si l'image n'est pas un PNG 8 bits d'un type connu, alors le système doit refuser en le disant
  it("refuses what is not an 8-bit PNG of a known type", () => {
    expect(() => decodePng(Uint8Array.from([1, 2, 3]))).toThrow(/PNG/);
    expect(() =>
      decodePng(truecolorPng(1, 1, 6, [0, 1, 2, 3, 4]).map((byte, index) => (index === 25 ? 4 : byte))),
    ).toThrow(/type/);
  });
});
