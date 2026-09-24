// Les cases entre deux positions de la souris (CDC 2026) : un tracé rapide saute des cases, la ligne les rend.

import type { Cell } from "./viewport";

// Bresenham : une case par pas sur l'axe le plus long, les deux bouts compris.
export function cellLine(from: Cell, to: Cell): Cell[] {
  const dx = Math.abs(to.x - from.x);
  const dy = -Math.abs(to.y - from.y);
  const stepX = from.x < to.x ? 1 : -1;
  const stepY = from.y < to.y ? 1 : -1;
  const cells: Cell[] = [];
  let { x, y } = from;
  let error = dx + dy;
  for (;;) {
    cells.push({ x, y });
    if (x === to.x && y === to.y) return cells;
    const doubled = error * 2;
    if (doubled >= dy) {
      error += dy;
      x += stepX;
    }
    if (doubled <= dx) {
      error += dx;
      y += stepY;
    }
  }
}
