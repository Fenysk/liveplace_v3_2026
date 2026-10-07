import { describe, expect, it } from "vitest";
import { followDelayMs } from "./follow-delay";

describe("followDelayMs (Écart §15, JOURNAL 2026-10-06)", () => {
  // Relit tout de suite, puis de plus en plus lentement : Convex a peut-être encore l'ancien canvas actif
  it("rereads at once, then more and more slowly: Convex may still hold the old active canvas", () => {
    expect([0, 1, 2, 3].map(followDelayMs)).toEqual([0, 400, 800, 1600]);
  });

  // Ne dépasse jamais 3 s, pour ne pas laisser la page sur l'ancien canvas trop longtemps
  it("never goes past 3 s, so the page does not stay on the old canvas too long", () => {
    expect([4, 5, 20, 1000].map(followDelayMs)).toEqual([3000, 3000, 3000, 3000]);
  });
});
