// Les pixels des vignettes fixes : les pixel arts posés sur une fresque (pixel-motifs.ts), le paysage de « ton image » et un cœur. Chaque
// couleur devient un seul tracé SVG, une case = un carré d'une unité : le dessin reste net à n'importe quelle taille.

import type { Cell, PixelCell } from "./pixel-motifs";

export type ArtLayer = { colorIndex: number; cells: readonly Cell[] };

// Une couche par couleur, dans l'ordre où les couleurs paraissent.
export const layersOfCells = (cells: readonly PixelCell[]): ArtLayer[] => {
  const layers = new Map<number, Cell[]>();
  for (const { x, y, colorIndex } of cells)
    layers.set(colorIndex, [...(layers.get(colorIndex) ?? []), [x, y]]);
  return [...layers].map(([colorIndex, layerCells]) => ({ colorIndex, cells: layerCells }));
};

// Un paysage en pixels, pour « ton image » : un ciel, un soleil, un nuage, une montagne enneigée, deux sapins sur l'herbe. Une image de
// plus petite taille qu'une photo, dans les couleurs de la palette : elle couvre la fresque comme le fait l'image du streamer.
export const LANDSCAPE_WIDTH = 22;
export const LANDSCAPE_HEIGHT = 10;

const SCENE_LEGEND: ReadonlyMap<string, number> = new Map([
  ["c", 29], // le ciel
  ["Y", 9], // le soleil
  ["W", 42], // le nuage et la neige
  ["s", 31], // la montagne
  ["T", 18], // les sapins
  ["N", 11], // leurs troncs
  ["G", 20], // l'herbe
  ["g", 19], // l'herbe de devant
]);

// Une rangée en tronçons : `[lettre, nombre de cases]`, pour ne pas compter les lettres à la main.
const sceneRow = (...parts: readonly (readonly [string, number])[]): string =>
  parts.map(([letter, count]) => letter.repeat(count)).join("");

export const LANDSCAPE_ROWS: readonly string[] = [
  sceneRow(["c", 8], ["W", 4], ["c", 10]),
  sceneRow(["c", 2], ["Y", 3], ["c", 3], ["W", 6], ["c", 8]),
  sceneRow(["c", 2], ["Y", 3], ["c", 17]),
  sceneRow(["c", 2], ["Y", 3], ["c", 12], ["W", 1], ["c", 4]),
  sceneRow(["c", 16], ["W", 1], ["s", 1], ["W", 1], ["c", 3]),
  sceneRow(["c", 3], ["T", 1], ["c", 11], ["s", 5], ["c", 2]),
  sceneRow(["c", 2], ["T", 3], ["c", 9], ["s", 7], ["c", 1]),
  sceneRow(["c", 1], ["T", 5], ["c", 6], ["s", 9], ["c", 1]),
  sceneRow(["G", 3], ["N", 1], ["G", 18]),
  sceneRow(["g", 22]),
];

export const landscapeLayers = (): ArtLayer[] =>
  layersOfCells(
    LANDSCAPE_ROWS.flatMap((row, y) =>
      [...row].flatMap((letter, x): PixelCell[] => {
        const colorIndex = SCENE_LEGEND.get(letter);
        return colorIndex === undefined ? [] : [{ x, y, colorIndex }];
      }),
    ),
  );

// Le tracé d'un ensemble de cases : un carré d'une unité par case.
export const cellsPath = (cells: readonly Cell[]): string =>
  cells.map(([x, y]) => `M${x} ${y}h1v1h-1z`).join("");

// Un cœur de 7 cases de haut dans une grille de 9, comme celui de l'accueil, rose (la couleur de la palette du jeu qui suit).
export const HEART_COLOR_INDEX = 36;
export const HEART_SIDE = 9;
const HEART_ROWS = ["", " ## ##", "#######", "#######", " #####", "  ###", "   #"];

export const HEART_CELLS: readonly Cell[] = HEART_ROWS.flatMap((row, y) =>
  [...row].flatMap((mark, x): Cell[] => (mark === "#" ? [[x + 1, y + 1]] : [])),
);

// Le damier du pixel transparent : les cases impaires, sur le fond de l'autre teinte.
export const checkerCells = (width: number, height = width): readonly Cell[] =>
  Array.from(
    { length: width * height },
    (_, index): Cell => [index % width, Math.floor(index / width)],
  ).filter(([x, y]) => (x + y) % 2 === 1);
