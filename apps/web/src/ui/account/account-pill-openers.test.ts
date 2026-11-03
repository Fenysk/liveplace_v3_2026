import { describe, expect, it } from "vitest";
import { accountPillOpeners } from "./account-pill-openers";
import type { AccountSection } from "./account-window";

describe("ce que la pill Compte ouvre", () => {
  // Si le compte modère sans être le streamer, alors Modération ouvre la fenêtre sur Modération, et sa photo sur Mon compte
  it("opens Modération from its own button and Mon compte from the photo for a moderator", () => {
    const sections: AccountSection[] = [];
    const openers = accountPillOpeners("moderator", 3, (sectionId) => sections.push(sectionId));
    openers.onOpenAccount();
    openers.onOpenModeration?.();
    expect(sections).toEqual(["account", "moderation"]);
    expect(openers.onOpenSettings).toBeUndefined();
  });

  // Si des signalements attendent, alors la photo du streamer ouvre Modération, et Réglages ouvre Canvas
  it("opens Modération from the owner's photo while reports wait, and Canvas from Réglages", () => {
    const sections: AccountSection[] = [];
    const openers = accountPillOpeners("owner", 2, (sectionId) => sections.push(sectionId));
    openers.onOpenAccount();
    openers.onOpenSettings?.();
    expect(sections).toEqual(["moderation", "canvas"]);
    expect(openers.onOpenModeration).toBeUndefined();
  });

  // Quel que soit le rôle, invité et rôle pas encore connu compris, Nouveautés ouvre la fenêtre sur Nouveautés
  it("opens Nouveautés from its own button, whatever the role", () => {
    for (const role of ["owner", "moderator", "viewer", "guest", undefined] as const) {
      const sections: AccountSection[] = [];
      accountPillOpeners(role, 0, (sectionId) => sections.push(sectionId)).onOpenReleaseNotes?.();
      expect(sections).toEqual(["releaseNotes"]);
    }
  });

  // Tant qu'aucun signalement n'attend, la photo ouvre Mon compte, et un viewer n'a aucun bouton en plus
  it("opens Mon compte from the photo with no report, with no extra button for a viewer", () => {
    const sections: AccountSection[] = [];
    const openers = accountPillOpeners("viewer", undefined, (sectionId) => sections.push(sectionId));
    openers.onOpenAccount();
    expect(sections).toEqual(["account"]);
    expect(openers.onOpenSettings).toBeUndefined();
    expect(openers.onOpenModeration).toBeUndefined();
  });
});
