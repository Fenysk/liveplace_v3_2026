import { PALETTE, TRANSPARENT_COLOR_INDEX } from "@liveplace/domain";
import { describe, expect, it } from "vitest";
import {
  ARCHIVE_COMPOSITIONS,
  ARCHIVE_HEIGHT,
  ARCHIVE_WIDTH,
  GROWTH_HEIGHT,
  GROWTH_PLACEMENTS,
  GROWTH_WIDTH,
  MOTIF_NAMES,
  type MotifName,
  motifCells,
  motifSize,
  type Placement,
  placementsCells,
  unknownLetters,
} from "./pixel-motifs";

type Box = { left: number; top: number; right: number; bottom: number };

const boxOf = ({ motif, x, y }: Placement): Box => {
  const { width, height } = motifSize(motif);
  return { left: x, top: y, right: x + width - 1, bottom: y + height - 1 };
};

// Deux motifs se touchent ou se frôlent : leurs boîtes, élargies d'une case, se recouvrent
const crowd = (first: Box, second: Box): boolean =>
  first.left - 1 <= second.right &&
  second.left - 1 <= first.right &&
  first.top - 1 <= second.bottom &&
  second.top - 1 <= first.bottom;

const pairs = <Item>(items: readonly Item[]): [Item, Item][] =>
  items.flatMap((first, index) => items.slice(index + 1).map((second): [Item, Item] => [first, second]));

describe("les pixel arts des vignettes", () => {
  // Les motifs de la culture du jeu et d'Internet que l'on doit reconnaître : un champignon, une épée, un fantôme, un extraterrestre, une étoile…
  it("has the recognizable motifs of the brief: mushroom, sword, ghost, alien, star, crown, cat, potion, heart, smiley", () => {
    for (const name of [
      "mushroom",
      "sword",
      "ghost",
      "alien",
      "star",
      "crown",
      "cat",
      "potion",
      "heart",
      "smiley",
    ])
      expect(MOTIF_NAMES).toContain(name);
    expect(MOTIF_NAMES.length).toBeGreaterThanOrEqual(12);
  });

  // Chaque motif est un petit dessin, 5 à 9 cases de côté, rectangulaire (toutes ses rangées ont la même largeur)
  it("keeps every motif small, 5 to 9 cells a side", () => {
    for (const name of MOTIF_NAMES) {
      const { width, height } = motifSize(name);
      const widths = new Set(motifCells(name, 0, 0).map(({ x }) => x));

      expect(width, name).toBeGreaterThanOrEqual(5);
      expect(width, name).toBeLessThanOrEqual(9);
      expect(height, name).toBeGreaterThanOrEqual(5);
      expect(height, name).toBeLessThanOrEqual(9);
      expect(Math.max(...widths) + 1, name).toBeLessThanOrEqual(width);
    }
  });

  // Chaque lettre dessine une couleur de la palette du jeu, jamais le transparent, et chaque motif a de quoi se reconnaître (plusieurs couleurs, plusieurs cases)
  it("draws only with colors of the game palette, several of them, on enough cells to be told apart", () => {
    for (const name of MOTIF_NAMES) {
      const cells = motifCells(name, 0, 0);
      const tones = new Set(cells.map(({ colorIndex }) => colorIndex));

      expect(unknownLetters(name), name).toEqual([]);
      expect(cells.length, name).toBeGreaterThanOrEqual(12);
      expect(tones.size, name).toBeGreaterThanOrEqual(2);
      for (const colorIndex of tones) {
        expect(PALETTE[colorIndex], name).toBeDefined();
        expect(colorIndex, name).not.toBe(TRANSPARENT_COLOR_INDEX);
      }
    }
  });

  // Un motif se pose à l'endroit voulu, rangée après rangée, de haut en bas
  it("places a motif where asked, row after row from the top", () => {
    const cells = motifCells("sword", 10, 20);
    const rows = cells.map(({ y }) => y);

    expect(cells[0]).toMatchObject({ x: 12, y: 20 }); // la pointe, au milieu de la première rangée
    expect(rows).toEqual([...rows].sort((first, second) => first - second));
    expect(Math.min(...cells.map(({ x }) => x))).toBe(10);
    expect(Math.max(...cells.map(({ y }) => y))).toBe(28);
  });
});

