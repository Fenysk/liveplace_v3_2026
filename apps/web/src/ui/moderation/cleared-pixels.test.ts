import type { AuthoredPixel } from "@liveplace/domain/ports";
import { describe, expect, it } from "vitest";
import {
  clearSpanSteps,
  listClearedPixels,
  PLACEMENT_ONLY,
  toClearActions,
  toPlacementRange,
} from "./cleared-pixels";

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
    expect(toClearActions(target, pixels, PLACEMENT_ONLY)).toEqual([
      { action: "clearPlacement", target: "troll", placementId: "ptroll001" },
    ]);
  });

  // L'aperçu suit le curseur : la plage s'étend avant et après la pose
  it("the preview follows the slider: the range extends before and after the placement", () => {
    const fiveMinutes = { isAll: false, spanMs: 5 * MINUTE };
    const hour = { isAll: false, spanMs: 60 * MINUTE };

    expect(listClearedPixels(pixels, target, fiveMinutes).map(({ x }) => x)).toEqual([0, 1, 2]);
    expect(listClearedPixels(pixels, target, hour).map(({ x }) => x)).toEqual([0, 1, 2, 3]);
    expect(toClearActions(target, pixels, fiveMinutes)).toEqual([
      {
        action: "clearPlacement",
        target: "troll",
        placementId: "ptroll001",
        range: { from: now - 5 * MINUTE, to: now + 500 + 5 * MINUTE },
      },
    ]);
  });

  // Cochée, la case retire tous ses pixels
  it("checked, the box clears all their pixels", () => {
    const all = { isAll: true, spanMs: 5 * MINUTE };

    expect(listClearedPixels(pixels, target, all)).toBe(pixels);
    expect(toClearActions(target, pixels, all)).toEqual([{ action: "clearUser", target: "troll" }]);
  });

  // Signaler prend la même plage ; sans pixel visible de la pose, aucune plage (JOURNAL 2026-09-29)
  it("reporting takes the same range; with no visible pixel of the placement, no range", () => {
    expect(toPlacementRange(pixels, ["ptroll001"], MINUTE)).toEqual({
      from: now - MINUTE,
      to: now + 500 + MINUTE,
    });
    expect(toPlacementRange(pixels, ["pgone0001"], MINUTE)).toBeNull();
  });
});

// Une ligne de signalement : deux poses de l'auteur, une pose rétablie entre les deux, une avant, une après.
const rowPixels = [
  pixel(0, "pone00001", now),
  pixel(1, "ptwo00001", now + 2 * MINUTE),
  pixel(2, "pbetween1", now + MINUTE),
  pixel(3, "pbefore01", now - 3 * MINUTE),
  pixel(4, "pafter001", now + 10 * MINUTE),
];
const rowTarget = { userId: "troll", placementId: "pone00001", placementIds: ["pone00001", "ptwo00001"] };

// Ce que les actions touchent côté serveur : leurs poses, et les pixels de leurs plages (moderate.lua).
const clearedBy = (actions: ReturnType<typeof toClearActions>): number[] =>
  rowPixels
    .filter(({ placementId, placedAt }) =>
      actions.some(
        (action) =>
          action.action === "clearPlacement" &&
          (action.placementId === placementId ||
            (action.range !== undefined &&
              placedAt !== undefined &&
              placedAt >= action.range.from &&
              placedAt <= action.range.to)),
      ),
    )
    .map(({ x }) => x);

// Les poses visées par les actions, dans l'ordre d'envoi.
const placementsOf = (actions: ReturnType<typeof toClearActions>): string[] =>
  actions.flatMap((action) => (action.action === "clearPlacement" ? [action.placementId] : []));

