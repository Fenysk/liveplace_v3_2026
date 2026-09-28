import type { AuthoredPixel } from "@liveplace/domain/ports";
import { describe, expect, it } from "vitest";
import { listClearedPixels, PLACEMENT_ONLY, toClearAction } from "./cleared-pixels";

const now = 1_700_000_000_000;
const MINUTE = 60_000;
const target = { userId: "troll", placementId: "ptroll001" };

const pixel = (x: number, placementId: string, placedAt: number): AuthoredPixel => ({
  x,
  y: 0,
  colorIndex: 4,
  placedAt,
  placementId,
});

// Sa pose sur deux lots, une voisine 3 min avant, une autre 20 min après.
const pixels = [
  pixel(0, "ptroll001", now),
  pixel(1, "ptroll001", now + 500),
  pixel(2, "pbefore01", now - 3 * MINUTE),
  pixel(3, "pafter001", now + 20 * MINUTE),
];

describe("clearing a placement (JOURNAL 2026-09-28)", () => {
  // Par défaut, la pose seule : l'aperçu et l'action visent la même chose
  it("by default, the placement alone: the preview and the action aim at the same thing", () => {
    expect(listClearedPixels(pixels, target, PLACEMENT_ONLY).map(({ x }) => x)).toEqual([0, 1]);
    expect(toClearAction(target, pixels, PLACEMENT_ONLY)).toEqual({
      action: "clearPlacement",
      target: "troll",
      placementId: "ptroll001",
    });
  });

  // L'aperçu suit le curseur : la plage s'étend avant et après la pose
  it("the preview follows the slider: the range extends before and after the placement", () => {
    const fiveMinutes = { isAll: false, spanMs: 5 * MINUTE };
    const hour = { isAll: false, spanMs: 60 * MINUTE };

    expect(listClearedPixels(pixels, target, fiveMinutes).map(({ x }) => x)).toEqual([0, 1, 2]);
    expect(listClearedPixels(pixels, target, hour).map(({ x }) => x)).toEqual([0, 1, 2, 3]);
    expect(toClearAction(target, pixels, fiveMinutes)).toEqual({
      action: "clearPlacement",
      target: "troll",
      placementId: "ptroll001",
      range: { from: now - 5 * MINUTE, to: now + 500 + 5 * MINUTE },
    });
  });

  // Cochée, la case retire tous ses pixels
  it("checked, the box clears all their pixels", () => {
    const all = { isAll: true, spanMs: 5 * MINUTE };

    expect(listClearedPixels(pixels, target, all)).toBe(pixels);
    expect(toClearAction(target, pixels, all)).toEqual({ action: "clearUser", target: "troll" });
  });
});
