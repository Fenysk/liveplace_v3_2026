import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Route } from "../../routes/mentions-legales";
import { CONTACT_ADDRESS, DOCUMENT_PATHS } from "../document/document-sections";
import { LocaleProvider } from "../locale/use-locale";
import { LEGAL_IDENTITY, PUBLISHER_NAME } from "./legal-identity";
import { LegalPage } from "./legal-page";
import { legalSections } from "./legal-sections";
import { LEGAL_TEXTS } from "./legal-texts";

const LOCALES = ["fr", "en"] as const;

const titleFor = async (locale: "fr" | "en") => {
  const head = await Route.options.head?.({
    matches: [{ loaderData: { betaLabel: null, locale } }],
  } as never);
  return head?.meta?.find((tag) => tag && "title" in tag)?.title;
};

const inLocale = (locale: "fr" | "en"): string =>
  renderToStaticMarkup(createElement(LocaleProvider, { initial: locale }, createElement(LegalPage)));

// Le texte d'une zone de HTML : sans balises, l'apostrophe de React lue, les espaces insécables de la typographie française en espaces
const textOf = (html: string): string =>
  html
    .replace(/<[^>]*>/g, "")
    .replaceAll("&#x27;", "'")
    .replace(/[  ]/g, " ");

const sectionOf = (html: string, id: string): string =>
  new RegExp(`<section id="${id}"[^>]*>(.*?)</section>`, "s").exec(html)?.[1] ?? "";

const paragraphsOf = (html: string): string[] =>
  [...html.matchAll(/<p [^>]*>(.*?)<\/p>/gs)].map(([, paragraph]) => textOf(paragraph ?? ""));

describe("la route /mentions-legales", () => {
  // Le serveur écrit le titre de l'onglet dans la langue que la racine a rendue
  it("writes the title of the tab in the language the root rendered", async () => {
    expect(await titleFor("fr")).toBe("Mentions légales · LivePlace");
    expect(await titleFor("en")).toBe("Legal notice · LivePlace");
  });

  // Passe avant `/{login}`, comme `/confidentialite` : l'adresse est un fichier de routes à part, comme les autres pages du site
  it("is a route of its own, written in the route tree", () => {
    const tree = readFileSync(join(import.meta.dirname, "..", "..", "app", "routeTree.gen.ts"), "utf8");

    expect(tree).toContain("path: '/mentions-legales'");
    expect(DOCUMENT_PATHS.legal).toBe("/mentions-legales");
  });

  // Non indexée, comme `/confidentialite` : ni le plan du site ni les règles des robots ne la nomment
  it("is kept out of the sitemap and the robots rules, like /confidentialite", () => {
    const sitemap = readFileSync(join(import.meta.dirname, "..", "sitemap", "sitemap-xml.ts"), "utf8");
    const robots = readFileSync(join(import.meta.dirname, "..", "robots", "robots-txt.ts"), "utf8");

    expect(sitemap).not.toContain("mentions-legales");
    expect(robots).not.toContain("mentions-legales");
  });
});

