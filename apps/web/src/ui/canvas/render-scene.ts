// Une image à l'écran (§9.3), dans l'ordre : le vide, le damier, les pixels, le brouillon, la grille, la bordure,
// le contour du brouillon, la case visée. Tout ici est en pixels physiques : les pixels CSS du viewport sont multipliés par `pixelRatio`.

import { TRANSPARENT_COLOR_INDEX } from "@liveplace/domain";
import type { Pixel } from "../../state/canvas-store";
import type { Cell, Size, Viewport } from "./viewport";

export type Scene = {
  screen: Size; // pixels CSS
  pixelRatio: number;
  viewport: Viewport;
  canvas: Size;
  image: CanvasImageSource;
  checker: CanvasPattern;
  targetCell: Cell | null;
  draft: readonly Pixel[];
  palette: readonly string[];
  colorIndexAt(x: number, y: number): number; // la couleur posée, sous le brouillon
};

type Rect = { left: number; top: number; width: number; height: number };
type CellRect = (x: number, y: number) => Rect;

// Aussi le fond de la page : avant la connexion, le vide est déjà là.
export const VOID_COLOR = "#1b1d27";
const CHECKER_SHADES = ["#d6d6dc", "#c2c2ca"] as const;
const CHECKER_DIVISOR = 48;
const GRID_MIN_SCALE = 8;
const GRID_COLOR = "rgba(0, 0, 0, 0.18)";
const BORDER_COLOR = "rgba(255, 255, 255, 0.55)";
const DRAFT_ALPHA = 0.6;
const ERASED_ALPHA = 0.35;
const ERASER_CROSS_INSET = 0.2; // la croix de la gomme laisse un peu de marge dans la case

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

// La gomme : la couleur posée, pâlie, et une croix fine. Pas de damier (CDC 2026).
const fillErased = (context: CanvasRenderingContext2D, rect: Rect, color: string | undefined) => {
  context.globalAlpha = 1;
  context.fillStyle = VOID_COLOR;
  context.fillRect(rect.left, rect.top, rect.width, rect.height);
  if (color) {
    context.globalAlpha = ERASED_ALPHA;
    context.fillStyle = color;
    context.fillRect(rect.left, rect.top, rect.width, rect.height);
  }
  const insetX = rect.width * ERASER_CROSS_INSET;
  const insetY = rect.height * ERASER_CROSS_INSET;
  context.globalAlpha = 1;
  context.beginPath();
  context.moveTo(rect.left + insetX, rect.top + insetY);
  context.lineTo(rect.left + rect.width - insetX, rect.top + rect.height - insetY);
  context.moveTo(rect.left + rect.width - insetX, rect.top + insetY);
  context.lineTo(rect.left + insetX, rect.top + rect.height - insetY);
  context.stroke();
};

const fillDraft = (
  context: CanvasRenderingContext2D,
  scene: Scene,
  cellRect: CellRect,
  lineWidth: number,
) => {
  context.lineWidth = lineWidth;
  context.strokeStyle = "#ffffff";
  for (const { x, y, colorIndex } of scene.draft) {
    const rect = cellRect(x, y);
    if (colorIndex === TRANSPARENT_COLOR_INDEX) {
      fillErased(context, rect, scene.palette[scene.colorIndexAt(x, y)]);
      continue;
    }
    context.globalAlpha = DRAFT_ALPHA;
    context.fillStyle = scene.palette[colorIndex] ?? VOID_COLOR;
    context.fillRect(rect.left, rect.top, rect.width, rect.height);
  }
  context.globalAlpha = 1;
};

type Side = "top" | "bottom" | "left" | "right";
const NEIGHBORS: readonly [Side, number, number][] = [
  ["top", 0, -1],
  ["bottom", 0, 1],
  ["left", -1, 0],
  ["right", 1, 0],
];

// Une arête, décalée de `offset` vers l'intérieur de la case, et prolongée de `reach` à chaque bout.
const edgeLine = (
  rect: Rect,
  side: Side,
  offset: number,
  reach: number,
): [number, number, number, number] => {
  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;
  switch (side) {
    case "top":
      return [rect.left - reach, rect.top + offset, right + reach, rect.top + offset];
    case "bottom":
      return [rect.left - reach, bottom - offset, right + reach, bottom - offset];
    case "left":
      return [rect.left + offset, rect.top - reach, rect.left + offset, bottom + reach];
    default:
      return [right - offset, rect.top - reach, right - offset, bottom + reach];
  }
};

// Un trait sur chaque arête qui borde une case hors du brouillon : noir dehors, puis blanc dedans (CDC 2026).
const strokeDraftOutline = (
  context: CanvasRenderingContext2D,
  draft: readonly Pixel[],
  cellRect: CellRect,
  lineWidth: number,
) => {
  const keys = new Set(draft.map(({ x, y }) => `${x}:${y}`));
  const edges = draft.flatMap(({ x, y }) =>
    NEIGHBORS.filter(([, dx, dy]) => !keys.has(`${x + dx}:${y + dy}`)).map(([side]) => ({
      rect: cellRect(x, y),
      side,
    })),
  );
  for (const [color, direction] of [
    ["#000000", -1],
    ["#ffffff", 1],
  ] as const) {
    const offset = (direction * lineWidth) / 2;
    const reach = direction < 0 ? lineWidth : 0; // le trait du dehors déborde pour fermer les coins
    context.beginPath();
    for (const { rect, side } of edges) {
      const [fromX, fromY, toX, toY] = edgeLine(rect, side, offset, reach);
      context.moveTo(fromX, fromY);
      context.lineTo(toX, toY);
    }
    context.lineWidth = lineWidth;
    context.strokeStyle = color;
    context.stroke();
  }
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
  const draftRect: CellRect = (x, y) => cellRect(x, y, 1, 1);
  fillDraft(context, scene, draftRect, lineWidth);

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
  strokeDraftOutline(context, scene.draft, draftRect, lineWidth);

  if (scene.targetCell) {
    // Blanc contre la case, noir autour : visible sur toutes les couleurs, à tous les zooms.
    const target = cellRect(scene.targetCell.x, scene.targetCell.y, 1, 1);
    context.strokeStyle = "#ffffff";
    strokeOutside(context, target, lineWidth, 0);
    context.strokeStyle = "#000000";
    strokeOutside(context, target, lineWidth, 1);
  }
}
