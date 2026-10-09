import { describe, expect, it } from "vitest";
import { toCellKey } from "./index";
import {
  type CanvasSnapshot,
  isCovered,
  type PileEntry,
  restoreState,
  type SnapshotCell,
  type Tombstones,
  toSnapshotImage,
} from "./snapshot";

const entry: PileEntry = {
  authorId: "troll",
  colorIndex: 5,
  placedAt: 1_000,
  version: 40,
  placementId: "pose1abc",
};
const key = "troll:pose1abc";

const none: Tombstones = {
  clearedVersions: new Map(),
  clearedPlacements: new Set(),
  clearedRanges: new Map(),
};

describe("isCovered, the rule of pile.lua", () => {
  // Tant qu'aucune pierre tombale ne le couvre, un pixel reste visible
  it("keeps an entry no tombstone covers", () => {
    expect(isCovered(entry, key, none)).toBe(false);
  });

  // Un auteur retiré jusqu'à une version couvre ses entrées jusqu'à elle, pas celles d'après
  it("covers an author's entries up to the cleared version, not the ones after", () => {
    const cleared = { ...none, clearedVersions: new Map([["troll", 40]]) };

    expect(isCovered(entry, key, cleared)).toBe(true);
    expect(isCovered({ ...entry, version: 41 }, key, cleared)).toBe(false);
    expect(isCovered({ ...entry, authorId: "other" }, "other:pose1abc", cleared)).toBe(false);
  });

  // Une pose retirée couvre ses lots, pas les autres poses du même auteur
  it("covers a cleared placement and only that one", () => {
    const cleared = { ...none, clearedPlacements: new Set([key]) };

    expect(isCovered(entry, key, cleared)).toBe(true);
    expect(isCovered({ ...entry, placementId: "pose2abc" }, "troll:pose2abc", cleared)).toBe(false);
  });

  // Une plage d'heures couvre ses bornes comprises, et seulement l'auteur visé
  it("covers a cleared time range, bounds included, for its author only", () => {
    const cleared = { ...none, clearedRanges: new Map([["troll", [[900, 1_000] as const]]]) };

    expect(isCovered(entry, key, cleared)).toBe(true);
    expect(isCovered({ ...entry, placedAt: 900 }, key, cleared)).toBe(true);
    expect(isCovered({ ...entry, placedAt: 1_001 }, key, cleared)).toBe(false);
    expect(isCovered({ ...entry, authorId: "other" }, "other:pose1abc", cleared)).toBe(false);
  });
});

describe("restoreState", () => {
  const cell = (x: number, y: number, colorIndex: number): SnapshotCell => [
    toCellKey(x, y),
    0,
    -1,
    colorIndex,
    1_000,
    1,
  ];

  // Le state d'un canvas se refait des seules cases visibles, adressées par `stateOffset`
  it("rebuilds the state from the visible cells, addressed by stateOffset", () => {
    const state = restoreState({ width: 4, height: 3 }, [cell(0, 0, 7), cell(3, 2, 9), cell(1, 1, 2)]);

    expect(Array.from(state)).toEqual([7, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 9]);
  });

  // Une case hors du cadre garde sa pile mais n'entre pas dans le state
  it("leaves out a cell outside the frame", () => {
    const state = restoreState({ width: 2, height: 2 }, [cell(1, 1, 3), cell(2, 0, 4), cell(0, 2, 5)]);

    expect(Array.from(state)).toEqual([0, 0, 0, 3]);
  });
});

describe("toSnapshotImage (JOURNAL 2026-10-08)", () => {
  const snapshot: CanvasSnapshot = {
    schemaVersion: 1,
    canvasId: "canvas-1",
    version: 42,
    takenAt: 1_700_000_000_000,
    meta: { width: "4", height: "3", ownerId: "owner-1", theme: "Ocean" },
    authors: ["author-a", "author-b"],
    placements: ["pfirst0001"],
    cells: [
      [toCellKey(1, 0), 0, 0, 5, 1, 40],
      [toCellKey(3, 2), 1, -1, 7, 2, 41],
      [toCellKey(9, 9), 0, 0, 3, 3, 42], // hors du cadre : sa pile reste, le dessin ne la montre pas
    ],
    progress: {},
    bans: ["troll"],
    bansTwitch: [],
    banProofs: {},
    cleared: {},
    clearedPlacements: [],
    clearedRanges: {},
    mods: [],
    modsTwitch: [],
    modsLiveplace: [],
    twitchUsers: {},
    reported: [],
    reports: {},
    offStream: [],
    approved: [],
  };

  // Le dessin seul : la taille, la version, la date, la couleur de chaque case dans le cadre, et rien des auteurs
  it("keeps the drawing, the size, the version and the date, and nothing of the authors or the moderation", () => {
    const image = toSnapshotImage(snapshot);

    expect(image).toEqual({
      schemaVersion: 1,
      canvasId: "canvas-1",
      version: 42,
      takenAt: 1_700_000_000_000,
      width: 4,
      height: 3,
      state: restoreState({ width: 4, height: 3 }, snapshot.cells),
    });
    expect(Array.from(image.state)).toEqual([0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 7]);
    expect(JSON.stringify(image)).not.toContain("author");
  });
});
