import { describe, expect, it } from "vitest";
import { toPreviewArea } from "./preview-area";

const canvas = { width: 256, height: 256 };
const whole = { x: 0, y: 0, width: 256, height: 256 };

const contains = (area: ReturnType<typeof toPreviewArea>, x: number, y: number) =>
  x >= area.x && x < area.x + area.width && y >= area.y && y < area.y + area.height;

describe("toPreviewArea (JOURNAL 2026-09-25)", () => {
  // Montre tout le canvas sans pixel, ou quand ils sont dispersés
  it("shows the whole canvas without pixels, or when they are spread out", () => {
    expect(toPreviewArea([], canvas)).toEqual(whole);
    expect(
      toPreviewArea(
        [
          { x: 2, y: 3 },
          { x: 250, y: 240 },
        ],
        canvas,
      ),
    ).toEqual(whole);
  });

  // Cadre un petit dessin, carré, centré sur lui, avec une marge
  it("frames a small drawing, square and centered on it, with a margin", () => {
    const square = [
      { x: 100, y: 100 },
      { x: 105, y: 100 },
      { x: 100, y: 105 },
      { x: 105, y: 105 },
    ];

    const area = toPreviewArea(square, canvas);

    expect(area.width).toBe(area.height);
    expect(area.width).toBeGreaterThanOrEqual(16);
    expect(area.width).toBeLessThan(128);
    expect(square.every(({ x, y }) => contains(area, x, y))).toBe(true);
    expect(100 - area.x).toBe(area.x + area.width - 106);
  });

  // Reste dans le canvas quand le dessin touche un bord
  it("stays inside the canvas when the drawing touches an edge", () => {
    const corner = [
      { x: 0, y: 0 },
      { x: 3, y: 2 },
    ];

    const area = toPreviewArea(corner, canvas);

    expect(area.x).toBe(0);
    expect(area.y).toBe(0);
    expect(corner.every(({ x, y }) => contains(area, x, y))).toBe(true);
    expect(area.width).toBeLessThan(canvas.width);
    expect(area.x + area.width).toBeLessThanOrEqual(canvas.width);
  });
});
