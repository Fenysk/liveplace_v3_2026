import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LegalPage } from "../legal/legal-page";
import { legalSections } from "../legal/legal-sections";
import { LEGAL_TEXTS } from "../legal/legal-texts";
import { LocaleProvider } from "../locale/use-locale";
import { PrivacyPage } from "../privacy/privacy-page";
import { privacySections } from "../privacy/privacy-sections";
import { PRIVACY_TEXTS } from "../privacy/privacy-texts";
import { sentenceChips } from "./document-chips";
import { type ChipName, CONTACT_ADDRESS, type DocumentSection, type Sentence } from "./document-sections";

const LOCALES = ["fr", "en"] as const;
type TestLocale = (typeof LOCALES)[number];

const render = (page: typeof PrivacyPage | typeof LegalPage, locale: TestLocale): string =>
  renderToStaticMarkup(createElement(LocaleProvider, { initial: locale }, createElement(page)));

const textOf = (html: string): string =>
  html
    .replace(/<[^>]*>/g, "")
    .replaceAll("&#x27;", "'")
    .replace(/[  ]/g, " ");

const paragraphOf = (html: string, id: string, index: number): string => {
  const section = new RegExp(`<section id="${id}"[^>]*>(.*?)</section>`, "s").exec(html)?.[1] ?? "";
  return [...section.matchAll(/<p [^>]*>(.*?)<\/p>/gs)][index]?.[1] ?? "";
};

// Les pastilles d'un paragraphe, dans l'ordre : leur classe, leur nom, et s'il porte une icône
const chipsOf = (paragraph: string) =>
  [...paragraph.matchAll(/<span class="(lp-chip[^"]*)">(.*?)<\/span>/gs)].map(([, className, inner]) => ({
    className,
    label: textOf(inner ?? ""),
    hasIcon: (inner ?? "").startsWith("<svg "),
  }));

type Written = {
  page: typeof PrivacyPage | typeof LegalPage;
  id: string;
  index: number;
  words: Record<TestLocale, string>;
  chips: readonly ChipName[];
};

// Les phrases du texte validé du 2026-11-04 qui citent un élément d'interface, mot pour mot, avec les pastilles dans l'ordre
const WRITTEN: readonly Written[] = [
  {
    page: PrivacyPage,
    id: "privacy-streamer",
    index: 0,
    words: {
      fr: "Quand tu cliques Synchroniser avec Twitch, on lit tes modérateurs et tes bannis, et Twitch nous prévient d'un nouveau ban sur ta chaîne.",
      en: "When you click Sync with Twitch, we read your moderators and your banned users, and Twitch tells us about a new ban on your channel.",
    },
    chips: ["syncWithTwitch"],
  },
  {
    page: PrivacyPage,
    id: "privacy-drawings",
    index: 1,
    words: {
      fr: "Sur une fresque, n'importe qui peut voir qui a posé un pixel, et quand : c'est l'Inspection. Le Classement montre aussi les noms.",
      en: "On a canvas, anyone can see who placed a pixel, and when: that's Inspection. The Scoreboard shows names too.",
    },
    chips: ["inspection", "scoreboard"],
  },
  {
    page: PrivacyPage,
    id: "privacy-delete-account",
    index: 0,
    words: {
      fr: "Connecte-toi, ouvre Mon compte, clique Supprimer mon compte.",
      en: "Sign in, open My account, click Delete my account.",
    },
    chips: ["myAccount", "deleteAccount"],
  },
  {
    page: PrivacyPage,
    id: "privacy-rights",
    index: 1,
    words: {
      fr: "Pour effacer ton compte, le bouton Supprimer mon compte suffit.",
      en: "To erase your account, the Delete my account button is enough.",
    },
    chips: ["deleteAccount"],
  },
  {
    page: LegalPage,
    id: "legal-report",
    index: 0,
    words: {
      fr: `Un dessin illicite ? Clique Signaler dans l'Inspection, ou écris à ${CONTACT_ADDRESS}.`,
      en: `An illegal drawing? Click Report in Inspection, or write to ${CONTACT_ADDRESS}.`,
    },
    chips: ["report", "inspection"],
  },
];

