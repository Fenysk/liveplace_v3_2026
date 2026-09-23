// Une image à l'écran (§9.3), dans l'ordre : le vide, le damier, les pixels, la grille, la bordure, la case visée.
// Tout ici est en pixels physiques : les pixels CSS du viewport sont multipliés par `pixelRatio`.

import type { Cell, Size, Viewport } from "./viewport";

export type Scene = {
  screen: Size; // pixels CSS
  pixelRatio: number;
  viewport: Viewport;
  canvas: Size;
  image: CanvasImageSource;
  checker: CanvasPattern;
  targetCell: Cell | null;
};

type Rect = { left: number; top: number; width: number; height: number };

// Aussi le fond de la page : avant la connexion, le vide est déjà là.
export const VOID_COLOR = "#1b1d27";
const CHECKER_SHADES = ["#d6d6dc", "#c2c2ca"] as const;
const CHECKER_DIVISOR = 48;
const GRID_MIN_SCALE = 8;
const GRID_COLOR = "rgba(0, 0, 0, 0.18)";
const BORDER_COLOR = "rgba(255, 255, 255, 0.55)";

// Le damier du pixel transparent, accroché à l'écran : il ne suit ni le zoom ni le déplacement (CDC 2026).
export function createChecker(
  context: CanvasRenderingContext2D,
  screen: Size,
  pixelRatio: number,
): CanvasPattern {
  const square = Math.max(
    2,
    Math.round((Math.min(screen.width, screen.height) * pixelRatio) / CHECKER_DIVISOR),
  );
  const patternSource = document.createElement("canvas");
  patternSource.width = square * 2;
  patternSource.height = square * 2;
  const patternContext = patternSource.getContext("2d");
  if (!patternContext) throw new Error("render-scene : contexte 2d indisponible");
  patternContext.fillStyle = CHECKER_SHADES[0];
  patternContext.fillRect(0, 0, square * 2, square * 2);
  patternContext.fillStyle = CHECKER_SHADES[1];
  patternContext.fillRect(0, 0, square, square);
  patternContext.fillRect(square, square, square, square);
  const pattern = context.createPattern(patternSource, "repeat");
  if (!pattern) throw new Error("render-scene : motif du damier indisponible");
  return pattern;
}

// Les bords intérieurs des cases visibles, centrés sur un pixel physique pour un trait net.
const innerEdges = (origin: number, cellSize: number, count: number, screenLength: number): number[] => {
  const first = Math.max(1, Math.ceil(-origin / cellSize));
  const last = Math.min(count - 1, Math.floor((screenLength - origin) / cellSize));
  const edges: number[] = [];
  for (let index = first; index <= last; index++) edges.push(Math.round(origin + index * cellSize) + 0.5);
  return edges;
};

// Un contour tracé entièrement hors du rectangle, `ring` anneaux plus loin.
const strokeOutside = (context: CanvasRenderingContext2D, rect: Rect, lineWidth: number, ring: number) => {
  const gap = lineWidth * (ring + 0.5);
  context.lineWidth = lineWidth;
  context.strokeRect(rect.left - gap, rect.top - gap, rect.width + gap * 2, rect.height + gap * 2);
};

export function renderScene(context: CanvasRenderingContext2D, scene: Scene): void {
  const { screen, pixelRatio, viewport, canvas } = scene;
  const cellSize = viewport.scale * pixelRatio;
  const originX = viewport.offsetX * pixelRatio;
  const originY = viewport.offsetY * pixelRatio;
  const screenWidth = screen.width * pixelRatio;
  const screenHeight = screen.height * pixelRatio;
  const cellRect = (x: number, y: number, width: number, height: number): Rect => {
    const left = Math.round(originX + x * cellSize);
    const top = Math.round(originY + y * cellSize);
    return {
      left,
      top,
      width: Math.round(originX + (x + width) * cellSize) - left,
      height: Math.round(originY + (y + height) * cellSize) - top,
    };
  };
  const canvasRect = cellRect(0, 0, canvas.width, canvas.height);
  const lineWidth = Math.max(1, Math.round(pixelRatio));

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.fillStyle = VOID_COLOR;
  context.fillRect(0, 0, screenWidth, screenHeight);
  context.fillStyle = scene.checker;
  context.fillRect(canvasRect.left, canvasRect.top, canvasRect.width, canvasRect.height);

  // Remis à chaque image : redimensionner un <canvas> remet son contexte à zéro.
  context.imageSmoothingEnabled = false;
  context.drawImage(scene.image, originX, originY, canvas.width * cellSize, canvas.height * cellSize);

  if (viewport.scale >= GRID_MIN_SCALE) {
    const top = Math.max(0, canvasRect.top);
    const bottom = Math.min(screenHeight, canvasRect.top + canvasRect.height);
    const left = Math.max(0, canvasRect.left);
    const right = Math.min(screenWidth, canvasRect.left + canvasRect.width);
    context.beginPath();
    for (const x of innerEdges(originX, cellSize, canvas.width, screenWidth)) {
      context.moveTo(x, top);
      context.lineTo(x, bottom);
    }
    for (const y of innerEdges(originY, cellSize, canvas.height, screenHeight)) {
      context.moveTo(left, y);
      context.lineTo(right, y);
    }
    context.lineWidth = 1;
    context.strokeStyle = GRID_COLOR;
    context.stroke();
  }

  context.strokeStyle = BORDER_COLOR;
  strokeOutside(context, canvasRect, lineWidth, 0);

  if (scene.targetCell) {
    // Blanc contre la case, noir autour : visible sur toutes les couleurs, à tous les zooms.
    const target = cellRect(scene.targetCell.x, scene.targetCell.y, 1, 1);
    context.strokeStyle = "#ffffff";
    strokeOutside(context, target, lineWidth, 0);
    context.strokeStyle = "#000000";
    strokeOutside(context, target, lineWidth, 1);
  }
}
