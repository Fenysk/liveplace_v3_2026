import { toStateOffset } from "@liveplace/domain";
import { describe, expect, it } from "vitest";
import { listOutsidePixels, toCanvasSize, toSizeChoice } from "./canvas-size";

describe("the canvas size (JOURNAL 2026-09-29)", () => {
  // Retrouve le format et la taille d'un canvas, et propose le grand carré à un canvas d'avant les formats
  it("finds a canvas's format and size, and offers the large square to a canvas born before formats", () => {
    expect(toSizeChoice({ width: 128, height: 72 })).toEqual({ format: "16:9", sizeIndex: 1 });
    expect(toSizeChoice({ width: 256, height: 256 })).toEqual({ format: "1:1", sizeIndex: 2 });
    expect(toCanvasSize({ format: "3:4", sizeIndex: 0 })).toEqual({ width: 45, height: 60 });
  });

  // Liste les pixels posés qui sortent du cadre, jamais une case transparente
  it("lists the placed pixels leaving the frame, never a transparent cell", () => {
    const current = { width: 4, height: 3 };
    const pixels = new Uint8Array(12);
    pixels[toStateOffset(0, 0, 4)] = 5;
    pixels[toStateOffset(3, 0, 4)] = 6;
    pixels[toStateOffset(1, 2, 4)] = 7;

    expect(listOutsidePixels(pixels, current, { width: 3, height: 2 })).toEqual([
      { x: 3, y: 0, colorIndex: 6 },
      { x: 1, y: 2, colorIndex: 7 },
    ]);
    expect(listOutsidePixels(pixels, current, { width: 5, height: 5 })).toEqual([]);
  });
});
