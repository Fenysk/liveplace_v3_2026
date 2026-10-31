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

const SPACED = defineTexts({
  ban: { fr: "Bannir X ?", en: "Ban X ?" },
  bang: { fr: "Un instant !", en: "One moment !" },
  semicolon: { fr: "Seules les cases vides ; pas les autres", en: "Only empty cells ; not the others" },
  colon: { fr: "Fond enregistré : noir", en: "Saved : black" },
  quotes: { fr: "« Titre » est supprimé", en: "« Title » is deleted" },
  units: { fr: "2 Mo, 2048 px, 50 %, 5 €", en: "2 Mo, 2048 px, 50 %, 5 €" },
  banName: localized({ fr: (name: string) => `Bannir ${name} ?`, en: (name) => `Ban ${name} ?` }),
  named: localized({
    fr: (title: string) => `« ${title} » : ${title.length} Mo`,
    en: (title) => `« ${title} »`,
  }),
  table: localized<Record<"archive" | "reopen", string>>({
    fr: { archive: "Archivée : ok", reopen: "Rouverte" },
    en: { archive: "Archived : ok", reopen: "Reopened" },
  }),
  list: localized<readonly string[]>({ fr: ["Un ? deux", "Trois : quatre"], en: ["One ? two"] }),
  listed: localized({ fr: () => ["Un ? deux"], en: () => ["One ? two"] }),
  options: localized<readonly { value: string; label: string }[]>({
    fr: [{ value: "keep", label: "Garder : tout" }],
    en: [{ value: "keep", label: "Keep : all" }],
  }),
  untouched: {
    fr: "Tape !draw 3 4 ou ouvre https://liveplace.fr/x:1 : fini ? oui?",
    en: "Tape !draw 3 4 or open https://liveplace.fr/x:1 : done ? yes?",
  },
});

describe("la typographie française des phrases (espaces insécables)", () => {
  // Quand la phrase française met une espace avant « ? », « ! » ou « ; », le système doit y mettre une espace fine insécable
  it("puts a narrow no-break space before a question mark, an exclamation mark and a semicolon", () => {
    expect(SPACED.fr.ban).toBe("Bannir X\u202f?");
    expect(SPACED.fr.bang).toBe("Un instant\u202f!");
    expect(SPACED.fr.semicolon).toBe("Seules les cases vides\u202f; pas les autres");
  });

  // Quand la phrase française met une espace avant « : », le système doit y mettre une espace insécable
  it("puts a no-break space before a colon", () => {
    expect(SPACED.fr.colon).toBe("Fond enregistré\u00a0: noir");
  });

  // Quand la phrase française écrit un guillemet français, le système doit coller l'espace intérieure au texte
  it("puts a no-break space inside French quotation marks", () => {
    expect(SPACED.fr.quotes).toBe("«\u00a0Titre\u00a0» est supprimé");
  });

  // Quand un nombre précède Mo, px, % ou €, le système doit les lier par une espace insécable
  it("puts a no-break space between a number and its unit", () => {
    expect(SPACED.fr.units).toBe("2\u00a0Mo, 2048\u00a0px, 50\u00a0%, 5\u00a0€");
  });

  // Une phrase qui est une fonction rend la même typographie
  it("gives the same spaces to a sentence that is a function", () => {
    expect(SPACED.fr.banName("Alexis")).toBe("Bannir Alexis\u202f?");
    expect(SPACED.fr.named("abc")).toBe("«\u00a0abc\u00a0»\u00a0: 3\u00a0Mo");
  });

  // Une table, un tableau ou une liste d'options suivent, sans changer leur forme ni leurs clés
  it("reaches the strings of a table, a list and a list of options", () => {
    expect(SPACED.fr.table).toEqual({ archive: "Archivée\u00a0: ok", reopen: "Rouverte" });
    expect(SPACED.fr.list).toEqual(["Un\u202f? deux", "Trois\u00a0: quatre"]);
    expect(SPACED.fr.options).toEqual([{ value: "keep", label: "Garder\u00a0: tout" }]);
  });

  // Une fonction qui ne rend pas une chaîne garde ce qu'elle rend
  it("keeps what a function that does not give a string gives", () => {
    expect(SPACED.fr.listed()).toEqual(["Un ? deux"]);
  });

  // Quand l'espace n'est pas de la ponctuation (une commande de chat, une adresse, rien à lier), le système ne doit pas la toucher
  it("leaves a chat command, an address and a missing space alone", () => {
    expect(SPACED.fr.untouched).toBe(
      "Tape !draw 3 4 ou ouvre https://liveplace.fr/x:1\u00a0: fini\u202f? oui?",
    );
  });

  // Les textes anglais ne changent pas
  it("leaves the English sentences as they are", () => {
    expect(SPACED.en.ban).toBe("Ban X ?");
    expect(SPACED.en.bang).toBe("One moment !");
    expect(SPACED.en.semicolon).toBe("Only empty cells ; not the others");
    expect(SPACED.en.colon).toBe("Saved : black");
    expect(SPACED.en.quotes).toBe("« Title » is deleted");
    expect(SPACED.en.units).toBe("2 Mo, 2048 px, 50 %, 5 €");
    expect(SPACED.en.banName("Alexis")).toBe("Ban Alexis ?");
    expect(SPACED.en.table).toEqual({ archive: "Archived : ok", reopen: "Reopened" });
    expect(SPACED.en.untouched).toBe("Tape !draw 3 4 or open https://liveplace.fr/x:1 : done ? yes?");
  });
});
