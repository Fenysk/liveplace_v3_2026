// Le cadrage du canvas à l'écran (§9.3), tout en pixels CSS : le devicePixelRatio n'entre jamais ici.

export type Size = { width: number; height: number };
export type ScreenPoint = { x: number; y: number };
export type Cell = { x: number; y: number };

// `scale` : la taille d'une case à l'écran. `offsetX`, `offsetY` : le coin haut gauche du canvas.
export type Viewport = { scale: number; offsetX: number; offsetY: number };
export type ZoomLimits = { minScale: number; maxScale: number };

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
