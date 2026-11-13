import { describe, expect, it } from "vitest";
import { MINUTE_MS, type Role } from "./index";
import { isBoundToLive, LIVE_ONLY_GRACE_MS, liveGate, OPEN_DRAWING } from "./live-only";

const endedAt = 1_700_000_000_000;

describe("liveGate (JOURNAL 2026-11-12)", () => {
  // Une chaîne en live : le dessin est ouvert, sans échéance
  it("keeps the drawing open while the streamer is live", () => {
    expect(liveGate({ twitchLive: { category: "Just Chatting" } }, endedAt)).toEqual(OPEN_DRAWING);
  });

  // Un état jamais lu (Twitch injoignable, compte jamais suivi) ne ferme rien
  it("keeps the drawing open when the live state was never read", () => {
    expect(liveGate(null, endedAt)).toEqual(OPEN_DRAWING);
  });

  // Une catégorie vide est encore un live
  it("counts a live without a category as a live", () => {
    expect(liveGate({ twitchLive: { category: "" } }, endedAt)).toEqual(OPEN_DRAWING);
  });

  // Après la fin du live, le dessin reste ouvert 10 minutes, et dit quand il se ferme
  it("stays open for ten minutes after the live ends, and says when it closes", () => {
    expect(LIVE_ONLY_GRACE_MS).toBe(10 * MINUTE_MS);
    expect(liveGate({ endedAt }, endedAt)).toEqual({
      isClosed: false,
      closesAt: endedAt + LIVE_ONLY_GRACE_MS,
    });
    expect(liveGate({ endedAt }, endedAt + LIVE_ONLY_GRACE_MS - 1)).toEqual({
      isClosed: false,
      closesAt: endedAt + LIVE_ONLY_GRACE_MS,
    });
  });

  // À l'échéance exacte il se ferme, et reste fermé
  it("closes at the exact deadline and stays closed", () => {
    expect(liveGate({ endedAt }, endedAt + LIVE_ONLY_GRACE_MS)).toEqual({ isClosed: true });
    expect(liveGate({ endedAt }, endedAt + 3 * LIVE_ONLY_GRACE_MS)).toEqual({ isClosed: true });
  });

  // Un stream qui coupe puis repart ne ferme rien : en live de nouveau, la fin d'avant ne compte plus
  it("ignores the end of a previous live once the streamer is live again", () => {
    const state = { twitchLive: { category: "Art" }, endedAt };
    expect(liveGate(state, endedAt + 5 * LIVE_ONLY_GRACE_MS)).toEqual(OPEN_DRAWING);
  });

  // Hors live sans heure de fin connue : fermé, la fin est ancienne
  it("closes when the streamer is known offline without an end time", () => {
    expect(liveGate({}, endedAt)).toEqual({ isClosed: true });
  });
});

describe("isBoundToLive (JOURNAL 2026-11-12)", () => {
  const bound = (role: Role) => isBoundToLive(true, role);

  // Le viewer et le modérateur suivent la règle ; le streamer en est exempt et l'invité n'est pas concerné
  it("binds viewers and moderators, never the owner or a guest", () => {
    expect(bound("viewer")).toBe(true);
    expect(bound("moderator")).toBe(true);
    expect(bound("owner")).toBe(false);
    expect(bound("guest")).toBe(false);
  });

  // Sans le réglage, personne n'est lié au live
  it("binds nobody without the setting", () => {
    expect(isBoundToLive(false, "viewer")).toBe(false);
    expect(isBoundToLive(false, "moderator")).toBe(false);
  });
});
