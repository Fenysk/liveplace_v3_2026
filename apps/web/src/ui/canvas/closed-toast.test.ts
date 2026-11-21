import { describe, expect, it } from "vitest";
import { DRAFT_TEXTS } from "../draft/draft-texts";
import { closedToast } from "./closed-toast";

const START = 1_000_000;
const END = 2_000_000;
const state = {
  isEnabled: true,
  title: "T",
  startsAt: START,
  endsAt: END,
  donationCount: 0,
  isEventOnly: true,
};

describe("the toast of a closed drawing (JOURNAL 2026-11-21)", () => {
  // Avant le début : l'événement ouvre le dessin ; après la fin : il est fermé
  it("says the start before the event and the end after it, in both languages", () => {
    expect(closedToast(state, "Bob", "fr", START - 1)).toBe(DRAFT_TEXTS.fr.waitingForEvent);
    expect(closedToast(state, "Bob", "en", END)).toBe(DRAFT_TEXTS.en.eventOver);
    expect(DRAFT_TEXTS.fr.eventOver.replace(/\s/g, " ")).toBe("L'événement est fini : le dessin est fermé.");
  });

  // Sans réglage « seulement pendant l'événement » : le live du streamer
  it("keeps the live message when the event does not close the drawing", () => {
    const live = DRAFT_TEXTS.fr.waitingForLive("Bob");
    expect(closedToast({ ...state, isEventOnly: false }, "Bob", "fr", START - 1)).toBe(live);
    expect(closedToast(undefined, "Bob", "fr", START - 1)).toBe(live);
    expect(closedToast(state, "Bob", "fr", START + 1)).toBe(live);
  });
});
