import { describe, expect, it } from "vitest";
import { cellLine } from "./cell-line";
import type { Cell } from "./viewport";

// Deux cases qui se suivent se touchent, par un côté ou par un coin : le tracé n'a pas de trou.
const isContinuous = (cells: Cell[]) =>
  cells.every((cell, index) => {
    const previous = cells[index - 1];
    return !previous || (Math.abs(cell.x - previous.x) <= 1 && Math.abs(cell.y - previous.y) <= 1);
  });

describe("cellLine (CDC 2026, le tracé continu)", () => {
  // Rend la seule case quand la souris n'a pas changé de case
  it("gives the single cell when the mouse stayed on the same cell", () => {
    expect(cellLine({ x: 3, y: 4 }, { x: 3, y: 4 })).toEqual([{ x: 3, y: 4 }]);
  });

  // Relie deux cases lointaines sans trou, des deux bouts compris, dans les deux sens et à toutes les pentes
  it("joins two far cells without a hole, both ends included, in both directions and at any slope", () => {
    const ends: [Cell, Cell][] = [
      [
        { x: 0, y: 0 },
        { x: 12, y: 0 },
      ],
      [
        { x: 12, y: 3 },
        { x: 0, y: 0 },
      ],
      [
        { x: 2, y: 20 },
        { x: 5, y: 1 },
      ],
      [
        { x: 0, y: 0 },
        { x: 7, y: 7 },
      ],
    ];
    for (const [from, to] of ends) {
      const cells = cellLine(from, to);
      expect(cells[0]).toEqual(from);
      expect(cells.at(-1)).toEqual(to);
      expect(isContinuous(cells)).toBe(true);
      expect(cells).toHaveLength(Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y)) + 1);
    }
  });
});
