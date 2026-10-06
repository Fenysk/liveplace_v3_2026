import { describe, expect, it } from "vitest";
import { toSlides } from "./slide-on-reorder";

describe("the slides of the scoreboard (JOURNAL 2026-10-06)", () => {
  // Fait glisser un avatar de sa hauteur d'avant vers celle d'après, et lui seul quand les autres restent
  it("slides an avatar from its height before to its height after, and only those that moved", () => {
    const before = new Map([
      ["ada", 0],
      ["bob", 44],
      ["eve", 88],
    ]);
    const after = new Map([
      ["ada", 0],
      ["eve", 44],
      ["bob", 88],
    ]);

    expect(toSlides(before, after)).toEqual([
      { key: "eve", offsetY: 44 },
      { key: "bob", offsetY: -44 },
    ]);
  });

  // Ne fait glisser ni un avatar qui arrive, ni un avatar qui part, ni rien quand l'ordre ne change pas
  it("slides neither an avatar that arrives, nor one that leaves, nor anything when the order is the same", () => {
    const same = new Map([["ada", 0]]);

    expect(toSlides(same, same)).toEqual([]);
    expect(toSlides(new Map(), new Map([["ada", 0]]))).toEqual([]);
    expect(toSlides(new Map([["ada", 0]]), new Map())).toEqual([]);
  });
});
