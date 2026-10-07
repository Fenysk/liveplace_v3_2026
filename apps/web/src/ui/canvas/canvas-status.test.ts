import { describe, expect, it } from "vitest";
import { isCanvasArchived, isCanvasReopened } from "./canvas-status";

describe("what a page reads from the status of its canvas (Écart §15, JOURNAL 2026-10-06)", () => {
  // La page du jeu suit le canvas actif dès que celui qu'elle montre est archivé, et seulement une fois connectée
  it("makes the game page follow the active canvas as soon as its canvas is archived, once connected only", () => {
    expect(isCanvasArchived({ status: "live", isArchived: true })).toBe(true);
    expect(isCanvasArchived({ status: "live", isArchived: false })).toBe(false);
    expect(isCanvasArchived({ status: "connecting", isArchived: true })).toBe(false);
    expect(isCanvasArchived({ status: "reconnecting", isArchived: true })).toBe(false);
  });

  // La page d'une archive part sur `/{login}` quand son canvas est actif de nouveau, jamais avant le welcome ni supprimé
  it("sends an archive page to /{login} once its canvas is active again, never before the welcome nor discarded", () => {
    expect(isCanvasReopened({ status: "live", isArchived: false, isDiscarded: false })).toBe(true);
    expect(isCanvasReopened({ status: "live", isArchived: true, isDiscarded: false })).toBe(false);
    expect(isCanvasReopened({ status: "connecting", isArchived: false, isDiscarded: false })).toBe(false);
    expect(isCanvasReopened({ status: "live", isArchived: false, isDiscarded: true })).toBe(false);
  });
});
