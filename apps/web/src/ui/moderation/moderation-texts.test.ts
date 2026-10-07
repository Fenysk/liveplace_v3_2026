import { describe, expect, it } from "vitest";
import { MODERATION_TEXTS } from "./moderation-texts";

const fr = MODERATION_TEXTS.fr;
const en = MODERATION_TEXTS.en;

describe("approvedToast (JOURNAL 2026-10-07)", () => {
  // Une pose au singulier, plusieurs poses au pluriel
  it("says one placement in the singular, several in the plural", () => {
    expect(fr.approvedToast(1)).toBe("Pose rétablie : elle revient sur le stream");
    expect(fr.approvedToast(3)).toBe("Poses rétablies : elles reviennent sur le stream");
    expect(en.approvedToast(1)).toBe("Placement restored: it is back on the stream");
    expect(en.approvedToast(3)).toBe("Placements restored: they are back on the stream");
  });
});

describe("reportCount (JOURNAL 2026-09-28)", () => {
  // Accorde le nombre de signalements
  it("agrees the number of reports", () => {
    expect(fr.reportCount(1)).toBe("1 signalement");
    expect(fr.reportCount(3)).toBe("3 signalements");
    expect(en.reportCount(1)).toBe("1 report");
    expect(en.reportCount(3)).toBe("3 reports");
  });

  // Zéro et un sont au singulier en français, un seul l'est en anglais
  it("treats zero as singular in French and as plural in English", () => {
    expect(fr.reportCount(0)).toBe("0 signalement");
    expect(en.reportCount(0)).toBe("0 reports");
  });
});

describe("pixelCount (JOURNAL 2026-09-25)", () => {
  // Dit aucun, un, ou le nombre, avec les espaces de milliers du français
  it("says none, one, or the count, with French thousands separators", () => {
    expect(fr.pixelCount(0)).toBe("Aucun pixel visible");
    expect(fr.pixelCount(1)).toBe("1 pixel");
    expect(fr.pixelCount(37)).toBe("37 pixels");
    expect(fr.pixelCount(4101)).toBe(`${(4101).toLocaleString("fr-FR")} pixels`);
  });

  // En anglais, les milliers prennent une virgule
  it("says none, one, or the count in English, with commas for the thousands", () => {
    expect(en.pixelCount(0)).toBe("No visible pixels");
    expect(en.pixelCount(1)).toBe("1 pixel");
    expect(en.pixelCount(37)).toBe("37 pixels");
    expect(en.pixelCount(4101)).toBe("4,101 pixels");
  });
});

describe("the mentions under a name (JOURNAL 2026-09-27)", () => {
  // D'où vient le rôle d'un modérateur, et d'où vient un ban
  it("says where the role of a moderator and the ban of a user come from, in both languages", () => {
    expect(fr.moderatorMention({ isFromTwitch: true, isNamedHere: true })).toBe(
      "Modérateur sur Twitch et LivePlace",
    );
    expect(en.moderatorMention({ isFromTwitch: true, isNamedHere: true })).toBe(
      "Moderator on Twitch and LivePlace",
    );
    expect(en.moderatorMention({ isFromTwitch: false, isNamedHere: true })).toBe("Moderator on LivePlace");
    expect(fr.banMention(true)).toBe("Banni sur Twitch");
    expect(en.banMention(false)).toBe("Banned on LivePlace");
  });
});
