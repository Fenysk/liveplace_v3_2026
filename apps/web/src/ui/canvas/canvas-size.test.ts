import { toStateOffset } from "@liveplace/domain";
import { describe, expect, it } from "vitest";
import { previewResize, toCanvasSize, toSizeChoice } from "./canvas-size";

describe("the canvas size (JOURNAL 2026-09-29)", () => {
  // Retrouve le format et la taille d'un canvas, et propose le grand carré à un canvas d'avant les formats
  it("finds a canvas's format and size, and offers the large square to a canvas born before formats", () => {
    expect(toSizeChoice({ width: 128, height: 72 })).toEqual({ format: "16:9", sizeIndex: 1 });
    expect(toSizeChoice({ width: 256, height: 256 })).toEqual({ format: "1:1", sizeIndex: 2 });
    expect(toCanvasSize({ format: "3:4", sizeIndex: 0 })).toEqual({ width: 45, height: 60 });
  });

  // Liste les pixels posés qui sortent du cadre une fois les dessins rapprochés, jamais une case transparente
  // (Écart §5.3, JOURNAL 2026-10-24 : le pixel en (3, 0) se rapproche de l'origine, seul celui en (1, 2) sort)
  it("lists the placed pixels leaving the frame once drawings are brought closer, never a transparent cell", () => {
    const current = { width: 4, height: 3 };
    const pixels = new Uint8Array(12);
    pixels[toStateOffset(0, 0, 4)] = 5;
    pixels[toStateOffset(3, 0, 4)] = 6;
    pixels[toStateOffset(1, 2, 4)] = 7;

    expect(previewResize(pixels, current, { width: 3, height: 2 }).outside).toEqual([
      { x: 1, y: 2, colorIndex: 7 },
    ]);
    expect(previewResize(pixels, current, { width: 5, height: 5 }).outside).toEqual([]);
  });

  // Dit si des dessins se rapprochent : un pixel qui change de case, pas une simple coupe
  it("says whether drawings come closer: a pixel changing cell, not a plain trim", () => {
    const current = { width: 8, height: 2 };
    const pixels = new Uint8Array(16);
    pixels[toStateOffset(0, 0, 8)] = 5;
    pixels[toStateOffset(6, 0, 8)] = 6;

    expect(previewResize(pixels, current, { width: 4, height: 2 }).hasMovedPixels).toBe(true);
    expect(previewResize(pixels, current, { width: 8, height: 1 }).hasMovedPixels).toBe(false);
    expect(previewResize(pixels, current, { width: 16, height: 4 }).hasMovedPixels).toBe(false);
  });
});
