import { TRANSPARENT_COLOR_INDEX } from "@liveplace/domain";
import { describe, expect, it } from "vitest";
import { INITIAL_RECENT_COLOR_INDEXES, rememberColorIndex } from "./recent-color-indexes";

const ROW = [5, 28, 19, 9, 42];

describe("rememberColorIndex (design system, Mobile : la rangée des couleurs récentes)", () => {
  // Cinq couleurs à portée de pouce dès l'arrivée, sans le noir, qui est sur le bouton
  it("starts with five colors, none of them the first one on the button", () => {
    expect(INITIAL_RECENT_COLOR_INDEXES).toHaveLength(5);
    expect(INITIAL_RECENT_COLOR_INDEXES).not.toContain(1);
  });

  // Une couleur récente s'échange avec celle du bouton, sur place : rien d'autre ne bouge
  it("swaps a recent color with the one on the button, in its own slot", () => {
    expect(rememberColorIndex(ROW, 1, 19)).toEqual([5, 28, 1, 9, 42]);
  });

  // Toucher deux fois la même case alterne entre deux couleurs
  it("gives the first color back when the same slot is touched twice", () => {
    expect(rememberColorIndex(rememberColorIndex(ROW, 1, 19), 19, 1)).toEqual(ROW);
  });

  // Une couleur nouvelle, prise dans la palette : celle qu'elle remplace entre en tête, la plus ancienne sort
  it("puts the replaced color first when a new one comes from the palette, and drops the oldest", () => {
    expect(rememberColorIndex(ROW, 1, 12)).toEqual([1, 5, 28, 19, 9]);
  });

  // La couleur déjà sur le bouton ne change rien
  it("keeps the row when the color is already on the button", () => {
    expect(rememberColorIndex(ROW, 1, 1)).toEqual(ROW);
  });

  // La gomme n'est pas une couleur : elle n'entre jamais dans la rangée
  it("never remembers the eraser", () => {
    expect(rememberColorIndex(ROW, 1, TRANSPARENT_COLOR_INDEX)).toEqual(ROW);
  });
});
