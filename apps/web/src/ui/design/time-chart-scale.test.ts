import { describe, expect, it } from "vitest";
import { CHART_HEIGHT, chartMax, nearestSlot, stepSlot, toChartPaths } from "./time-chart-scale";

describe("the scale of the curves (écart §4.3, JOURNAL 2026-10-06)", () => {
  // Monte jusqu'à la plus grande valeur, et jamais sous 1 : une courbe à zéro reste au sol
  it("rises up to the largest value, and never below 1: a curve at zero stays on the ground", () => {
    expect(chartMax([3, null, 12, 7])).toBe(12);
    expect(chartMax([0, 0, null])).toBe(1);
    expect(chartMax([])).toBe(1);
  });

  // Place chaque valeur sur son créneau, le zéro en bas, le maximum presque en haut
  it("puts each value on its slot, zero at the bottom, the maximum near the top", () => {
    const { line } = toChartPaths([0, 5, 10], 10);

    expect(line).toBe(`M0,${CHART_HEIGHT}L1,52L2,4`);
  });

  // Coupe la courbe là où un point manque, et marque d'un point une valeur seule entre deux trous
  it("breaks the curve where a point is missing, and dots a value alone between two gaps", () => {
    const { line, area } = toChartPaths([2, 2, null, 4, null, null, 1], 4);

    expect(line).toBe("M0,52L1,52M3,4l0,0M6,76l0,0");
    const ground = CHART_HEIGHT;
    expect(area).toBe(
      `M0,${ground}L0,52L1,52L1,${ground}ZM3,${ground}L3,4L3,${ground}ZM6,${ground}L6,76L6,${ground}Z`,
    );
    expect(toChartPaths([null, null], 1)).toEqual({ line: "", area: "" });
  });

  // Sous le doigt ou la souris, prend le créneau le plus proche qui a un point
  it("takes, under the finger or the mouse, the nearest slot that has a point", () => {
    const slots = [null, "a", null, null, "b", null];

    expect(nearestSlot(2, slots)).toBe(1);
    expect(nearestSlot(3, slots)).toBe(4);
    expect(nearestSlot(9, slots)).toBe(4);
    expect(nearestSlot(-2, slots)).toBe(1);
    expect(nearestSlot(0, [null, null])).toBeNull();
  });

  // Au clavier, passe au point voisin et reste au bord
  it("moves to the next point with the keyboard, and stays at the edge", () => {
    const slots = ["a", null, "b", null];

    expect(stepSlot(0, 1, slots)).toBe(2);
    expect(stepSlot(2, 1, slots)).toBe(2);
    expect(stepSlot(2, -1, slots)).toBe(0);
  });
});
