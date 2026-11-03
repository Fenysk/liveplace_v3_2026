// Le brouillon de la vignette « Annuler, refaire » : un champignon de pixel-motifs.ts, celui des autres vignettes, tracé en trois traits
// (le chapeau rouge, ses points blancs, le pied). Un trait est une suite de cases que la souris suit l'une après l'autre, colonne après
// colonne, de gauche à droite. Une fois les trois traits posés, on retrouve exactement le motif : les points blancs recouvrent le rouge.

import { motifCells, type PixelCell } from "./pixel-motifs";

// Une case du motif = 3 unités de la vignette, comme dans l'archivage et la fresque qui grandit ; le champignon se pose au centre,
// au-dessus de la pill Dessin.
export const DRAFT_CELL = 3;
export const DRAFT_ORIGIN = { x: 45, y: 11 } as const;

export type DraftStroke = {
  name: "cap" | "spots" | "stem";
  colorIndex: number; // la couleur du trait, celle de sa pastille dans la pill
  cells: readonly PixelCell[]; // dans l'ordre où la souris les trace
};

const MUSHROOM = motifCells("mushroom", 0, 0);
const STEM_TOP = 4; // les rangées 0 à 3 sont le chapeau, les suivantes le pied

// Les cases d'un trait dans l'ordre de la souris : colonne après colonne, vers le bas puis vers le haut, selon l'extrémité la plus proche
// de la case où l'on vient d'arriver. Le trait ne saute que là où le motif lui-même est coupé.
const inDrawingOrder = (cells: readonly PixelCell[]): PixelCell[] => {
  const columns = [...new Set(cells.map(({ x }) => x))].sort((first, second) => first - second);
  const top = Math.min(...cells.map(({ y }) => y));
  return columns.reduce<{ ordered: PixelCell[]; lastY: number }>(
    ({ ordered, lastY }, x) => {
      const column = cells.filter((cell) => cell.x === x).sort((first, second) => first.y - second.y);
      const topY = column[0]?.y ?? lastY;
      const bottomY = column.at(-1)?.y ?? lastY;
      const goesDown = Math.abs(topY - lastY) <= Math.abs(bottomY - lastY);
      const next = goesDown ? column : column.reverse();
      return { ordered: [...ordered, ...next], lastY: goesDown ? bottomY : topY };
    },
    { ordered: [], lastY: top },
  ).ordered;
};

const cap = MUSHROOM.filter(({ y }) => y < STEM_TOP);
const stem = MUSHROOM.filter(({ y }) => y >= STEM_TOP);
const CAP_COLOR = cap[0]?.colorIndex ?? 0; // la première rangée est toute en couleur de chapeau
const spots = cap.filter(({ colorIndex }) => colorIndex !== CAP_COLOR);
const STEM_COLOR = stem[0]?.colorIndex ?? 0;

export const DRAFT_STROKES: readonly DraftStroke[] = [
  // Le chapeau entier est tracé en rouge, y compris sous les points : le deuxième trait les repose par-dessus.
  {
    name: "cap",
    colorIndex: CAP_COLOR,
    cells: inDrawingOrder(cap.map((cell) => ({ ...cell, colorIndex: CAP_COLOR }))),
  },
  { name: "spots", colorIndex: spots[0]?.colorIndex ?? CAP_COLOR, cells: inDrawingOrder(spots) },
  // Le pied garde les deux teintes du motif (le sable et son reflet) ; sa pastille est la teinte du sable.
  { name: "stem", colorIndex: STEM_COLOR, cells: inDrawingOrder(stem) },
];

// Combien de cases du trait sont posées quand la souris en a fait la part `progress` (de 0 à 1) : une case se pose quand la souris
// arrive sur elle.
export const strokeShown = (stroke: DraftStroke, progress: number): number =>
  progress <= 0 ? 0 : Math.min(stroke.cells.length, Math.floor(progress * (stroke.cells.length - 1)) + 1);

// Où est la pointe de la souris, en unités de la vignette, quand elle a fait la part `progress` du trait : elle glisse d'une case
// à la suivante en ligne droite, d'un centre à l'autre.
export const strokePoint = (stroke: DraftStroke, progress: number): { x: number; y: number } => {
  const position = Math.min(1, Math.max(0, progress)) * Math.max(0, stroke.cells.length - 1);
  const index = Math.min(Math.floor(position), Math.max(0, stroke.cells.length - 2));
  const from = stroke.cells[index];
  const to = stroke.cells[index + 1] ?? from;
  const share = position - index;
  const centerX = (cell: PixelCell | undefined): number =>
    DRAFT_ORIGIN.x + DRAFT_CELL * ((cell?.x ?? 0) + 0.5);
  const centerY = (cell: PixelCell | undefined): number =>
    DRAFT_ORIGIN.y + DRAFT_CELL * ((cell?.y ?? 0) + 0.5);
  return {
    x: centerX(from) + (centerX(to) - centerX(from)) * share,
    y: centerY(from) + (centerY(to) - centerY(from)) * share,
  };
};
