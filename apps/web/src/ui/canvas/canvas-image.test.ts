import { describe, expect, it } from "vitest";
import { fillImage, toColorTable } from "./canvas-image";

// Relit une couleur de l'image comme le fait le navigateur : quatre octets R, G, B, A.
const bytesOf = (target: Uint32Array, offset: number) => [...new Uint8Array(target.buffer, offset * 4, 4)];

describe("canvas image (Écart §9.3)", () => {
  const colorTable = toColorTable(["#00000000", "#ec273f", "#36c5f480"]);

  // Chaque couleur arrive dans l'image dans l'ordre R, G, B, A
  it("writes each color into the image in R, G, B, A order", () => {
    const target = new Uint32Array(3);
    fillImage(target, new Uint8Array([1, 2, 0]), colorTable);
    expect(bytesOf(target, 0)).toEqual([0xec, 0x27, 0x3f, 0xff]);
    expect(bytesOf(target, 1)).toEqual([0x36, 0xc5, 0xf4, 0x80]);
    expect(bytesOf(target, 2)).toEqual([0, 0, 0, 0]);
  });

  // Un index hors palette reste transparent, sans casser l'image
  it("keeps an index outside the palette transparent", () => {
    const target = new Uint32Array([0xffffffff]);
    fillImage(target, new Uint8Array([9]), colorTable);
    expect(bytesOf(target, 0)).toEqual([0, 0, 0, 0]);
  });
});
