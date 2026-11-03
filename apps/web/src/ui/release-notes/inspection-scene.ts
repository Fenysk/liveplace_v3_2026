// La mini-fresque des vignettes « Signaler un dessin » et « Efface les dessins gênants » : deux petits pixel arts génériques (le champignon
// et le chat, comme les autres vignettes) et un gribouillis gris, le dessin gênant. Une case = 3 unités de la vignette, comme l'archivage.

import { motifCells, type PixelCell } from "./pixel-motifs";
import { type ArtLayer, layersOfCells } from "./thumbnail-art";

export const SCENE_CELL = 3;

// Où chaque dessin se pose, en unités de la vignette (coin haut gauche).
export const MUSHROOM_AT = { x: 7, y: 8 } as const;
export const CAT_AT = { x: 31, y: 10 } as const;
export const SCRIBBLE_AT = { x: 16, y: 37 } as const;

// Le gribouillis : trois traits irréguliers (une ligne qui serpente, une autre dessous et un petit trait), en gris (la teinte « gris clair » de la palette du jeu).
const SCRIBBLE_ROWS = ["S......", "SS..SSS", ".SSSS..", "....S.S", ".SSSS.S"] as const;
const SCRIBBLE_COLOR_INDEX = 33;

export const SCRIBBLE_CELLS: readonly PixelCell[] = SCRIBBLE_ROWS.flatMap((row, y) =>
  [...row].flatMap((letter, x): PixelCell[] =>
    letter === "S" ? [{ x, y, colorIndex: SCRIBBLE_COLOR_INDEX }] : [],
  ),
);

// La case que la souris clique, et que l'Inspection entoure : sur un trait du gribouillis.
export const INSPECTED_CELL = { x: 3, y: 2 } as const;

// Le centre de cette case, en unités de la vignette : là où se pose la pointe de la souris.
export const INSPECTED_SPOT = {
  ax: SCRIBBLE_AT.x + (INSPECTED_CELL.x + 0.5) * SCENE_CELL,
  ay: SCRIBBLE_AT.y + (INSPECTED_CELL.y + 0.5) * SCENE_CELL,
} as const;

export const MUSHROOM_LAYERS: readonly ArtLayer[] = layersOfCells(motifCells("mushroom", 0, 0));
export const CAT_LAYERS: readonly ArtLayer[] = layersOfCells(motifCells("cat", 0, 0));
export const SCRIBBLE_LAYERS: readonly ArtLayer[] = layersOfCells(SCRIBBLE_CELLS);
