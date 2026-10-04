// Le cadrage du canvas à l'écran (§9.3), tout en pixels CSS : le devicePixelRatio n'entre jamais ici.

export type Size = { width: number; height: number };
export type ScreenPoint = { x: number; y: number };
export type Cell = { x: number; y: number };

// `scale` : la taille d'une case à l'écran. `offsetX`, `offsetY` : le coin haut gauche du canvas.
export type Viewport = { scale: number; offsetX: number; offsetY: number };
export type ZoomLimits = { minScale: number; maxScale: number };
// Les marges à garder aux bords de l'écran, en pixels CSS : les pills y flottent.
export type Insets = { top: number; right: number; bottom: number; left: number };
// Ce que la pill Pratique montre du cadrage : le pourcentage, et si la vue a bougé depuis l'arrivée.
export type Framing = { zoomPercent: number; isArrival: boolean };

const ARRIVAL_RATIO = 0.9;
const MAX_CELL_SIZE = 64;

// Centré, à 90 % du côté qui limite : jamais de débordement à l'arrivée (CDC 2026).
export function fitViewport(screen: Size, canvas: Size): Viewport {
  const scale = Math.min(
    (screen.width * ARRIVAL_RATIO) / canvas.width,
    (screen.height * ARRIVAL_RATIO) / canvas.height,
  );
  return {
    scale,
    offsetX: (screen.width - canvas.width * scale) / 2,
    offsetY: (screen.height - canvas.height * scale) / 2,
  };
}

// Un point de la fenêtre, compté depuis le coin du canvas : la bande de la publicité peut le décaler du coin de la fenêtre.
export function toSurfacePoint(point: ScreenPoint, surfaceOrigin: ScreenPoint): ScreenPoint {
  return { x: point.x - surfaceOrigin.x, y: point.y - surfaceOrigin.y };
}

// Quand l'écran change de taille (la bande de la publicité arrive ou part), le point du canvas au centre y reste.
export function keepCenter(viewport: Viewport, from: Size, to: Size): Viewport {
  return panBy(viewport, (to.width - from.width) / 2, (to.height - from.height) / 2);
}

// Le seul chemin de l'écran vers une case. `null` : le point est dans le vide.
export function viewportToCell(viewport: Viewport, point: ScreenPoint, canvas: Size): Cell | null {
  const x = Math.floor((point.x - viewport.offsetX) / viewport.scale);
  const y = Math.floor((point.y - viewport.offsetY) / viewport.scale);
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return null;
  return { x, y };
}

export function zoomLimits(screen: Size, canvas: Size): ZoomLimits {
  return { minScale: fitViewport(screen, canvas).scale / 2, maxScale: MAX_CELL_SIZE };
}

// Le point visé garde sa place dans le canvas : l'écart entre lui et le coin grandit comme l'échelle.
export function zoomAt(viewport: Viewport, point: ScreenPoint, factor: number, limits: ZoomLimits): Viewport {
  const nextScale = Math.min(limits.maxScale, Math.max(limits.minScale, viewport.scale * factor));
  const ratio = nextScale / viewport.scale;
  return {
    scale: nextScale,
    offsetX: point.x - (point.x - viewport.offsetX) * ratio,
    offsetY: point.y - (point.y - viewport.offsetY) * ratio,
  };
}

export function panBy(viewport: Viewport, dx: number, dy: number): Viewport {
  return { ...viewport, offsetX: viewport.offsetX + dx, offsetY: viewport.offsetY + dy };
}

// Le pourcentage de la pill Pratique : 100 % au cadrage de l'arrivée (CDC 2026).
export function zoomPercent(viewport: Viewport, screen: Size, canvas: Size): number {
  return Math.round((viewport.scale / fitViewport(screen, canvas).scale) * 100);
}

// Sur mobile, Recentrer n'apparaît que quand la vue a bougé (CDC 2026, Mobile).
// À moins d'un pixel près : un arrondi n'est pas un déplacement.
export function isArrivalView(viewport: Viewport, screen: Size, canvas: Size): boolean {
  const arrival = fitViewport(screen, canvas);
  const isNear = (a: number, b: number) => Math.abs(a - b) < 1;
  return (
    isNear(viewport.scale * canvas.width, arrival.scale * canvas.width) &&
    isNear(viewport.offsetX, arrival.offsetX) &&
    isNear(viewport.offsetY, arrival.offsetY)
  );
}

// La case la plus proche dans le canvas : la case visée au clavier n'en sort jamais.
export function clampCell(cell: Cell, canvas: Size): Cell {
  return {
    x: Math.min(canvas.width - 1, Math.max(0, cell.x)),
    y: Math.min(canvas.height - 1, Math.max(0, cell.y)),
  };
}

// Le décalage qui ramène un segment [start, start + length] entre les deux marges, ou 0 s'il y est déjà.
const shiftInto = (start: number, length: number, low: number, high: number): number => {
  if (start < low) return low - start;
  if (start + length > high) return high - (start + length);
  return 0;
};

// La vue suit la case visée au clavier : elle glisse juste assez pour la garder entre les marges.
export function panToShow(viewport: Viewport, cell: Cell, screen: Size, insets: Insets): Viewport {
  const { scale, offsetX, offsetY } = viewport;
  const dx = shiftInto(offsetX + cell.x * scale, scale, insets.left, screen.width - insets.right);
  const dy = shiftInto(offsetY + cell.y * scale, scale, insets.top, screen.height - insets.bottom);
  return dx === 0 && dy === 0 ? viewport : panBy(viewport, dx, dy);
}
