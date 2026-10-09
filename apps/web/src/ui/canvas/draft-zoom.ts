// Le zoom qui vise une case confortable, Écart §9.3 (JOURNAL 2026-10-08, 2026-10-09) : au toucher d'une case trop petite en Vue.
// Entrer en Dessin n'y touche plus. Tout en pixels CSS et sans DOM.

import type { Cell, Insets, ScreenPoint, Size, Viewport, ZoomLimits } from "./viewport";

// Le doigt (pointeur grossier) vise moins fin que la souris : il lui faut des cases plus grandes.
export type PointerGrain = "coarse" | "fine";

// Un rectangle à l'écran, en pixels CSS.
export type Rect = { left: number; top: number; right: number; bottom: number };

// `min` : sous cette taille de case, un toucher en Vue zoome. `target` : la taille qu'il vise sur un grand écran.
export const COMFORTABLE_CELL: Record<PointerGrain, { min: number; target: number }> = {
  coarse: { min: 20, target: 28 },
  fine: { min: 10, target: 16 },
};

// Cases à voir au moins sur le petit côté de la zone libre (Écart §9.3, JOURNAL 2026-10-09). À 28 px, un téléphone en portrait
// en montre 13 à 14 (375 à 390 px), un en paysage 10 à 12 (290 à 361 px de haut, selon la barre du navigateur et le thème).
export const MIN_VISIBLE_CELLS: Record<PointerGrain, number> = { coarse: 14, fine: 24 };

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

// La zone visible : l'espace libre entre les marges des pills.
export function freeArea(screen: Size, insets: Insets): Rect {
  return {
    left: insets.left,
    top: insets.top,
    right: screen.width - insets.right,
    bottom: screen.height - insets.bottom,
  };
}

// La taille de case visée dans cette zone libre : celle du pointeur, rognée pour garder `MIN_VISIBLE_CELLS` cases sur son petit
// côté, jamais sous le seuil de confort.
export function comfortableCell(grain: PointerGrain, area: Rect): number {
  const { min, target } = COMFORTABLE_CELL[grain];
  const shortSide = Math.min(area.right - area.left, area.bottom - area.top);
  return clamp(shortSide / MIN_VISIBLE_CELLS[grain], min, target);
}

// Une case sous le seuil de confort : trop petite pour y viser.
export const isCellTooSmall = (viewport: Viewport, grain: PointerGrain): boolean =>
  viewport.scale < COMFORTABLE_CELL[grain].min;

// Les coordonnées, en cases, de ce que montre un point de l'écran (fractionnaires).
const cellUnder = (viewport: Viewport, point: ScreenPoint): Cell => ({
  x: (point.x - viewport.offsetX) / viewport.scale,
  y: (point.y - viewport.offsetY) / viewport.scale,
});

// La vue d'échelle `scale` qui pose cette position du canvas sous ce point de l'écran.
const placeAt = (cell: Cell, point: ScreenPoint, scale: number): Viewport => ({
  scale,
  offsetX: point.x - cell.x * scale,
  offsetY: point.y - cell.y * scale,
});

// Un toucher sur une case trop petite pour viser, en Vue : plutôt que d'inspecter, la vue zoome jusqu'à la taille confortable de la zone
// libre, le point touché restant sous le doigt. `null` : la case est assez grande, le toucher inspecte comme avant.
export function tapZoomTarget(
  viewport: Viewport,
  point: ScreenPoint,
  grain: PointerGrain,
  area: Rect,
  limits: ZoomLimits,
): Viewport | null {
  if (!isCellTooSmall(viewport, grain)) return null;
  const scale = Math.min(comfortableCell(grain, area), limits.maxScale);
  if (scale <= viewport.scale) return null;
  return placeAt(cellUnder(viewport, point), point, scale);
}

// Une image de l'animation, `progress` de 0 à 1 déjà adouci par la courbe. L'échelle croît à rythme constant (le zoom se voit
// régulier), et le décalage en suit le chemin : le point que `to` garde fixe l'est à chaque image, sans qu'on le connaisse.
export function zoomFrame(from: Viewport, to: Viewport, progress: number): Viewport {
  if (progress <= 0) return from;
  if (progress >= 1) return to;
  const ratio = to.scale / from.scale;
  const grown = ratio ** progress;
  const weight = ratio === 1 ? progress : (1 - grown) / (1 - ratio);
  return {
    scale: from.scale * grown,
    offsetX: from.offsetX + (to.offsetX - from.offsetX) * weight,
    offsetY: from.offsetY + (to.offsetY - from.offsetY) * weight,
  };
}
