import { describe, expect, it } from "vitest";
import { toThumbnailPixels } from "./thumbnail-pixels";

describe("toThumbnailPixels (Écart §15, JOURNAL 2026-10-06)", () => {
  // Rend les cases qui ont une couleur, avec leur place, et jamais les cases transparentes
  it("gives the cells that have a colour, with their place, and never the transparent ones", () => {
    const state = Uint8Array.from([0, 5, 0, 0, 0, 7]);

    expect(toThumbnailPixels(state, 3)).toEqual([
      { x: 1, y: 0, colorIndex: 5 },
      { x: 2, y: 1, colorIndex: 7 },
    ]);
  });

  // Un canvas vide n'a aucune case à montrer
  it("has no cell to show on an empty canvas", () => {
    expect(toThumbnailPixels(new Uint8Array(12), 4)).toEqual([]);
  });
});