describe("les mini-fresques de l'archivage", () => {
  const boxes = (placements: readonly Placement[]) => placements.map(boxOf);

  // Six fresques, au moins cinq, de trois motifs chacune
  it("has six canvases of three motifs each", () => {
    expect(ARCHIVE_COMPOSITIONS).toHaveLength(6);
    for (const placements of ARCHIVE_COMPOSITIONS) expect(placements).toHaveLength(3);
  });

  // Du blanc autour : chaque motif est à une case au moins du bord de la fresque, et à une case au moins des autres motifs
  it("leaves white around every motif: one cell from the edge and from the other motifs", () => {
    for (const placements of ARCHIVE_COMPOSITIONS) {
      for (const box of boxes(placements)) {
        expect(box.left).toBeGreaterThanOrEqual(1);
        expect(box.top).toBeGreaterThanOrEqual(1);
        expect(box.right).toBeLessThanOrEqual(ARCHIVE_WIDTH - 2);
        expect(box.bottom).toBeLessThanOrEqual(ARCHIVE_HEIGHT - 2);
      }
      for (const [first, second] of pairs(boxes(placements))) expect(crowd(first, second)).toBe(false);
    }
  });

  // Chaque fresque a ses propres motifs : deux fresques n'ont jamais les mêmes, et un motif n'est jamais répété dans la même
  it("gives every canvas its own motifs, none repeated inside a canvas", () => {
    const sets = ARCHIVE_COMPOSITIONS.map((placements) => placements.map(({ motif }) => motif).sort());

    for (const names of sets) expect(new Set(names).size).toBe(names.length);
    expect(new Set(sets.map((names) => names.join(","))).size).toBe(ARCHIVE_COMPOSITIONS.length);
    expect(new Set(sets.flat()).size).toBeGreaterThanOrEqual(12);
  });

  // De l'escalier, la bande de gauche des fresques de derrière montre un motif en entier : un motif étroit, de 5 cases, tout à gauche
  it("shows a whole narrow motif in the strip on the left, the one the stair leaves visible", () => {
    const strip = 6;
    for (const [left] of ARCHIVE_COMPOSITIONS) {
      const box = left ? boxOf(left) : { left: 99, top: 0, right: 99, bottom: 0 };

      expect(box.left).toBeGreaterThanOrEqual(1);
      expect(box.right).toBeLessThan(strip);
    }
  });

  // Les cases d'une fresque ne se recouvrent pas : chaque case porte une seule couleur
  it("never puts two colors on one cell", () => {
    for (const placements of ARCHIVE_COMPOSITIONS) {
      const keys = placementsCells(placements).map(({ x, y }) => `${x},${y}`);

      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe("les motifs de la fresque qui grandit", () => {
  // Chaque étape pose un motif reconnaissable entier : cinq étapes, des motifs tous différents
  it("lays five different whole motifs, one per step", () => {
    const names: MotifName[] = GROWTH_PLACEMENTS.map(({ motif }) => motif);

    expect(names).toHaveLength(5);
    expect(new Set(names).size).toBe(names.length);
  });

  // Chaque motif est à trois cases au moins du bord de la fresque (la marge), et ils ne se frôlent pas
  it("keeps every motif three cells from the edge of the canvas, and apart from the others", () => {
    for (const placement of GROWTH_PLACEMENTS) {
      const box = boxOf(placement);

      expect(box.left).toBeGreaterThanOrEqual(3);
      expect(box.top).toBeGreaterThanOrEqual(3);
      expect(box.right).toBeLessThanOrEqual(GROWTH_WIDTH - 4);
      expect(box.bottom).toBeLessThanOrEqual(GROWTH_HEIGHT - 4);
    }
    for (const [first, second] of pairs(GROWTH_PLACEMENTS.map(boxOf)))
      expect(crowd(first, second)).toBe(false);
  });

  // Le premier motif est au centre de la fresque, et les suivants de plus en plus loin
  it("starts at the center of the canvas and moves outward", () => {
    const distance = (placement: Placement): number => {
      const { left, top, right, bottom } = boxOf(placement);
      return Math.hypot((left + right) / 2 - GROWTH_WIDTH / 2, (top + bottom) / 2 - GROWTH_HEIGHT / 2);
    };
    const [first, ...others] = GROWTH_PLACEMENTS;

    expect(first && distance(first)).toBeLessThan(2);
    for (const other of others) expect(distance(other)).toBeGreaterThan(8);
  });
});
