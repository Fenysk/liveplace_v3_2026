import { describe, expect, it } from "vitest";
import { isSingular, LOCALES } from "./locale";
import { defineTexts, localized } from "./texts";

const TEXTS = defineTexts({
  close: { fr: "Fermer", en: "Close" },
  reportCount: localized({
    fr: (count: number) => (isSingular(count, "fr") ? `${count} signalement` : `${count} signalements`),
    en: (count) => (isSingular(count, "en") ? `${count} report` : `${count} reports`),
  }),
});

describe("les phrases d'un module (Écart §14, JOURNAL 2026-10-07)", () => {
  // Quand on lit une langue, le système doit rendre chaque phrase dans cette langue
  it("gives every sentence in the language that is read", () => {
    expect(TEXTS.fr.close).toBe("Fermer");
    expect(TEXTS.en.close).toBe("Close");
  });

  // Une phrase qui prend un nombre se lit aussi par langue, avec le pluriel de la langue
  it("gives the sentences that take values, with the plural of the language", () => {
    expect(TEXTS.fr.reportCount(0)).toBe("0 signalement");
    expect(TEXTS.en.reportCount(0)).toBe("0 reports");
    expect(TEXTS.fr.reportCount(2)).toBe("2 signalements");
    expect(TEXTS.en.reportCount(1)).toBe("1 report");
  });

  // Chaque langue de la liste a sa table : aucune n'est oubliée
  it("holds a table for every language of the list", () => {
    expect(Object.keys(TEXTS)).toEqual([...LOCALES]);
    for (const locale of LOCALES) expect(Object.keys(TEXTS[locale])).toEqual(["close", "reportCount"]);
  });
});
