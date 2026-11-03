import { describe, expect, it } from "vitest";
import { INSPECTED_CELL, SCRIBBLE_CELLS } from "./inspection-scene";

describe("le gribouillis des vignettes Signaler et Effacer", () => {
  // La case que la souris clique est un pixel du gribouillis : la pill décrit bien ce dessin
  it("paints the inspected cell", () => {
    expect(SCRIBBLE_CELLS.some(({ x, y }) => x === INSPECTED_CELL.x && y === INSPECTED_CELL.y)).toBe(true);
  });

  // Quelques traits, jamais une forme reconnaissable : ni plein, ni symétrique (une symétrie ferait un personnage)
  it("is a few thin strokes with no mirror symmetry", () => {
    expect(SCRIBBLE_CELLS.length).toBeGreaterThanOrEqual(12);
    expect(SCRIBBLE_CELLS.length).toBeLessThanOrEqual(18);
    const width = 1 + Math.max(...SCRIBBLE_CELLS.map(({ x }) => x));
    const keys = new Set(SCRIBBLE_CELLS.map(({ x, y }) => `${x},${y}`));
    expect(SCRIBBLE_CELLS.every(({ x, y }) => keys.has(`${width - 1 - x},${y}`))).toBe(false);
  });
});