describe("les phrases qui citent un élément d'interface (JOURNAL 2026-11-04)", () => {
  // Chaque phrase est celle du texte validé, dans chaque langue, le nom de chaque pastille inclus
  it("writes the 9 sentences of the validated text, in French and in English", () => {
    for (const { page, id, index, words } of WRITTEN)
      for (const locale of LOCALES)
        expect(textOf(paragraphOf(render(page, locale), id, index))).toBe(words[locale]);
  });

  // Les pastilles de la phrase : dans l'ordre, avec le nom, l'icône et la couleur du bouton
  it("draws one chip per element, in order, with the name, the icon and the color of the button", () => {
    for (const { page, id, index, chips } of WRITTEN)
      for (const locale of LOCALES) {
        const written = chipsOf(paragraphOf(render(page, locale), id, index));
        const expected = chips.map((name) => sentenceChips(locale)[name]);

        expect(written.map(({ label }) => label)).toEqual(expected.map(({ label }) => label));
        expect(written.map(({ hasIcon }) => hasIcon)).toEqual(expected.map(({ icon }) => icon !== undefined));
        expect(written.map(({ className }) => className)).toEqual(
          expected.map(({ tone }) => (tone ? `lp-chip lp-chip--${tone}` : "lp-chip")),
        );
      }
  });

  // Une pastille n'est ni un lien ni un bouton ; le lien de l'adresse reste un `mailto:` dans la même phrase
  it("keeps chips apart from links: no link, no button, no focus inside a chip, and the address stays a link", () => {
    for (const { page, id, index } of WRITTEN)
      for (const locale of LOCALES) {
        const paragraph = paragraphOf(render(page, locale), id, index);
        const insideChips = chipsOf(paragraph)
          .map(({ label }) => label)
          .join("");

        expect(paragraph).not.toMatch(/<span class="lp-chip[^"]*">(?:(?!<\/span>).)*<(?:a|button)\b/s);
        expect(paragraph).not.toMatch(/tabindex|role="button"/);
        expect(insideChips).not.toContain("@");
      }
    for (const locale of LOCALES)
      expect(paragraphOf(render(LegalPage, locale), "legal-report", 0)).toContain(
        `<a class="lp-window-link" href="mailto:${CONTACT_ADDRESS}">${CONTACT_ADDRESS}</a>.`,
      );
  });

  // Les autres phrases ne changent pas : une page n'a de pastille que dans ces phrases
  it("draws chips in these sentences only: 6 on the privacy page and 2 on the legal notice", () => {
    for (const locale of LOCALES) {
      expect(render(PrivacyPage, locale).match(/<span class="lp-chip/g)).toHaveLength(6);
      expect(render(LegalPage, locale).match(/<span class="lp-chip/g)).toHaveLength(2);
    }
  });
});

const SECTIONS = {
  privacy: (locale: TestLocale): readonly DocumentSection[] => privacySections(PRIVACY_TEXTS[locale]),
  legal: (locale: TestLocale): readonly DocumentSection[] => legalSections(LEGAL_TEXTS[locale]),
};

const partsOf = (sentence: Sentence) => (typeof sentence === "string" ? [] : sentence);

describe("la forme d'une phrase (JOURNAL 2026-11-04)", () => {
  // Une seule façon de composer une phrase : un texte seul, ou une liste de morceaux ; plus de { before, link, after }
  it("is a text alone or a list of parts, never an object with words before and after", () => {
    for (const sections of Object.values(SECTIONS))
      for (const locale of LOCALES)
        for (const { sentences } of sections(locale))
          for (const sentence of sentences) {
            expect(typeof sentence === "string" || Array.isArray(sentence)).toBe(true);
            for (const part of partsOf(sentence))
              expect(typeof part === "string" || "link" in part || "chip" in part).toBe(true);
          }
  });

  // Chaque langue dit les mêmes liens et les mêmes pastilles, aux mêmes endroits de la même phrase
  it("holds the same links and chips in both languages, in the same sentences and the same order", () => {
    const referencesOf = (sentence: Sentence) => partsOf(sentence).filter((part) => typeof part !== "string");

    for (const sections of Object.values(SECTIONS)) {
      const french = sections("fr");
      const english = sections("en");

      for (const [sectionIndex, section] of french.entries())
        for (const [index, sentence] of section.sentences.entries())
          expect(referencesOf(english[sectionIndex]?.sentences[index] ?? "")).toEqual(referencesOf(sentence));
    }
  });

  // Les morceaux d'une phrase sont distincts : l'un nomme l'autre en clé, et deux morceaux de même clé se confondraient
  it("never repeats a part inside a sentence", () => {
    for (const sections of Object.values(SECTIONS))
      for (const locale of LOCALES)
        for (const { sentences } of sections(locale))
          for (const sentence of sentences) {
            const parts = partsOf(sentence).map((part) => JSON.stringify(part));
            expect(new Set(parts).size).toBe(parts.length);
          }
  });

  // Le nom d'un élément d'interface n'est jamais écrit en toutes lettres dans un texte : seul son identifiant l'est (`{ chip: "myAccount" }`)
  it("writes the identifier of a chip in the texts, never its name in plain words", () => {
    for (const locale of LOCALES) {
      const names = Object.values(sentenceChips(locale)).map(({ label }) => label);

      for (const sections of Object.values(SECTIONS))
        for (const { sentences } of sections(locale))
          for (const sentence of sentences)
            for (const part of typeof sentence === "string" ? [sentence] : partsOf(sentence))
              if (typeof part === "string") for (const name of names) expect(part).not.toContain(name);
    }
  });
});
