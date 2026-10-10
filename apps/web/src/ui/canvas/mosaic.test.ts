import { describe, expect, it } from "vitest";
import type { MosaicLevel } from "./canvas-image";
import { mosaicLevels, REVEAL_BLOCKS, REVEAL_STEPS } from "./mosaic";

// 0 transparent, 1 rouge, 2 bleu, 3 rouge à moitié transparent.
const PALETTE = ["#00000000", "#ff0000", "#0000ff", "#ff000080"];

const pixelsOf = (width: number, height: number, fill: (x: number, y: number) => number) =>
  Uint8Array.from({ length: width * height }, (_, offset) =>
    fill(offset % width, Math.floor(offset / width)),
  );

// Le pixel (x, y) du niveau `index`, en RGBA.
const rgbaAt = (levels: readonly MosaicLevel[], index: number, x: number, y: number) => {
  const level = levels[index];
  if (!level) throw new Error(`pas de niveau ${index}`);
  return [...level.rgba.slice((y * level.width + x) * 4, (y * level.width + x) * 4 + 4)];
};

describe("mosaicLevels (la fresque qui paraît en blocs)", () => {
  // Trois niveaux, de 8, 4 puis 2 cases, et une étape de plus pour l'image nette
  it("makes a level for the blocks of 8, 4 and 2 cells, and one more step for the sharp image", () => {
    expect(REVEAL_BLOCKS).toEqual([8, 4, 2]);
    expect(REVEAL_STEPS).toBe(4);
    const levels = mosaicLevels(
      pixelsOf(64, 64, () => 1),
      PALETTE,
      { width: 64, height: 64 },
    );

    expect(levels.map(({ width, height }) => [width, height])).toEqual([
      [8, 8],
      [16, 16],
      [32, 32],
    ]);
  });

  // Une taille qui n'est pas multiple du bloc garde un dernier bloc, plus petit : 50 cases font 7 blocs de 8
  it("keeps a smaller last block when the size is not a multiple of the block", () => {
    const levels = mosaicLevels(
      pixelsOf(50, 36, () => 1),
      PALETTE,
      { width: 50, height: 36 },
    );

    expect(levels.map(({ width, height }) => [width, height])).toEqual([
      [7, 5],
      [13, 9],
      [25, 18],
    ]);
  });

  // La couleur d'un bloc est la moyenne de ses cases : deux couleurs sans transparence se mêlent à parts égales
  it("averages the colors of a block: two opaque colors mix in equal parts", () => {
    const levels = mosaicLevels(
      pixelsOf(8, 8, (x) => (x < 4 ? 1 : 2)),
      PALETTE,
      { width: 8, height: 8 },
    );

    expect(rgbaAt(levels, 0, 0, 0)).toEqual([128, 0, 128, 255]);
  });

  // Les cases transparentes comptent pour transparentes : un bloc à moitié vide est à moitié opaque, de la couleur des cases pleines
  it("counts a transparent cell as transparent: a half empty block is half opaque, in the color of its full cells", () => {
    const levels = mosaicLevels(
      pixelsOf(8, 8, (x) => (x < 4 ? 1 : 0)),
      PALETTE,
      { width: 8, height: 8 },
    );

    expect(rgbaAt(levels, 0, 0, 0)).toEqual([255, 0, 0, 128]);
  });

  // Un bloc vide reste transparent, sans couleur parasite
  it("keeps an empty block transparent", () => {
    const levels = mosaicLevels(
      pixelsOf(8, 8, () => 0),
      PALETTE,
      { width: 8, height: 8 },
    );

    expect(rgbaAt(levels, 0, 0, 0)).toEqual([0, 0, 0, 0]);
  });

  // Le bloc du bord se moyenne sur ses seules cases : il n'est pas pâli par ce qui dépasse
  it("averages an edge block over its own cells only, so it is not faded by what lies beyond", () => {
    const levels = mosaicLevels(
      pixelsOf(10, 10, () => 1),
      PALETTE,
      { width: 10, height: 10 },
    );

    expect(rgbaAt(levels, 0, 1, 1)).toEqual([255, 0, 0, 255]);
  });

  // Une couleur déjà à moitié transparente pèse selon son opacité, comme sur le canvas
  it("weighs a half transparent color by its opacity", () => {
    const levels = mosaicLevels(
      pixelsOf(8, 8, (x) => (x < 4 ? 3 : 2)),
      PALETTE,
      { width: 8, height: 8 },
    );

    const [red = 0, , blue = 0, alpha = 0] = rgbaAt(levels, 0, 0, 0);
    expect(alpha).toBe(Math.round((128 + 255) / 2));
    expect(blue).toBeGreaterThan(red);
  });

  // Les niveaux plus fins gardent le détail : un bloc de 2 cases ne mêle que ses quatre cases
  it("keeps the detail in the finer levels: a block of 2 mixes only its own four cells", () => {
    const levels = mosaicLevels(
      pixelsOf(8, 8, (x, y) => (x < 4 && y < 4 ? 1 : 2)),
      PALETTE,
      { width: 8, height: 8 },
    );

    expect(rgbaAt(levels, 2, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(rgbaAt(levels, 2, 3, 3)).toEqual([0, 0, 255, 255]);
  });
});
