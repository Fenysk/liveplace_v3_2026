// Une image à l'écran (§9.3), dans l'ordre : les pixels, le brouillon, la grille, la bordure,
// le contour du brouillon, la case visée, le viseur de la case inspectée. Le vide et le damier ne sont pas ici : ce sont
// deux couches CSS sous le canvas (`.lp-void`, `.lp-checker`), qui ne suivent pas le viewport. Le canvas reste
// transparent autour de l'image, et sous ses pixels transparents.
// Tout ici est en pixels physiques : les pixels CSS du viewport sont multipliés par `pixelRatio`.

import { TRANSPARENT_COLOR_INDEX } from "@liveplace/domain";
import type { Pixel } from "../../state/canvas-store";
import type { Cell, Size, Viewport } from "./viewport";

// Les teintes du canvas, lues dans les tokens du thème (tokens.css) : aucune n'est écrite ici.
export type SceneShades = {
  void: string; // le fond sous une case gommée du brouillon : pas de damier (CDC 2026)
  border: string;
  grid: string;
  outlineIn: string; // contour du brouillon, case visée, viseur : dedans
  outlineOut: string; // … et dehors
};

export type Scene = {
  screen: Size; // pixels CSS
  pixelRatio: number;
  viewport: Viewport;
  canvas: Size;
  image: CanvasImageSource;
  shades: SceneShades;
  targetCell: Cell | null;
  inspectedCell: Cell | null;
  draft: readonly Pixel[];
  palette: readonly string[];
  colorIndexAt(x: number, y: number): number; // la couleur posée, sous le brouillon
};

type Rect = { left: number; top: number; width: number; height: number };
type CellRect = (x: number, y: number) => Rect;

const GRID_MIN_SCALE = 8;
const DRAFT_ALPHA = 0.6;
const ERASED_ALPHA = 0.35;
const ERASER_CROSS_INSET = 0.2; // la croix de la gomme laisse un peu de marge dans la case
const RETICLE_MIN_SIZE = 16; // pixels CSS : le viseur reste visible au plus petit zoom
const RETICLE_CORNERS = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
] as const;

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
const fillErased = (
  context: CanvasRenderingContext2D,
  rect: Rect,
  color: string | undefined,
  shades: SceneShades,
) => {
  context.globalAlpha = 1;
  context.fillStyle = shades.void;
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
  context.strokeStyle = scene.shades.outlineIn;
  for (const { x, y, colorIndex } of scene.draft) {
    const rect = cellRect(x, y);
    if (colorIndex === TRANSPARENT_COLOR_INDEX) {
      fillErased(context, rect, scene.palette[scene.colorIndexAt(x, y)], scene.shades);
      continue;
    }
    context.globalAlpha = DRAFT_ALPHA;
    context.fillStyle = scene.palette[colorIndex] ?? scene.shades.void;
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
  { draft, shades }: Pick<Scene, "draft" | "shades">,
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
    [shades.outlineOut, -1],
    [shades.outlineIn, 1],
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

// Le viseur (CDC 2026) : quatre coins en équerre autour de la case, noir sous blanc, d'une taille minimale fixe à l'écran.
const strokeReticle = (
  context: CanvasRenderingContext2D,
  rect: Rect,
  { pixelRatio, shades }: Pick<Scene, "pixelRatio" | "shades">,
  lineWidth: number,
) => {
  const half = Math.max(rect.width, RETICLE_MIN_SIZE * pixelRatio) / 2 + lineWidth * 2;
  const arm = half * 0.6;
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  context.beginPath();
  for (const [signX, signY] of RETICLE_CORNERS) {
    const cornerX = centerX + signX * half;
    const cornerY = centerY + signY * half;
    context.moveTo(cornerX - signX * arm, cornerY);
    context.lineTo(cornerX, cornerY);
    context.lineTo(cornerX, cornerY - signY * arm);
  }
  context.lineCap = "square";
  for (const [color, width] of [
    [shades.outlineOut, lineWidth * 3],
    [shades.outlineIn, lineWidth],
  ] as const) {
    context.lineWidth = width;
    context.strokeStyle = color;
    context.stroke();
  }
  context.lineCap = "butt";
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
  context.clearRect(0, 0, screenWidth, screenHeight);

  // Remis à chaque image : redimensionner un <canvas> remet son contexte à zéro.
  context.imageSmoothingEnabled = false;
  context.drawImage(scene.image, originX, originY, canvas.width * cellSize, canvas.height * cellSize);
  const oneCellRect: CellRect = (x, y) => cellRect(x, y, 1, 1);
  fillDraft(context, scene, oneCellRect, lineWidth);

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
    context.strokeStyle = scene.shades.grid;
    context.stroke();
  }

  context.strokeStyle = scene.shades.border;
  strokeOutside(context, canvasRect, lineWidth, 0);
  strokeDraftOutline(context, scene, oneCellRect, lineWidth);

  if (scene.targetCell) {
    // Blanc contre la case, noir autour : visible sur toutes les couleurs, à tous les zooms.
    const target = cellRect(scene.targetCell.x, scene.targetCell.y, 1, 1);
    context.strokeStyle = scene.shades.outlineIn;
    strokeOutside(context, target, lineWidth, 0);
    context.strokeStyle = scene.shades.outlineOut;
    strokeOutside(context, target, lineWidth, 1);
  }

  if (scene.inspectedCell)
    strokeReticle(context, oneCellRect(scene.inspectedCell.x, scene.inspectedCell.y), scene, lineWidth);
}
