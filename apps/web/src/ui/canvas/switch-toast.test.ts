import { describe, expect, it } from "vitest";
import { shouldAnnounceSwitch, switchToast } from "./switch-toast";

const live = { status: "live", isArchived: false } as const;
const archived = { status: "live", isArchived: true } as const;

describe("shouldAnnounceSwitch (Écart §15, JOURNAL 2026-10-06)", () => {
  // Annonce le changement que la page a vu arriver, à ses viewers
  it("announces the change the page saw coming, to its viewers", () => {
    expect(shouldAnnounceSwitch(live, archived, false)).toBe(true);
  });

  // Pas à celui qui l'a demandé : il a son propre toast
  it("does not announce it to whoever asked for it: they have their own toast", () => {
    expect(shouldAnnounceSwitch(live, archived, true)).toBe(false);
  });

  // Ni un canvas qui était déjà archivé à l'arrivée de la page, ni une coupure
  it("does not announce a canvas that was already archived on arrival, nor a connection drop", () => {
    expect(shouldAnnounceSwitch({ status: "connecting", isArchived: false }, archived, false)).toBe(false);
    expect(shouldAnnounceSwitch(archived, archived, false)).toBe(false);
    expect(shouldAnnounceSwitch(live, { status: "reconnecting", isArchived: true }, false)).toBe(false);
    expect(shouldAnnounceSwitch(live, live, false)).toBe(false);
  });
});

describe("switchToast (Écart §15, JOURNAL 2026-10-06)", () => {
  const context = { ownerName: "Kalyss", draftSize: 0, hasAskedHere: false };

  // Le streamer a changé de canvas : vrai pour un archivage comme pour une réouverture, donc sans « le nouveau »
  it("says the streamer changed canvas, which is true of an archiving as of a reopening", () => {
    expect(switchToast(live, archived, context, "fr")).toBe("Kalyss a changé de canvas.");
  });

  // Un brouillon non vide ne suit pas : il reste sur l'ancien canvas, et le toast le dit
  it("says a draft that is not empty stays on the old canvas", () => {
    expect(switchToast(live, archived, { ...context, draftSize: 1 }, "fr")).toBe(
      "Kalyss a changé de canvas : ton brouillon reste sur l'ancien.",
    );
    expect(switchToast(live, archived, { ...context, draftSize: 40 }, "fr")).toBe(
      "Kalyss a changé de canvas : ton brouillon reste sur l'ancien.",
    );
  });

  // Rien pour celui qui l'a demandé, ni pour une arrivée sur un canvas déjà archivé, brouillon ou non
  it("says nothing to whoever asked for it, nor on arrival on an archived canvas, draft or not", () => {
    for (const draftSize of [0, 3]) {
      expect(switchToast(live, archived, { ...context, draftSize, hasAskedHere: true }, "fr")).toBeNull();
      expect(switchToast(archived, archived, { ...context, draftSize }, "fr")).toBeNull();
      expect(
        switchToast({ status: "connecting", isArchived: false }, archived, { ...context, draftSize }, "fr"),
      ).toBeNull();
    }
  });

  // En anglais, la même règle et les mêmes deux phrases
  it("says the same two sentences in English, and nothing in the same cases", () => {
    expect(switchToast(live, archived, context, "en")).toBe("Kalyss switched canvas.");
    expect(switchToast(live, archived, { ...context, draftSize: 2 }, "en")).toBe(
      "Kalyss switched canvas: your draft stays on the old one.",
    );
    expect(switchToast(live, archived, { ...context, hasAskedHere: true }, "en")).toBeNull();
  });
});
