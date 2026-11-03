import { describe, expect, it } from "vitest";
import {
  cellsPath,
  checkerCells,
  HEART_CELLS,
  HEART_SIDE,
  LANDSCAPE_HEIGHT,
  LANDSCAPE_ROWS,
  LANDSCAPE_WIDTH,
  landscapeLayers,
  layersOfCells,
} from "./thumbnail-art";

describe("les pixels des vignettes fixes", () => {
  // Les cases d'un dessin se rangent par couleur : une couche par couleur, dans l'ordre où elles paraissent, sans perdre une case
  it("sorts the cells by color, one layer per color in the order they appear, without losing a cell", () => {
    const layers = layersOfCells([
      { x: 0, y: 0, colorIndex: 5 },
      { x: 1, y: 0, colorIndex: 9 },
      { x: 2, y: 0, colorIndex: 5 },
    ]);

    expect(layers.map(({ colorIndex }) => colorIndex)).toEqual([5, 9]);
    expect(layers[0]?.cells).toEqual([
      [0, 0],
      [2, 0],
    ]);
    expect(layers[1]?.cells).toEqual([[1, 0]]);
    expect(layersOfCells([])).toEqual([]);
  });

  // Une case est un carré d'une unité dans le tracé
  it("writes a cell as a one-unit square in the path", () => {
    expect(cellsPath([[2, 3]])).toBe("M2 3h1v1h-1z");
    expect(cellsPath([])).toBe("");
  });

  // Le cœur tient dans sa grille, sa pointe est en bas au milieu, et il est symétrique
  it("fits its grid, points down in the middle and is symmetrical", () => {
    const keys = new Set(HEART_CELLS.map(([x, y]) => `${x},${y}`));

    for (const [x, y] of HEART_CELLS) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(HEART_SIDE);
      expect(y).toBeLessThan(HEART_SIDE);
      expect(keys.has(`${HEART_SIDE - 1 - x},${y}`)).toBe(true);
    }
    expect(keys.has("4,7")).toBe(true);
  });

  // Le paysage de « ton image » a ses rangées de la bonne largeur, sans une lettre inconnue : il couvre toute la fresque
  it("draws the landscape on 22 × 10 cells, every row of the right width", () => {
    expect(LANDSCAPE_ROWS).toHaveLength(LANDSCAPE_HEIGHT);
    for (const row of LANDSCAPE_ROWS) expect(row).toHaveLength(LANDSCAPE_WIDTH);
    const layers = landscapeLayers();
    const cells = layers.flatMap(({ cells: layerCells }) => layerCells.map(([x, y]) => `${x},${y}`));

    expect(cells).toHaveLength(LANDSCAPE_WIDTH * LANDSCAPE_HEIGHT);
    expect(new Set(cells).size).toBe(LANDSCAPE_WIDTH * LANDSCAPE_HEIGHT);
  });

  // Le paysage se reconnaît : un ciel en haut, un soleil, un nuage, une montagne enneigée, des sapins, de l'herbe en bas ; des couleurs de la palette
  it("shows a sky, a sun, a cloud, a snowy mountain, fir trees and grass, in palette colors", () => {
    const layers = landscapeLayers();
    const cellsOf = (colorIndex: number) =>
      layers.find((layer) => layer.colorIndex === colorIndex)?.cells ?? [];

    expect(layers.map(({ colorIndex }) => colorIndex).sort((a, b) => a - b)).toEqual([
      9, 11, 18, 19, 20, 29, 31, 42,
    ]);
    expect(Math.min(...cellsOf(29).map(([, y]) => y))).toBe(0); // le ciel commence en haut
    expect(Math.min(...cellsOf(19).map(([, y]) => y))).toBe(LANDSCAPE_HEIGHT - 1); // l'herbe de devant est la dernière rangée
    expect(cellsOf(9)).toHaveLength(9); // un soleil de 3 × 3
    expect(landscapeLayers()).toEqual(layers); // toujours le même dessin
  });

  // Le soleil est à gauche, la montagne à droite avec sa neige au sommet, un sapin à gauche : le cœur du centre ne les cache pas
  it("puts the sun and a fir tree on the left, the mountain with its snow on the right", () => {
    const layers = landscapeLayers();
    const cellsOf = (colorIndex: number) =>
      layers.find((layer) => layer.colorIndex === colorIndex)?.cells ?? [];
    const average = (values: readonly number[]) =>
      values.reduce((sum, value) => sum + value, 0) / values.length;

    expect(average(cellsOf(9).map(([x]) => x))).toBeLessThan(LANDSCAPE_WIDTH / 2); // le soleil
    expect(average(cellsOf(18).map(([x]) => x))).toBeLessThan(LANDSCAPE_WIDTH / 2); // le sapin
    expect(average(cellsOf(31).map(([x]) => x))).toBeGreaterThan(LANDSCAPE_WIDTH / 2); // la montagne
    const peak = Math.min(...cellsOf(31).map(([, y]) => y));
    const snow = cellsOf(42).filter(([, y]) => y >= 3 && y <= peak);
    expect(snow.length).toBeGreaterThanOrEqual(2); // la neige couvre le sommet
    expect(Math.max(...cellsOf(11).map(([, y]) => y))).toBe(LANDSCAPE_HEIGHT - 2); // le tronc touche l'herbe
  });

  // Une couche s'écrit en un seul tracé : un carré d'une unité par case, jamais deux cases dans le même carré
  it("writes a layer as a single path, one unit square per cell", () => {
    for (const { cells } of landscapeLayers()) {
      const path = cellsPath(cells);

      expect(path.split("z").length - 1).toBe(cells.length);
      expect(path.startsWith("M")).toBe(true);
    }
    expect(layersOfCells([{ x: 4, y: 1, colorIndex: 9 }])[0]?.cells).toEqual([[4, 1]]);
  });

  // Le damier d'un rectangle alterne aussi : 22 × 10 cases, la moitié impaires
  it("alternates the checker of a rectangle too", () => {
    expect(checkerCells(22, 10)).toHaveLength(110);
    expect(checkerCells(22, 10).every(([x, y]) => x < 22 && y < 10 && (x + y) % 2 === 1)).toBe(true);
  });

  // Le damier alterne : jamais deux cases voisines de la même teinte, et les quatre coins sont de l'autre teinte
  it("alternates the checker, and keeps the four corners on the base tone", () => {
    const keys = new Set(checkerCells(9).map(([x, y]) => `${x},${y}`));

    expect(keys.has("1,0")).toBe(true);
    expect(keys.has("0,0")).toBe(false);
    for (const corner of ["0,0", "8,0", "0,8", "8,8"]) expect(keys.has(corner)).toBe(false);
    expect(keys.size).toBe(40);
  });
});
