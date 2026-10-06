import { describe, expect, it } from "vitest";
import { nextFocusIndex } from "./scoreboard-keys";

describe("the keys of the scoreboard (JOURNAL 2026-10-06)", () => {
  // Va à l'avatar suivant ou précédent avec les flèches, sans sortir de la liste
  it("goes to the next or previous avatar with the arrows, without leaving the list", () => {
    expect(nextFocusIndex("ArrowDown", 1, 5)).toBe(2);
    expect(nextFocusIndex("ArrowDown", 4, 5)).toBe(4);
    expect(nextFocusIndex("ArrowUp", 1, 5)).toBe(0);
    expect(nextFocusIndex("ArrowUp", 0, 5)).toBe(0);
  });

  // Va au premier ou au dernier avatar avec Début et Fin
  it("goes to the first or last avatar with Home and End", () => {
    expect(nextFocusIndex("Home", 3, 5)).toBe(0);
    expect(nextFocusIndex("End", 1, 5)).toBe(4);
  });

  // Laisse passer toute autre touche, et un avatar qu'on ne trouve pas
  it("lets any other key through, and an avatar that cannot be found", () => {
    expect(nextFocusIndex("Tab", 1, 5)).toBeNull();
    expect(nextFocusIndex("ArrowLeft", 1, 5)).toBeNull();
    expect(nextFocusIndex("ArrowDown", -1, 5)).toBeNull();
  });
});
