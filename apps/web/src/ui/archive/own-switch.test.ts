import { describe, expect, it } from "vitest";
import { createOwnSwitchTracker, OWN_SWITCH_WINDOW_MS } from "./own-switch";

describe("createOwnSwitchTracker (Écart §15, JOURNAL 2026-10-06)", () => {
  // N'a rien demandé au départ
  it("has asked for nothing at the start", () => {
    expect(createOwnSwitchTracker().isRecent(1_000_000)).toBe(false);
  });

  // Se souvient d'avoir demandé, le temps que la frame arrive, puis l'oublie
  it("remembers having asked, long enough for the frame to arrive, then forgets", () => {
    const tracker = createOwnSwitchTracker();

    tracker.mark(1_000_000);

    expect(tracker.isRecent(1_000_000)).toBe(true);
    expect(tracker.isRecent(1_000_000 + OWN_SWITCH_WINDOW_MS - 1)).toBe(true);
    expect(tracker.isRecent(1_000_000 + OWN_SWITCH_WINDOW_MS)).toBe(false);
  });

  // La plus récente demande compte
  it("counts the latest request", () => {
    const tracker = createOwnSwitchTracker();

    tracker.mark(1_000_000);
    tracker.mark(1_000_000 + OWN_SWITCH_WINDOW_MS);

    expect(tracker.isRecent(1_000_000 + OWN_SWITCH_WINDOW_MS + 1)).toBe(true);
  });
});
