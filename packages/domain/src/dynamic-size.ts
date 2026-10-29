// Écart §5.3 (JOURNAL 2026-10-28) : le resserrement d'une fresque qui passe en taille dynamique. Pur : redis-core l'applique.
// Une case vide est un `colorIndex` 0 dans `state`.

import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  type CanvasSize,
  DYNAMIC_SIZE_MARGIN,
  DYNAMIC_SIZE_MIN,
  toStateOffset,
} from "./index";

// Le nouveau cadre : la case (x, y) d'avant devient la case (x + dx, y + dy) dans un cadre de `width` × `height`.
export type Reframe = CanvasSize & { dx: number; dy: number };

// Un axe : de `first` à `last`, les lignes occupées (`first > last` : aucune). La longueur est celle des dessins et de leurs marges,
// d'au moins 10 et d'au plus `max` ; le surplus se répartit pour centrer, la case de trop après.
function tightenAxis(first: number, last: number, max: number): { length: number; shift: number } {
  if (first > last) return { length: DYNAMIC_SIZE_MIN, shift: 0 };
  const content = last - first + 1;
  const length = Math.min(max, Math.max(DYNAMIC_SIZE_MIN, content + 2 * DYNAMIC_SIZE_MARGIN));
  return { length, shift: Math.floor((length - content) / 2) - first };
}

// `state` : un octet par case de `from` (D-15 : `stateOffset`). Seuls des bords vides partent : aucun pixel posé n'est perdu.
export function planDynamicSize(state: Uint8Array, from: CanvasSize): Reframe {
  if (state.length !== from.width * from.height)
    throw new Error(
      `planDynamicSize : ${state.length} octets pour une fresque de ${from.width}×${from.height}`,
    );
  let [firstX, lastX, firstY, lastY] = [from.width, -1, from.height, -1];
  for (let y = 0; y < from.height; y++)
    for (let x = 0; x < from.width; x++) {
      if (state[toStateOffset(x, y, from.width)] === 0) continue;
      firstX = Math.min(firstX, x);
      lastX = Math.max(lastX, x);
      firstY = Math.min(firstY, y);
      lastY = Math.max(lastY, y);
    }
  const horizontal = tightenAxis(firstX, lastX, CANVAS_WIDTH);
  const vertical = tightenAxis(firstY, lastY, CANVAS_HEIGHT);
  return { width: horizontal.length, height: vertical.length, dx: horizontal.shift, dy: vertical.shift };
}

// Écart §9.3 (JOURNAL 2026-10-29) : de combien la fresque grandit, de chaque côté, quand `cells` se posent dans une fresque de `size`.
// C'est la règle de `planGrowth` de reframe.lua, que la page montre avant la pose : 3 cases vides par bord, et un axe au plafond (256)
// ne grandit plus, la gauche (le haut) avant la droite (le bas). Rien à ajouter : tout à zéro.
export type Growth = { left: number; top: number; right: number; bottom: number };

export const NO_GROWTH: Growth = { left: 0, top: 0, right: 0, bottom: 0 };

// Un axe : de `low` à `high`, les lignes posées ; `length` sa longueur, `max` son plafond. Rend ce qui s'ajoute avant, puis après.
function growOnAxis(low: number, high: number, length: number, max: number): [before: number, after: number] {
  const room = Math.max(0, max - length);
  const before = Math.min(Math.max(0, DYNAMIC_SIZE_MARGIN - low), room);
  const after = Math.min(Math.max(0, high + 1 + DYNAMIC_SIZE_MARGIN - length), room - before);
  return [before, after];
}

export function planGrowth(cells: readonly { x: number; y: number }[], size: CanvasSize): Growth {
  if (cells.length === 0) return NO_GROWTH;
  let [lowX, highX, lowY, highY] = [
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ];
  for (const { x, y } of cells) {
    lowX = Math.min(lowX, x);
    highX = Math.max(highX, x);
    lowY = Math.min(lowY, y);
    highY = Math.max(highY, y);
  }
  const [left, right] = growOnAxis(lowX, highX, size.width, CANVAS_WIDTH);
  const [top, bottom] = growOnAxis(lowY, highY, size.height, CANVAS_HEIGHT);
  return { left, top, right, bottom };
}
