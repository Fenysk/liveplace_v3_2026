import type { CharityEventState } from "@liveplace/protocol";
import { describe, expect, it } from "vitest";
import { CHARITY_TEXTS } from "./charity-texts";
import { charityPillOf } from "./use-charity-pill";

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const START = 10 * HOUR;
const END = 20 * HOUR;

const state = (overrides: Partial<CharityEventState> = {}): CharityEventState => ({
  isEnabled: true,
  title: "Live caritatif",
  address: "https://streamlabscharity.com/@exemple/soiree",
  startsAt: START,
  endsAt: END,
  donationCount: 0,
  ...overrides,
});

const lineAt = (nowMs: number, overrides: Partial<CharityEventState> = {}, locale: "fr" | "en" = "fr") =>
  charityPillOf(state(overrides), nowMs, locale, CHARITY_TEXTS[locale])?.line;

describe("la 2e ligne de la pastille de l'événement", () => {
  // Avant le début : le compte à rebours, inchangé
  it("counts down to the start before it", () => {
    expect(lineAt(START - 2 * 24 * HOUR - 5 * HOUR)).toBe("Commence dans 2 j 5 h");
    expect(lineAt(START - 90 * SECOND)).toBe("Commence dans 1 min 30 s");
    expect(lineAt(START - 90 * SECOND, {}, "en")).toBe("Starts in 1 min 30 s");
  });

  // Pendant l'événement, loin de la fin : « En cours »
  it("says it is running while the end is more than an hour away", () => {
    expect(lineAt(START)).toBe("En cours");
    expect(lineAt(END - 5 * HOUR)).toBe("En cours");
    expect(lineAt(START, {}, "en")).toBe("Live now");
  });

  // Le compte à rebours de la fin n'apparaît que strictement sous une heure, et les secondes descendent une à une
  it("switches to the end countdown only strictly under one hour, and ticks every second", () => {
    expect(lineAt(END - HOUR)).toBe("En cours");
    expect(lineAt(END - HOUR + 1)).toBe("Se termine dans 59 min 59 s");
    expect(lineAt(END - 12 * MINUTE - 30 * SECOND)).toBe("Se termine dans 12 min 30 s");
    expect(lineAt(END - 12 * MINUTE - 29 * SECOND)).toBe("Se termine dans 12 min 29 s");
    expect(lineAt(END - 12 * MINUTE - 30 * SECOND, {}, "en")).toBe("Ends in 12 min 30 s");
  });

  // Sans fin : « En cours » jusqu'au bout, jamais de décompte
  it("stays on running without an end, whatever the time", () => {
    expect(lineAt(START, { endsAt: undefined })).toBe("En cours");
    expect(lineAt(START + 1_000 * HOUR, { endsAt: undefined })).toBe("En cours");
    expect(lineAt(START + 1_000 * HOUR, { endsAt: undefined }, "en")).toBe("Live now");
  });

  // Après la fin, la pastille reste avec « Événement terminé », jusqu'au switch OFF ; son lien de dons reste aussi
  it("stays after the end with « Événement terminé », and keeps its donation link", () => {
    expect(lineAt(END)).toBe("Événement terminé");
    expect(lineAt(END + 1_000 * HOUR)).toBe("Événement terminé");
    expect(lineAt(END, {}, "en")).toBe("Event ended");
    expect(charityPillOf(state(), END, "fr", CHARITY_TEXTS.fr)).toEqual({
      title: "Live caritatif",
      line: "Événement terminé",
      href: "https://streamlabscharity.com/@exemple/soiree",
      isRunning: false,
    });
    expect(charityPillOf(state({ address: undefined }), END, "fr", CHARITY_TEXTS.fr)?.href).toBeUndefined();
  });

  // Le switch OFF, ou un réglage qui ne tient pas, retire la pastille
  it("shows nothing when the event is switched off, or has no title, even after the end", () => {
    expect(charityPillOf(state({ isEnabled: false }), END, "fr", CHARITY_TEXTS.fr)).toBeUndefined();
    expect(charityPillOf(state({ title: "" }), END, "fr", CHARITY_TEXTS.fr)).toBeUndefined();
    expect(
      charityPillOf(state({ address: "https://example.com/x" }), END, "fr", CHARITY_TEXTS.fr),
    ).toBeUndefined();
    expect(charityPillOf(state({ isEnabled: false }), START, "fr", CHARITY_TEXTS.fr)).toBeUndefined();
    expect(charityPillOf(state({ title: "" }), START, "fr", CHARITY_TEXTS.fr)).toBeUndefined();
    expect(charityPillOf(undefined, START, "fr", CHARITY_TEXTS.fr)).toBeUndefined();
  });

  // Le lien n'existe qu'avec une adresse de dons valide
  it("gives the donation link only for a valid address", () => {
    const hrefAt = (overrides: Partial<CharityEventState>) =>
      charityPillOf(state(overrides), START, "fr", CHARITY_TEXTS.fr)?.href;
    expect(hrefAt({})).toBe("https://streamlabscharity.com/@exemple/soiree");
    expect(hrefAt({ address: undefined })).toBeUndefined();
    expect(hrefAt({ address: "   " })).toBeUndefined();
  });
});