describe("clearing the placements of a report row (JOURNAL 2026-10-07)", () => {
  // Au cran 0, la fenêtre montre et retire les poses de la ligne, une action par pose et sans plage
  it("at step 0, shows and clears the row's placements: one action each, without a range", () => {
    expect(listClearedPixels(rowPixels, rowTarget, PLACEMENT_ONLY).map(({ x }) => x)).toEqual([0, 1]);
    expect(toClearActions(rowTarget, rowPixels, PLACEMENT_ONLY)).toEqual([
      { action: "clearPlacement", target: "troll", placementId: "pone00001" },
      { action: "clearPlacement", target: "troll", placementId: "ptwo00001" },
    ]);
  });

  // Une pose de la ligne qui n'a plus de pixel visible reçoit quand même sa pierre tombale
  it("still clears a row's placement that has no visible pixel left", () => {
    const row = { ...rowTarget, placementIds: ["pone00001", "pgone0001"] };

    expect(listClearedPixels(rowPixels, row, PLACEMENT_ONLY).map(({ x }) => x)).toEqual([0]);
    expect(toClearActions(row, rowPixels, PLACEMENT_ONLY)).toEqual([
      { action: "clearPlacement", target: "troll", placementId: "pgone0001" },
      { action: "clearPlacement", target: "troll", placementId: "pone00001" },
    ]);
  });

  // Les actions partent de la plus ancienne pose à la plus récente, quel que soit l'ordre reçu ; à égalité, l'ordre reçu
  it("sends the actions from the oldest placement to the newest, whatever the order received; a tie keeps it", () => {
    const newestFirst = { ...rowTarget, placementIds: ["ptwo00001", "pone00001"] };
    const sameTime = [pixel(0, "pb0000001", now), pixel(1, "pa0000001", now)];
    const tied = { userId: "troll", placementId: "pb0000001", placementIds: ["pb0000001", "pa0000001"] };

    expect(placementsOf(toClearActions(newestFirst, rowPixels, PLACEMENT_ONLY))).toEqual([
      "pone00001",
      "ptwo00001",
    ]);
    expect(placementsOf(toClearActions(tied, sameTime, PLACEMENT_ONLY))).toEqual(["pb0000001", "pa0000001"]);
  });

  // La plage reste sur la première action envoyée, la plus ancienne
  it("beyond step 0, keeps the range on the first action sent, the oldest placement", () => {
    const newestFirst = { ...rowTarget, placementIds: ["ptwo00001", "pone00001"] };
    const [first, second] = toClearActions(newestFirst, rowPixels, { isAll: false, spanMs: MINUTE });

    expect(first).toEqual({
      action: "clearPlacement",
      target: "troll",
      placementId: "pone00001",
      range: { from: now - MINUTE, to: now + 3 * MINUTE },
    });
    expect(second).toEqual({ action: "clearPlacement", target: "troll", placementId: "ptwo00001" });
  });

  // Au-delà du cran 0, une plage autour de toute la ligne, sur la première action ; les autres posent leur pierre
  it("beyond step 0, puts one range around the whole row on the first action, the others clear their placement", () => {
    const oneMinute = { isAll: false, spanMs: MINUTE };

    expect(listClearedPixels(rowPixels, rowTarget, oneMinute).map(({ x }) => x)).toEqual([0, 1, 2]);
    expect(toClearActions(rowTarget, rowPixels, oneMinute)).toEqual([
      {
        action: "clearPlacement",
        target: "troll",
        placementId: "pone00001",
        range: { from: now - MINUTE, to: now + 3 * MINUTE },
      },
      { action: "clearPlacement", target: "troll", placementId: "ptwo00001" },
    ]);
  });

  // L'aperçu et ce qui part au serveur couvrent les mêmes pixels, à chaque cran
  it("covers the same pixels in the preview and on the server, at every step", () => {
    for (const spanMs of [0, MINUTE, 5 * MINUTE, 15 * MINUTE, 60 * MINUTE]) {
      const scope = { isAll: false, spanMs };

      expect(clearedBy(toClearActions(rowTarget, rowPixels, scope))).toEqual(
        listClearedPixels(rowPixels, rowTarget, scope).map(({ x }) => x),
      );
    }
  });

  // Cochée, la case retire tous ses pixels d'un coup, quelles que soient les poses de la ligne
  it("checked, the box clears all their pixels in one action, whatever the row's placements", () => {
    expect(toClearActions(rowTarget, rowPixels, { isAll: true, spanMs: 0 })).toEqual([
      { action: "clearUser", target: "troll" },
    ]);
  });

  // Sans `placementIds`, la cible est la seule `placementId`
  it("without `placementIds`, the target is its `placementId` alone", () => {
    const alone = { userId: "troll", placementId: "pone00001" };
    const listed = { ...alone, placementIds: ["pone00001"] };

    expect(toClearActions(alone, rowPixels, PLACEMENT_ONLY)).toEqual(
      toClearActions(listed, rowPixels, PLACEMENT_ONLY),
    );
    expect(listClearedPixels(rowPixels, alone, { isAll: false, spanMs: MINUTE })).toEqual(
      listClearedPixels(rowPixels, listed, { isAll: false, spanMs: MINUTE }),
    );
  });
});

describe("the slider's steps (JOURNAL 2026-10-07)", () => {
  // Une pose : « Cette pose seule » ; plusieurs : « Les poses signalées », les autres crans restent
  it("names step 0 after the placement alone, or after the reported ones for several, the others unchanged", () => {
    const [one, ...rest] = clearSpanSteps(1, "fr");
    const [many, ...manyRest] = clearSpanSteps(2, "fr");

    expect(one).toEqual({ value: 0, label: "Cette pose seule" });
    expect(many).toEqual({ value: 0, label: "Les poses signalées" });
    expect(manyRest).toEqual(rest);
    expect(rest.map(({ label }) => label)).toEqual(["± 1 min", "± 5 min", "± 15 min", "± 1 h"]);
    expect(clearSpanSteps(1, "en")[0]).toEqual({ value: 0, label: "This placement only" });
    expect(clearSpanSteps(3, "en")[0]).toEqual({ value: 0, label: "The reported placements" });
  });
});
