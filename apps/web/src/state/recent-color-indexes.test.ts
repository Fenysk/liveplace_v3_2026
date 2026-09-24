import { TRANSPARENT_COLOR_INDEX } from "@liveplace/domain";
import { describe, expect, it } from "vitest";
import { INITIAL_RECENT_COLOR_INDEXES, rememberColorIndex } from "./recent-color-indexes";

describe("rememberColorIndex (design system, Mobile : couleurs récentes)", () => {
  // Cinq couleurs à portée de pouce dès l'arrivée
  it("starts with five colors", () => {
    expect(INITIAL_RECENT_COLOR_INDEXES).toHaveLength(5);
  });

  // Une couleur prise dans la palette complète entre en tête, la plus ancienne sort
  it("puts a new color first and drops the oldest", () => {
    expect(rememberColorIndex([1, 5, 28, 19, 9], 12)).toEqual([12, 1, 5, 28, 19]);
  });

  // Une couleur déjà là ne bouge pas : leur ordre est stable
  it("keeps the order when the color is already there", () => {
    expect(rememberColorIndex([1, 5, 28, 19, 9], 19)).toEqual([1, 5, 28, 19, 9]);
  });

  // La gomme n'est pas une couleur : elle n'entre jamais
  it("never remembers the eraser", () => {
    expect(rememberColorIndex([1, 5, 28, 19, 9], TRANSPARENT_COLOR_INDEX)).toEqual([1, 5, 28, 19, 9]);
  });
});
