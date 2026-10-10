import { describe, expect, it } from "vitest";
import { decodePng } from "./png-decoder";
import { encodeRgbPng } from "./rgb-png";

describe("l'encodeur de PNG en couleurs vraies", () => {
  // Quand une image est encodée puis décodée, le système doit rendre chaque pixel tel qu'il l'a reçu, opaque
  it("gives every pixel back as it was received, opaque, once decoded", () => {
    const rgb = Uint8Array.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 10, 20, 30, 250, 251, 252, 0, 0, 0]);

    const decoded = decodePng(encodeRgbPng({ width: 3, height: 2, rgb }));

    expect([decoded.width, decoded.height]).toEqual([3, 2]);
    expect([...decoded.rgba]).toEqual([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 10, 20, 30, 255, 250, 251, 252, 255, 0, 0, 0, 255,
    ]);
  });

  // Quand les valeurs montent puis redescendent d'un pixel à l'autre, le filtre ne doit pas les fausser (octets modulo 256)
  it("keeps values that wrap around between pixels, bytes being taken modulo 256", () => {
    const rgb = Uint8Array.from([250, 5, 128, 3, 250, 0, 255, 0, 1]);

    const decoded = decodePng(encodeRgbPng({ width: 3, height: 1, rgb }));

    expect([...decoded.rgba]).toEqual([250, 5, 128, 255, 3, 250, 0, 255, 255, 0, 1, 255]);
  });

  // Quand l'image est un dégradé lisse, le système doit la compresser très en deçà de ses octets bruts
  it("compresses a smooth gradient far below its raw bytes", () => {
    const [width, height] = [600, 315];
    const rgb = new Uint8Array(width * height * 3);
    for (let pixel = 0; pixel < width * height; pixel++)
      rgb.set([(pixel % width) >> 2, (pixel / width) >> 2, 90], pixel * 3);

    const png = encodeRgbPng({ width, height, rgb });

    expect(png.length).toBeLessThan((width * height * 3) / 20);
  });

  // Si le nombre d'octets n'est pas trois par pixel, alors le système doit refuser l'image
  it("refuses a byte count that is not three per pixel", () => {
    expect(() => encodeRgbPng({ width: 2, height: 2, rgb: new Uint8Array(11) })).toThrow(/octets/);
  });
});
