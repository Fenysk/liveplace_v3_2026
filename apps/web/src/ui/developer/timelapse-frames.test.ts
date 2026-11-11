import { describe, expect, it } from "vitest";
import type { TimelapseWire } from "../../usecase/export-timelapse";
import {
  changedRect,
  colorIndexOf,
  decodeTimelapse,
  GIF_TARGET_SIDE,
  gifScale,
  placeCell,
  stateOffsetOf,
} from "./timelapse-frames";

const pack = (stateOffset: number, colorIndex: number): number => stateOffset * 256 + colorIndex;

describe("le décodage de ce que le serveur envoie (JOURNAL 2026-11-11)", () => {
  // Quand le serveur envoie l'image de départ et les changements en base64, alors on retrouve les mêmes nombres, petit-boutistes.
  it("reads the starting image and the little-endian changes back", () => {
    const changes = [pack(0, 5), pack(300, 42), pack(65_535, 7)];
    const bytes = Buffer.alloc(changes.length * 4);
    for (const [at, packed] of changes.entries()) bytes.writeUInt32LE(packed, at * 4);
    const wire: TimelapseWire = {
      width: 3,
      height: 2,
      initial: Buffer.from([0, 1, 2, 3, 4, 5]).toString("base64"),
      changes: bytes.toString("base64"),
    };

    const decoded = decodeTimelapse(wire);

    expect([decoded.width, decoded.height]).toEqual([3, 2]);
    expect(Array.from(decoded.initial)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(Array.from(decoded.changes)).toEqual(changes);
    expect(changes.map(stateOffsetOf)).toEqual([0, 300, 65_535]);
    expect(changes.map(colorIndexOf)).toEqual([5, 42, 7]);
  });
});

describe("l'échelle d'un GIF (JOURNAL 2026-11-11)", () => {
  // Quand la fresque est petite, alors chaque case est un grand carré ; le plus grand côté reste dans la cible.
  it("makes each cell a square whose whole image fits in the target side", () => {
    expect(gifScale(50, 50)).toBe(12);
    expect(gifScale(126, 10)).toBe(5);
    expect(gifScale(256, 256)).toBe(2);
    for (const [width, height] of [
      [50, 50],
      [126, 84],
      [256, 33],
    ] as const)
      expect(Math.max(width, height) * gifScale(width, height)).toBeLessThanOrEqual(GIF_TARGET_SIDE);
  });

  // Quand la fresque dépasse la cible, alors une case reste un pixel au moins.
  it("never goes below one pixel per cell", () => {
    expect(gifScale(700, 20)).toBe(1);
  });
});

describe("le rectangle des cases changées (JOURNAL 2026-11-11)", () => {
  // Quand des changements touchent des cases éparses, alors le rectangle est le plus petit qui les contient.
  it("is the smallest rectangle around the cells of the changes", () => {
    const width = 10;
    const changes = Uint32Array.of(pack(2 * width + 3, 1), pack(5 * width + 7, 2), pack(4 * width + 4, 3));

    expect(changedRect(changes, 0, 3, width)).toEqual({ left: 3, top: 2, width: 5, height: 4 });
  });

  // Quand l'intervalle ne couvre qu'une partie des changements, alors seuls ceux-là comptent.
  it("only counts the changes between from and to", () => {
    const width = 10;
    const changes = Uint32Array.of(pack(0, 1), pack(2 * width + 3, 2), pack(9 * width + 9, 3));

    expect(changedRect(changes, 1, 2, width)).toEqual({ left: 3, top: 2, width: 1, height: 1 });
  });

  // Quand aucun changement n'est dans l'intervalle, alors il n'y a pas de rectangle.
  it("is null when no change is in the interval", () => {
    expect(changedRect(Uint32Array.of(pack(1, 1)), 1, 1, 4)).toBeNull();
  });
});

describe("le dessin d'une case (JOURNAL 2026-11-11)", () => {
  // Quand on peint la case (1, 0) à l'échelle 2, alors un carré de 2 × 2 pixels prend l'index, et rien d'autre.
  it("fills the square of the cell and nothing around it", () => {
    const pixels = new Uint8Array(4 * 4);

    placeCell(pixels, 4, { x: 1, y: 0, scale: 2 }, 9);

    expect(Array.from(pixels)).toEqual([0, 0, 9, 9, 0, 0, 9, 9, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
});
