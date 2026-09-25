// La zone du canvas que montre un aperçu de pixels (JOURNAL 2026-09-25) : tout le canvas, ou un carré autour d'un
// petit dessin. Sur 256 cases, un dessin de 6 cases serait sinon un point.

export type PreviewArea = { x: number; y: number; width: number; height: number };

type Cell = { x: number; y: number };
type Size = { width: number; height: number };

const MIN_SIDE = 16; // jamais moins de 16 cases de côté : le dessin garde un peu de contexte
const MARGIN_RATIO = 0.5; // une demi-taille du dessin de marge, de chaque côté

// Un côté de `side` cases centré sur [first, last], gardé dans [0, length].
const centered = (first: number, last: number, side: number, length: number): number =>
  Math.min(Math.max(0, Math.floor((first + last + 1 - side) / 2)), length - side);

export function toPreviewArea(cells: readonly Cell[], canvas: Size): PreviewArea {
  const whole = { x: 0, y: 0, ...canvas };
  if (cells.length === 0) return whole;
  // Une boucle, pas `Math.min(...xs)` : 65 536 arguments feraient déborder la pile.
  let [left, right, top, bottom] = [canvas.width, -1, canvas.height, -1];
  for (const { x, y } of cells) {
    [left, right, top, bottom] = [
      Math.min(left, x),
      Math.max(right, x),
      Math.min(top, y),
      Math.max(bottom, y),
    ];
  }
  const extent = Math.max(right - left + 1, bottom - top + 1);
  const side = Math.max(MIN_SIDE, Math.ceil(extent * (1 + 2 * MARGIN_RATIO)));
  // Plus de la moitié du canvas : autant le montrer en entier.
  if (side * 2 > Math.min(canvas.width, canvas.height)) return whole;
  return {
    x: centered(left, right, side, canvas.width),
    y: centered(top, bottom, side, canvas.height),
    width: side,
    height: side,
  };
}
