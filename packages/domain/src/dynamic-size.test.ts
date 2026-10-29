import { describe, expect, it } from "vitest";
import { NO_GROWTH, planDynamicSize, planGrowth } from "./dynamic-size";
import { type CanvasSize, toStateOffset } from "./index";

const size = (width: number, height: number): CanvasSize => ({ width, height });

// Un rectangle plein de pixels, bornes incluses.
const stateWith = (
  { width, height }: CanvasSize,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
): Uint8Array => {
  const state = new Uint8Array(width * height);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) state[toStateOffset(x, y, width)] = 1;
  return state;
};

describe("planDynamicSize : le resserrement à l'activation (Écart §5.3, JOURNAL 2026-10-28)", () => {
  it("shrinks a 4×4 drawing in the middle of a 50×50 canvas to 10×10", () => {
    const from = size(50, 50);
    const plan = planDynamicSize(stateWith(from, 20, 23, 30, 33), from);
    expect(plan).toEqual({ width: 10, height: 10, dx: 3 - 20, dy: 3 - 30 });
  });

  it("makes an empty canvas 10×10 without moving anything", () => {
    const from = size(50, 36);
    expect(planDynamicSize(new Uint8Array(50 * 36), from)).toEqual({ width: 10, height: 10, dx: 0, dy: 0 });
  });

  it("keeps exactly three empty cells around a drawing wider than the minimum", () => {
    const from = size(100, 100);
    const plan = planDynamicSize(stateWith(from, 40, 49, 10, 19), from);
    expect(plan).toEqual({ width: 16, height: 16, dx: 3 - 40, dy: 3 - 10 });
  });

  it("centres a drawing narrower than the minimum, the spare cell going right and down", () => {
    const from = size(60, 60);
    // 3 de large : 7 cases de surplus, 3 avant et 4 après ; 2 de haut : 8 de surplus, 4 et 4.
    const plan = planDynamicSize(stateWith(from, 10, 12, 20, 21), from);
    expect(plan).toEqual({ width: 10, height: 10, dx: 3 - 10, dy: 4 - 20 });
  });

  it("grows a canvas whose drawing touches the borders, by three cells each side", () => {
    const from = size(50, 50);
    const plan = planDynamicSize(stateWith(from, 0, 49, 0, 49), from);
    expect(plan).toEqual({ width: 56, height: 56, dx: 3, dy: 3 });
  });

  it("stops at 256 per axis and shares what is left of the margin", () => {
    const from = size(256, 100);
    const plan = planDynamicSize(stateWith(from, 0, 254, 40, 49), from);
    // 255 cases de dessin dans 256 : une case de marge, après le dessin.
    expect(plan).toEqual({ width: 256, height: 16, dx: 0, dy: 3 - 40 });
  });

  it("is the identity on a canvas that is already tight", () => {
    const from = size(16, 16);
    expect(planDynamicSize(stateWith(from, 3, 12, 3, 12), from)).toEqual({
      width: 16,
      height: 16,
      dx: 0,
      dy: 0,
    });
  });

  it("refuses a state that does not match the size", () => {
    expect(() => planDynamicSize(new Uint8Array(3), size(2, 2))).toThrow();
  });
});

describe("planGrowth : de combien la fresque grandit à une pose (Écart §9.3, JOURNAL 2026-10-29)", () => {
  const grows = (cells: { x: number; y: number }[], width: number, height: number) =>
    planGrowth(cells, size(width, height));

  // Dans une 10 × 10 : la colonne 0 ajoute 3 colonnes à gauche, la colonne 7 en ajoute 1 à droite, la colonne 8 en ajoute 2
  it("adds 3 columns on the left for column 0 of a 10×10, 1 on the right for column 7 and 2 for column 8", () => {
    expect(grows([{ x: 7, y: 5 }], 10, 10)).toEqual({ left: 0, top: 0, right: 1, bottom: 0 });
    expect(grows([{ x: 8, y: 5 }], 10, 10)).toEqual({ left: 0, top: 0, right: 2, bottom: 0 });
    expect(grows([{ x: 0, y: 5 }], 10, 10)).toEqual({ left: 3, top: 0, right: 0, bottom: 0 });
  });

  // Les exemples du cahier des charges : x = 18 dans une 20 × 20 ajoute 2 colonnes à droite, x = 1 en ajoute 2 à gauche
  it("adds 2 columns on the right for x = 18 of a 20×20, and 2 on the left for x = 1", () => {
    expect(grows([{ x: 18, y: 5 }], 20, 20)).toEqual({ left: 0, top: 0, right: 2, bottom: 0 });
    expect(grows([{ x: 1, y: 5 }], 20, 20)).toEqual({ left: 2, top: 0, right: 0, bottom: 0 });
  });

  // Trois cases vides suffisent : rien à ajouter, au bord de la marge comme au milieu
  it("adds nothing when three cells stay empty on every side, and nothing for no cell", () => {
    expect(
      grows(
        [
          { x: 3, y: 3 },
          { x: 6, y: 6 },
        ],
        10,
        10,
      ),
    ).toEqual(NO_GROWTH);
    expect(grows([], 10, 10)).toEqual(NO_GROWTH);
  });

  // Un coin grandit les deux axes, et plusieurs cases se comptent ensemble
  it("grows both axes for a corner, and counts several cells together", () => {
    expect(grows([{ x: 0, y: 0 }], 20, 20)).toEqual({ left: 3, top: 3, right: 0, bottom: 0 });
    expect(grows([{ x: 19, y: 19 }], 20, 20)).toEqual({ left: 0, top: 0, right: 3, bottom: 3 });
    expect(
      grows(
        [
          { x: 8, y: 5 },
          { x: 1, y: 9 },
        ],
        10,
        10,
      ),
    ).toEqual({ left: 2, top: 0, right: 2, bottom: 3 });
  });

  // Au plafond de 256, l'axe ne grandit plus, et la gauche passe avant la droite
  it("stops at 256 per axis, the left before the right", () => {
    expect(grows([{ x: 254, y: 5 }], 255, 20)).toEqual({ left: 0, top: 0, right: 1, bottom: 0 });
    expect(grows([{ x: 255, y: 5 }], 256, 20)).toEqual(NO_GROWTH);
    expect(grows([{ x: 0, y: 5 }], 256, 20)).toEqual(NO_GROWTH);
    expect(
      grows(
        [
          { x: 1, y: 5 },
          { x: 252, y: 5 },
        ],
        254,
        20,
      ),
    ).toEqual({ left: 2, top: 0, right: 0, bottom: 0 });
  });
});