describe("la page Mentions légales (CDC des textes du 2026-11-04)", () => {
  const TITLES = {
    fr: [
      "L'éditeur",
      "Le directeur de la publication",
      "L'hébergeur",
      "Le stockage des données",
      "Signaler un contenu",
      "Tes données",
    ],
    en: ["Publisher", "Publication director", "Host", "Data storage", "Report content", "Your data"],
  };

  // Les 6 sections du texte validé, dans son ordre, dans chaque langue
  it("writes the 6 sections in the order of the text, in both languages", () => {
    for (const locale of LOCALES) {
      expect(legalSections(LEGAL_TEXTS[locale]).map(({ title }) => title)).toEqual(TITLES[locale]);
      expect(inLocale(locale).match(/<h2 /g)).toHaveLength(6);
    }
  });

  // Le même en-tête que la politique, sans les deux lignes de la carte : le titre, puis les sections
  it("opens with the title and the sections, with no header line in the card", () => {
    for (const locale of LOCALES) {
      expect(inLocale(locale)).not.toContain("lp-doc-intro");
    }
  });

  // L'éditeur : son pseudo, son SIRET, son Discord, puis l'adresse de contact en lien ; tout vient d'un seul fichier
  it("says the publisher with his identity from one file, and the contact address as a mailto link", () => {
    const french = sectionOf(inLocale("fr"), "legal-publisher");
    const english = sectionOf(inLocale("en"), "legal-publisher");

    expect(paragraphsOf(french)).toEqual([
      `LivePlace est édité par ${PUBLISHER_NAME}, entrepreneur individuel.`,
      `SIRET : ${LEGAL_IDENTITY.siret}.`,
      `Discord : ${LEGAL_IDENTITY.discord}.`,
      `E-mail : ${CONTACT_ADDRESS}.`,
    ]);
    expect(paragraphsOf(english)).toEqual([
      `LivePlace is published by ${PUBLISHER_NAME}, sole proprietor (entrepreneur individuel).`,
      `SIRET: ${LEGAL_IDENTITY.siret}.`,
      `Discord: ${LEGAL_IDENTITY.discord}.`,
      `Email: ${CONTACT_ADDRESS}.`,
    ]);
    for (const html of [french, english]) {
      expect(html).toContain(
        `<a class="lp-window-link" href="mailto:${CONTACT_ADDRESS}">${CONTACT_ADDRESS}</a>.</p>`,
      );
    }
  });

  // Le directeur de la publication est l'éditeur
  it("names the publication director, the publisher", () => {
    for (const locale of LOCALES) {
      expect(paragraphsOf(sectionOf(inLocale(locale), "legal-director"))).toEqual([`${PUBLISHER_NAME}.`]);
    }
  });

  // L'hébergeur et le stockage : les mêmes adresses dans les deux langues, seuls les pays se traduisent
  it("says the host and the data storage with their postal addresses, the same in both languages", () => {
    expect(paragraphsOf(sectionOf(inLocale("fr"), "legal-host"))).toEqual([
      "Contabo GmbH, Welfenstraße 22, 81541 Munich, Allemagne.",
      `Email : ${LEGAL_IDENTITY.hostEmail}.`,
    ]);
    expect(paragraphsOf(sectionOf(inLocale("en"), "legal-host"))).toEqual([
      "Contabo GmbH, Welfenstraße 22, 81541 Munich, Germany.",
      `Email: ${LEGAL_IDENTITY.hostEmail}.`,
    ]);
    expect(paragraphsOf(sectionOf(inLocale("fr"), "legal-storage"))).toEqual([
      "Convex, Inc., 444 De Haro Street, Suite 218, San Francisco, CA 94107, États-Unis.",
      "Les données sont stockées en Irlande.",
    ]);
    expect(paragraphsOf(sectionOf(inLocale("en"), "legal-storage"))).toEqual([
      "Convex, Inc., 444 De Haro Street, Suite 218, San Francisco, CA 94107, United States.",
      "Data is stored in Ireland.",
    ]);
  });

  // Signaler un contenu : Signaler dans l'Inspection (deux pastilles), ou l'adresse de contact en lien
  it("says how to report content, with two chips and the contact address as a link", () => {
    expect(paragraphsOf(sectionOf(inLocale("fr"), "legal-report"))).toEqual([
      `Un dessin illicite ? Clique Signaler dans l'Inspection, ou écris à ${CONTACT_ADDRESS}.`,
    ]);
    expect(paragraphsOf(sectionOf(inLocale("en"), "legal-report"))).toEqual([
      `An illegal drawing? Click Report in Inspection, or write to ${CONTACT_ADDRESS}.`,
    ]);
    for (const locale of LOCALES)
      expect(sectionOf(inLocale(locale), "legal-report").match(/<span class="lp-chip/g)).toHaveLength(2);
  });

  // Tes données : la phrase mène à la politique de confidentialité
  it("ends the sentences with a link to the privacy policy", () => {
    const french = sectionOf(inLocale("fr"), "legal-data");
    const english = sectionOf(inLocale("en"), "legal-data");

    expect(french).toContain(
      `Ce que LivePlace fait de tes données : <a class="lp-window-link" href="/confidentialite">la politique de confidentialité</a>.`,
    );
    expect(english).toContain(
      'What LivePlace does with your data: <a class="lp-window-link" href="/confidentialite">the privacy policy</a>.',
    );
  });

  // Au bas de la page, sous la carte, un lien vers la politique, dans la langue du visiteur
  it("ends the page with a discreet link to the privacy policy, under the card", () => {
    for (const [locale, label] of [
      ["fr", "Confidentialité"],
      ["en", "Privacy"],
    ] as const) {
      const html = inLocale(locale);
      const note = `<p class="lp-sign-in-note lp-type-caption lp-muted"><a href="/confidentialite">${label}</a></p>`;

      expect(html).toContain(note);
      expect(html.indexOf(note)).toBeGreaterThan(html.lastIndexOf("</section>"));
    }
  });

  // Même identité dans les deux langues : le contact LivePlace n'est pas dans les textes (lien) ; Discord et Contabo y sont
  it("holds the same address and identity in both languages, with no address in the texts", () => {
    const texts = JSON.stringify(LEGAL_TEXTS)
      .replaceAll(LEGAL_IDENTITY.hostEmail, "")
      .replaceAll(LEGAL_IDENTITY.discord, "");
    expect(texts.includes(CONTACT_ADDRESS)).toBe(false);
    expect(texts.includes("@")).toBe(false);
    for (const value of Object.values(LEGAL_IDENTITY)) {
      expect(textOf(inLocale("fr")) + textOf(inLocale("en"))).toContain(value);
    }
    expect(textOf(inLocale("fr")).split(LEGAL_IDENTITY.discord)).toHaveLength(2);
    expect(textOf(inLocale("en")).split(LEGAL_IDENTITY.discord)).toHaveLength(2);
  });
});

describe("les coordonnées d'Alexis (legal-identity.ts)", () => {
  // Pseudo, Discord, SIRET et email Contabo : les quatre valeurs, plus aucun crochet
  it("holds the four values of the public identity", () => {
    expect(LEGAL_IDENTITY).toEqual({
      name: "Fenysk",
      discord: "@Fenysk",
      siret: "902747252",
      hostEmail: "info@contabo.com",
    });
    expect(PUBLISHER_NAME).toBe(LEGAL_IDENTITY.name);
  });

  // Discord, SIRET et Contabo n'existent que là ; le pseudo Fenysk est déjà le nom Twitch ailleurs dans l'interface
  it("is the only file of the interface that writes a value of the identity", () => {
    const root = join(import.meta.dirname, "..");
    const sources = readdirSync(root, { recursive: true, encoding: "utf8" })
      .filter(
        (file) => /\.tsx?$/.test(file) && !/\.test\.ts$/.test(file) && !file.endsWith("legal-identity.ts"),
      )
      .map((file) => readFileSync(join(root, file), "utf8"));
    for (const [key, value] of Object.entries(LEGAL_IDENTITY)) {
      if (key === "name") continue;
      expect(sources.filter((source) => source.includes(value))).toEqual([]);
    }
  });
});

describe("la page Mentions légales a la mise en page de la politique (document-page.tsx)", () => {
  const WORDMARK = '<a class="lp-type-display lp-wordmark" href="/">LivePlace</a>';

  // Le même en-tête que l'accueil : « LivePlace » en premier lien, vers l'accueil, avant le titre, et aucun `style` écrit par le serveur
  it("writes the header of the home page, with LivePlace first and no inline style", () => {
    for (const locale of LOCALES) {
      const html = inLocale(locale);

      expect(html).toContain(
        '<main class="lp-home-page"><div class="lp-void" aria-hidden="true"></div><div class="lp-home">',
      );
      expect(html).toContain(`<div class="lp-home-header">${WORDMARK}<div class="lp-home-settings">`);
      expect(html.indexOf("<a ")).toBe(html.indexOf(WORDMARK));
      expect(html).not.toMatch(/\sstyle=/);
    }
  });

  // Le titre en grand, puis la carte, et le sommaire avant le titre : une entrée par section, vers son ancre
  it("writes the title as a display h1, then the card, with one contents link per section", () => {
    for (const locale of LOCALES) {
      const html = inLocale(locale);
      const sections = legalSections(LEGAL_TEXTS[locale]);

      expect(html).toMatch(/<h1 class="lp-type-display">[^<]+<\/h1><div class="lp-pill lp-doc-card">/);
      expect(html.indexOf("<nav")).toBeLessThan(html.indexOf("<h1"));
      expect(html.match(/<section /g)).toHaveLength(sections.length);
      for (const section of sections) {
        expect(html).toContain(`<a class="lp-doc-link lp-type-body" href="#${section.id}"`);
        expect(html).toContain(`<section id="${section.id}" aria-labelledby="${section.id}-title"`);
      }
      expect(html).toContain(
        'class="lp-doc-link lp-type-body" href="#legal-publisher" aria-current="location"',
      );
      expect(html.match(/aria-current=/g)).toHaveLength(1);
    }
  });

  // Le repère du bas est la dernière chose du document
  it("ends the document with the hidden marker of the contents", () => {
    for (const locale of LOCALES) {
      const html = inLocale(locale);
      const marker = '<div id="document-end" class="lp-doc-end" aria-hidden="true"></div>';

      expect(html.indexOf(marker) + marker.length + "</div></div></main>".length).toBe(html.length);
    }
  });

  // La route lie les deux feuilles, comme celle de la politique : l'accueil pour la page, document.css pour les colonnes
  it("links the stylesheet of the home page and the one of the documents from the route", async () => {
    const head = await Route.options.head?.({
      matches: [{ loaderData: { betaLabel: null, locale: "fr" } }],
    } as never);
    const sheets = (head?.links ?? []).filter((link) => link?.rel === "stylesheet");
    const route = readFileSync(
      join(import.meta.dirname, "..", "..", "routes", "mentions-legales.tsx"),
      "utf8",
    );

    expect(sheets).toHaveLength(2);
    expect(route.indexOf("href: homeCss")).toBeLessThan(route.indexOf("href: documentCss"));
    expect(route).toContain('import documentCss from "../ui/document/document.css?url";');
  });
});
