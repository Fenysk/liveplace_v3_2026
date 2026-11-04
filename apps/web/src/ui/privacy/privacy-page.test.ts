import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Route } from "../../routes/confidentialite";
import {
  CONTACT_ADDRESS,
  DOCUMENT_END_ID,
  DOCUMENT_PATHS,
  type Sentence,
} from "../document/document-sections";
import { DOCUMENT_TEXTS } from "../document/document-texts";
import { PUBLISHER_NAME } from "../legal/legal-identity";
import { LocaleProvider } from "../locale/use-locale";
import { formatPrivacyDate, PRIVACY_UPDATED_ON } from "./privacy-date";
import { PrivacyPage } from "./privacy-page";
import { privacySections } from "./privacy-sections";
import { PRIVACY_TEXTS } from "./privacy-texts";

const LOCALES = ["fr", "en"] as const;

const titleFor = async (locale: "fr" | "en") => {
  const head = await Route.options.head?.({
    matches: [{ loaderData: { betaLabel: null, locale } }],
  } as never);
  return head?.meta?.find((tag) => tag && "title" in tag)?.title;
};

const inLocale = (locale: "fr" | "en"): string =>
  renderToStaticMarkup(createElement(LocaleProvider, { initial: locale }, createElement(PrivacyPage)));

// Le texte d'une zone de HTML : sans balises, l'apostrophe de React lue, les espaces insécables de la typographie française en espaces
const textOf = (html: string): string =>
  html
    .replace(/<[^>]*>/g, "")
    .replaceAll("&#x27;", "'")
    .replace(/[  ]/g, " ");

// Le HTML d'une section, depuis son identifiant
const sectionOf = (html: string, id: string): string =>
  new RegExp(`<section id="${id}"[^>]*>(.*?)</section>`, "s").exec(html)?.[1] ?? "";

const paragraphsOf = (html: string): string[] =>
  [...html.matchAll(/<p [^>]*>(.*?)<\/p>/gs)].map(([, paragraph]) => textOf(paragraph ?? ""));

const linksOf = (html: string): string[] => [...html.matchAll(/<a [^>]*>/g)].map(([link]) => link);

// Les liens d'une langue, dans l'ordre des phrases de toute la page
const linkNamesOf = (locale: "fr" | "en"): string[] =>
  privacySections(PRIVACY_TEXTS[locale]).flatMap(({ sentences }) =>
    sentences.flatMap((sentence: Sentence) =>
      typeof sentence === "string"
        ? []
        : sentence.flatMap((part) => (typeof part !== "string" && "link" in part ? [part.link] : [])),
    ),
  );

// Les mots d'une phrase, entre ses liens et ses pastilles
const wordsOf = (sentence: Sentence): string[] =>
  (typeof sentence === "string" ? [sentence] : sentence)
    .map((part) => (typeof part === "string" ? part : "\u0000"))
    .join("")
    .split("\u0000")
    .map((words) => words.replace(/[  ]/g, " "));

describe("la page Confidentialité dans les deux langues (§9.9)", () => {
  // Quand le serveur rend la page, le titre de l'onglet est écrit dans la langue que la racine a rendue
  it("writes the title of the tab in the language the root rendered", async () => {
    expect(await titleFor("fr")).toBe("Confidentialité · LivePlace");
    expect(await titleFor("en")).toBe("Privacy · LivePlace");
  });

  // Le titre de la page suit la langue
  it("writes the title of the page in the language of the visitor", () => {
    expect(inLocale("fr")).toContain("Politique de confidentialité");
    expect(inLocale("en")).toContain("Privacy policy");
  });

  // La ligne en plaisanterie a disparu : la page est écrite
  it("no longer says the policy is not written yet", () => {
    for (const locale of LOCALES) {
      expect(inLocale(locale)).not.toMatch(/tellement|so private|pas encore écrite|haven&#x27;t even/);
    }
    expect(Object.keys(PRIVACY_TEXTS.fr)).not.toContain("underConstruction");
  });
});

describe("l'en-tête de la page Confidentialité (CDC des textes du 2026-11-04)", () => {
  // Sous le titre, avant la première section : ce que la page contient, puis sa date, dans la langue du visiteur
  it("says what the page holds and when it was updated, under the title, before the first section", () => {
    const french = textOf(inLocale("fr"));
    const english = textOf(inLocale("en"));

    expect(french).toContain("Ce que LivePlace garde sur toi, pourquoi, et combien de temps.");
    expect(french).toContain("Mise à jour le 4 novembre 2026.");
    expect(english).toContain("What LivePlace keeps about you, why, and for how long.");
    expect(english).toContain("Updated on November 4, 2026.");
    for (const html of [inLocale("fr"), inLocale("en")]) {
      expect(html.indexOf("lp-doc-intro")).toBeGreaterThan(html.indexOf("<h1"));
      expect(html.indexOf("lp-doc-intro")).toBeLessThan(html.indexOf("<section"));
      expect(html.match(/<div class="lp-doc-intro">(?:<p [^>]*>[^<]*<\/p>){2}<\/div>/)).not.toBeNull();
    }
  });

  // La date vient d'une constante, formatée selon la langue, et se change à la mise en prod
  it("takes the date from one constant, written the way each language writes a date", () => {
    expect(PRIVACY_UPDATED_ON).toBe("2026-11-04");
    expect(formatPrivacyDate("fr")).toBe("4 novembre 2026");
    expect(formatPrivacyDate("en")).toBe("November 4, 2026");
    expect(PRIVACY_TEXTS.fr.updated("1er mars 2027")).toBe("Mise à jour le 1er mars 2027.");
    expect(PRIVACY_TEXTS.en.updated("March 1, 2027")).toBe("Updated on March 1, 2027.");
  });
});

describe("les 14 sections de la page Confidentialité (CDC des textes du 2026-11-04)", () => {
  const TITLES = {
    fr: [
      "Qui s'en occupe",
      "Ton compte",
      "Si tu es streamer",
      "Tes dessins",
      "La modération",
      "Les sauvegardes",
      "Supprimer ton compte",
      "Tes dons",
      "La mesure d'audience",
      "Ton navigateur",
      "Les journaux et ton adresse IP",
      "Les services qui nous aident",
      "Pourquoi on a le droit",
      "Tes droits",
    ],
    en: [
      "Who is in charge",
      "Your account",
      "If you are a streamer",
      "Your drawings",
      "Moderation",
      "Backups",
      "Delete your account",
      "Your donations",
      "Audience measurement",
      "Your browser",
      "Logs and your IP address",
      "The services that help us",
      "Why we are allowed to",
      "Your rights",
    ],
  };

  // Les sections sont celles du texte validé, dans son ordre, dans chaque langue : le sommaire les suit seul
  it("writes the 14 sections in the order of the text, in both languages", () => {
    for (const locale of LOCALES) {
      const sections = privacySections(PRIVACY_TEXTS[locale]);

      expect(sections.map(({ title }) => title)).toEqual(TITLES[locale]);
      expect(inLocale(locale).match(/<h2 /g)).toHaveLength(14);
    }
  });

  // Chaque langue dit les mêmes phrases : autant par section, et les liens aux mêmes endroits, vers les mêmes pages
  it("holds the same number of sentences in both languages, with the same links in the same places", () => {
    const french = privacySections(PRIVACY_TEXTS.fr);
    const english = privacySections(PRIVACY_TEXTS.en);

    for (const [index, section] of french.entries()) {
      expect(english[index]?.id).toBe(section.id);
      expect(english[index]?.sentences).toHaveLength(section.sentences.length);
    }
    expect(linkNamesOf("fr")).toEqual(linkNamesOf("en"));
    expect(french.flatMap(({ sentences }) => sentences)).toHaveLength(56);
  });

  // Une phrase par paragraphe, du texte validé : les phrases de chaque section sont écrites, dans l'ordre, sans une de plus
  it("writes each sentence in its own paragraph, in order, and nothing else", () => {
    for (const locale of LOCALES) {
      const html = inLocale(locale);

      for (const section of privacySections(PRIVACY_TEXTS[locale])) {
        const written = paragraphsOf(sectionOf(html, section.id));

        expect(written).toHaveLength(section.sentences.length);
        for (const [index, sentence] of section.sentences.entries()) {
          const words = wordsOf(sentence);
          expect(written[index]?.startsWith(words[0] ?? "")).toBe(true);
          expect(written[index]?.endsWith(words.at(-1) ?? "")).toBe(true);
        }
      }
    }
  });

  // « Qui s'en occupe » : l'éditeur (ses coordonnées viennent d'un seul fichier), l'adresse de contact, puis les mentions légales
  it("says who is in charge: the publisher, the contact address, and a link to the legal notice", () => {
    const french = sectionOf(inLocale("fr"), "privacy-who");
    const english = sectionOf(inLocale("en"), "privacy-who");

    expect(textOf(french)).toContain(
      `LivePlace est édité par ${PUBLISHER_NAME}, qui décide de ce qu'on fait de tes données.`,
    );
    expect(textOf(english)).toContain(
      `LivePlace is published by ${PUBLISHER_NAME}, who decides what is done with your data.`,
    );
    expect(textOf(french)).toContain(`Pour toute question, écris à ${CONTACT_ADDRESS}.`);
    expect(textOf(french)).toContain("Ses coordonnées complètes sont dans les mentions légales.");
    expect(textOf(english)).toContain("Full contact details are in the legal notice.");
    expect(french).toContain(
      `<a class="lp-window-link" href="${DOCUMENT_PATHS.legal}">les mentions légales</a>.`,
    );
    expect(english).toContain(
      `<a class="lp-window-link" href="${DOCUMENT_PATHS.legal}">the legal notice</a>.`,
    );
  });

  // Les nouvelles phrases de Supprimer ton compte arrivent entre les trois d'avant et la ligne de contact, qui reste la dernière
  it("adds the proof of the erasure and the session fingerprint to the deletion, before the contact line", () => {
    const french = paragraphsOf(sectionOf(inLocale("fr"), "privacy-delete-account"));
    const english = paragraphsOf(sectionOf(inLocale("en"), "privacy-delete-account"));

    expect(french).toEqual([
      "Connecte-toi, ouvre Mon compte, clique Supprimer mon compte.",
      "Un compte sans connexion depuis 2 ans est supprimé de la même façon.",
      "Ton compte sort aussi de nos sauvegardes, en 24 heures au plus.",
      "On garde seulement la preuve de l'effacement, 5 ans : sa date et ce qui l'a lancé, sans ton nom ni ton ID.",
      "Pendant 31 jours, on garde une empreinte de ta session, qui ne mène pas à toi, pour refuser une ancienne connexion.",
      `Tu ne peux pas te connecter ? Écris à ${CONTACT_ADDRESS}.`,
    ]);
    expect(english).toEqual([
      "Sign in, open My account, click Delete my account.",
      "An account with no sign-in for 2 years is deleted the same way.",
      "Your account also leaves our backups, within 24 hours at most.",
      "We keep only the proof of the erasure, for 5 years: its date and what started it, without your name or your ID.",
      "For 31 days, we keep a fingerprint of your session, which does not lead back to you, to refuse an old sign-in.",
      `Can't sign in? Write to ${CONTACT_ADDRESS}.`,
    ]);
  });

  // Les dons : les quatre phrases d'avant à leur place, la durée de douze mois entre la deuxième et le message, la ligne de contact à la fin
  it("adds the twelve months and the contact line to the donations, among the four sentences already online", () => {
    const french = paragraphsOf(sectionOf(inLocale("fr"), "privacy-donations"));
    const english = paragraphsOf(sectionOf(inLocale("en"), "privacy-donations"));

    expect(french).toEqual([
      "Pour un don sur Ko-fi, on garde le montant et la date : ils donnent le titre et la durée de ton badge Soutien.",
      "On garde l'e-mail et le nom Ko-fi seulement tant que le don n'est pas relié à un compte, puis on les efface.",
      "Un don qui n'est relié à aucun compte au bout de 12 mois est effacé en entier.",
      "On ne garde jamais ton message.",
      "Supprimer ton compte efface tes dons.",
      `Tu as donné sans compte LivePlace ? Écris à ${CONTACT_ADDRESS} pour faire effacer ton don.`,
    ]);
    expect(english).toEqual([
      "For a Ko-fi donation, we keep the amount and the date: they set the title and the length of your Supporter badge.",
      "We keep the Ko-fi email and name only until the donation is linked to an account, then we erase them.",
      "A donation not linked to any account after 12 months is erased entirely.",
      "We never keep your message.",
      "Deleting your account erases your donations.",
      `Donated without a LivePlace account? Write to ${CONTACT_ADDRESS} to have your donation erased.`,
    ]);
  });

  // Les cookies : les trois, avec leur durée, sans les apostrophes inverses du texte du vault
  it("names the three cookies with their length of life", () => {
    const french = textOf(sectionOf(inLocale("fr"), "privacy-browser"));
    const english = textOf(sectionOf(inLocale("en"), "privacy-browser"));

    expect(french).toContain(
      "On pose 3 cookies, tous nécessaires au site : lp_session, ta connexion, 30 jours ; lp_oauth, la connexion en cours, 10 minutes ; lp_locale, ta langue, 1 an.",
    );
    expect(english).toContain(
      "We set 3 cookies, all needed by the site: lp_session, your sign-in, 30 days; lp_oauth, the sign-in in progress, 10 minutes; lp_locale, your language, 1 year.",
    );
    expect(french + english).not.toContain("`");
  });

  // Les journaux : la durée du système (6 mois) est séparée de celle du site (à chaque mise à jour, ou plus tôt à la taille limite)
  it("separates the logs of the system, kept 6 months, from the logs of the site, erased at each update", () => {
    const french = paragraphsOf(sectionOf(inLocale("fr"), "privacy-logs"));
    const english = paragraphsOf(sectionOf(inLocale("en"), "privacy-logs"));

    expect(french).toEqual([
      "Nos serveurs ne gardent pas ton adresse IP.",
      "Leurs journaux techniques servent à réparer une panne.",
      "Ceux du système sont effacés au bout de 6 mois au plus ; ceux du site, à chaque mise à jour du site, ou plus tôt quand ils dépassent leur taille.",
    ]);
    expect(english).toEqual([
      "Our servers do not keep your IP address.",
      "Their technical logs are used to fix outages.",
      "System logs are erased after 6 months at most; the site's logs, at each update of the site, or sooner when they exceed their size.",
    ]);
  });

  // Tes droits : l'adresse en mailto, puis la CNIL, hors de LivePlace, dans un nouvel onglet
  it("ends with the rights: the contact address as a mailto link, then the CNIL in a new tab", () => {
    for (const locale of LOCALES) {
      const html = sectionOf(inLocale(locale), "privacy-rights");
      const [mail, cnil, ...others] = linksOf(html);

      expect(mail).toBe(`<a class="lp-window-link" href="mailto:${CONTACT_ADDRESS}">`);
      expect(cnil).toBe(
        '<a class="lp-window-link" href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer">',
      );
      expect(others).toEqual([]);
      expect(html).toContain(">cnil.fr</a>.</p>");
    }
    expect(textOf(sectionOf(inLocale("fr"), "privacy-rights"))).toContain(
      `Pour le reste, écris à ${CONTACT_ADDRESS} : on répond en un mois au plus. On garde ces e-mails 1 an après la réponse.`,
    );
  });
});

describe("les liens de la page Confidentialité", () => {
  // L'adresse est toujours un lien `mailto:` dont le texte est l'adresse, et le point final reste hors du lien
  it("writes the contact address as a mailto link whose text is the address, with the full stop outside of it", () => {
    const link = `<a class="lp-window-link" href="mailto:${CONTACT_ADDRESS}">${CONTACT_ADDRESS}</a>`;

    expect(sectionOf(inLocale("fr"), "privacy-delete-account")).toMatch(
      new RegExp(`<p class="lp-type-body">Tu ne peux pas te connecter \\? Écris à ${link}\\.</p>$`),
    );
    expect(sectionOf(inLocale("en"), "privacy-delete-account")).toMatch(
      new RegExp(`<p class="lp-type-body">Can&#x27;t sign in\\? Write to ${link}\\.</p>$`),
    );
  });

  // Un lien dans une phrase est le lien du texte de la fenêtre, et seul celui de la CNIL quitte LivePlace
  it("opens a new tab only for the link that leaves LivePlace", () => {
    for (const locale of LOCALES) {
      const links = linksOf(inLocale(locale)).filter((link) => link.includes("lp-window-link"));

      expect(links.filter((link) => link.includes("_blank"))).toHaveLength(1);
      expect(links.filter((link) => link.includes("noopener noreferrer"))).toHaveLength(1);
      expect(links).toHaveLength(linkNamesOf(locale).length);
    }
  });

  // L'adresse n'est pas traduite : elle vit une seule fois dans le code, hors des textes
  it("holds no address in the texts: it lives once in the code", () => {
    expect(JSON.stringify(PRIVACY_TEXTS).includes("@")).toBe(false);
    expect(JSON.stringify(PRIVACY_TEXTS).includes("cnil.fr")).toBe(false);
  });

  // Au bas de la page, sous la carte, un lien vers les mentions légales, dans la langue du visiteur, avant le repère de fin
  it("ends the page with a discreet link to the legal notice, under the card", () => {
    for (const [locale, label] of [
      ["fr", "Mentions légales"],
      ["en", "Legal notice"],
    ] as const) {
      const html = inLocale(locale);
      const note = `<p class="lp-sign-in-note lp-type-caption lp-muted"><a href="${DOCUMENT_PATHS.legal}">${label}</a></p>`;

      expect(html).toContain(note);
      expect(html.indexOf(note)).toBeGreaterThan(html.lastIndexOf("</section>"));
      expect(html.indexOf(note)).toBeLessThan(html.indexOf("document-end"));
      expect(html.match(/href="\/mentions-legales"/g)).toHaveLength(2);
    }
  });
});

const WORDMARK = '<a class="lp-type-display lp-wordmark" href="/">LivePlace</a>';

describe("la page Confidentialité ramène à l'accueil (§9.10)", () => {
  // Quand le visiteur arrive sur la page, « LivePlace » est le premier lien, vers l'accueil, avant le titre, dans les deux langues
  it("writes LivePlace first, as a link to the home page, in both languages", () => {
    for (const locale of LOCALES) {
      const html = inLocale(locale);

      expect(html).toContain(WORDMARK);
      expect(html.indexOf("LivePlace</a>")).toBeLessThan(html.indexOf("<h1"));
      expect(html.indexOf("<a ")).toBe(html.indexOf(WORDMARK));
    }
  });

  // Le mot est du texte seul, et le serveur n'écrit aucun `style` : la CSP de production le bloquerait
  it("carries no shape next to the name and no inline style", () => {
    for (const locale of LOCALES) {
      const html = inLocale(locale);

      expect(html).not.toMatch(/\sstyle=/);
      expect(html).toContain(WORDMARK);
    }
  });

  // Le mot-symbole n'est pas traduit, c'est le nom ; aucun mot d'accueil ou de retour n'est ajouté
  it("keeps the name of the product as it is, and adds no word of return", () => {
    expect(inLocale("fr")).toContain("Politique de confidentialité");
    expect(inLocale("en")).toContain("Privacy policy");
    expect(inLocale("fr")).not.toMatch(/Accueil|Retour/);
  });

  // Le mot garde sa place d'une page à l'autre : c'est l'en-tête de l'accueil, ses marges et son bloc de 1600 px (home.css), sans les redire
  it("writes the header of the home page, so the name stays where the home page puts it", () => {
    const documentCss = readFileSync(join(import.meta.dirname, "..", "document", "document.css"), "utf8");
    const homeCss = readFileSync(join(import.meta.dirname, "..", "home", "home.css"), "utf8");
    const html = inLocale("fr");

    expect(html).toContain(
      '<main class="lp-home-page"><div class="lp-void" aria-hidden="true"></div><div class="lp-home">',
    );
    expect(html).toContain(`<div class="lp-home-header">${WORDMARK}<div class="lp-home-settings">`);
    expect(homeCss).toContain("max-width: 1600px;");
    expect(documentCss).not.toMatch(/clamp\(24px, 2\.5vw, 40px\)|1600px/);
  });

  // La route lie les deux feuilles : home.css pour la page et son en-tête, document.css pour les deux colonnes
  it("links the stylesheet of the home page and the one of the documents from the route", async () => {
    const head = await Route.options.head?.({
      matches: [{ loaderData: { betaLabel: null, locale: "fr" } }],
    } as never);
    const sheets = (head?.links ?? []).filter((link) => link?.rel === "stylesheet");
    // Vitest rend chaque `?url` vide : l'ordre des deux feuilles se lit dans la route
    const route = readFileSync(
      join(import.meta.dirname, "..", "..", "routes", "confidentialite.tsx"),
      "utf8",
    );

    expect(sheets).toHaveLength(2);
    expect(route).toContain('import homeCss from "../ui/home/home.css?url";');
    expect(route).toContain('import documentCss from "../ui/document/document.css?url";');
    expect(route.indexOf("href: homeCss")).toBeLessThan(route.indexOf("href: documentCss"));
  });
});

describe("la page Confidentialité en deux colonnes, sommaire à gauche (variante A, JOURNAL 2026-11-02)", () => {
  const documentCss = readFileSync(join(import.meta.dirname, "..", "document", "document.css"), "utf8");
  // Ce que la feuille écrit dans un bloc `@container lp-home (min-width: 1100px) { … }`, et hors de lui
  const WIDE = "@container lp-home (min-width: 1100px) {";
  const wideCss = documentCss.slice(documentCss.indexOf(WIDE));
  const narrowCss = documentCss.slice(0, documentCss.indexOf(WIDE));
  const navLinks = (html: string): string[] =>
    [...html.matchAll(/<a [^>]*href="#[^"]*"[^>]*>[^<]*<\/a>/g)].map(([link]) => link);

  // Quand le visiteur ouvre la page, le titre est un h1 de la taille display, puis le contenu est dans une carte (pill)
  it("writes the title as a display h1, then the content in a pill", () => {
    for (const locale of LOCALES) {
      const html = inLocale(locale);

      expect(html).toMatch(/<h1 class="lp-type-display">[^<]+<\/h1><div class="lp-pill lp-doc-card">/);
      expect(html.indexOf("lp-doc-card")).toBeLessThan(html.indexOf("<section"));
    }
  });

  // Le sommaire est une navigation nommée, avant le titre, dans la langue du visiteur
  it("names the contents `Sommaire` or `Contents`, before the title", () => {
    expect(inLocale("fr")).toContain('<nav class="lp-doc-nav" aria-label="Sommaire">');
    expect(inLocale("en")).toContain('<nav class="lp-doc-nav" aria-label="Contents">');
    expect(inLocale("en")).not.toContain("Sommaire");
    expect(inLocale("fr").indexOf("<nav")).toBeLessThan(inLocale("fr").indexOf("<h1"));
    expect(DOCUMENT_TEXTS.fr.contentsLabel).toBe("Sommaire");
    expect(DOCUMENT_TEXTS.en.contentsLabel).toBe("Contents");
  });

  // Une entrée du sommaire par section, depuis la même liste que la page : l'ancre est l'identifiant de la section, le lien dit son titre
  it("links every section from the contents, with the anchor of the section and its title", () => {
    for (const locale of LOCALES) {
      const html = inLocale(locale);
      const sections = privacySections(PRIVACY_TEXTS[locale]);
      const links = navLinks(html).filter((link) => link.includes("lp-doc-link"));

      expect(links).toHaveLength(sections.length);
      expect(html.match(/<section /g)).toHaveLength(sections.length);
      for (const [index, section] of sections.entries()) {
        expect(links[index]).toContain(`href="#${section.id}"`);
        expect(links[index]).toContain(`>${section.title.replaceAll("'", "&#x27;")}</a>`);
        expect(html).toContain(`<section id="${section.id}" aria-labelledby="${section.id}-title"`);
        expect(html).toContain(`<h2 id="${section.id}-title"`);
      }
    }
  });

  // Les identifiants des sections sont distincts : deux sections de même ancre feraient suivre le sommaire à la première
  it("gives each section its own anchor", () => {
    const ids = privacySections(PRIVACY_TEXTS.fr).map(({ id }) => id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^[a-z][a-z0-9-]*$/.test(id))).toBe(true);
  });

  // Au premier rendu (celui du serveur), la première section est la courante : un seul lien porte `aria-current`
  it("marks the first section as the current one, and only it, when the page is written", () => {
    for (const locale of LOCALES) {
      const html = inLocale(locale);

      expect(html.match(/aria-current=/g)).toHaveLength(1);
      expect(html).toContain('class="lp-doc-link lp-type-body" href="#privacy-who" aria-current="location"');
    }
  });

  // Le sommaire est caché sous le seuil de la maquette, et montré, collant, à partir de lui : le téléphone n'a pas de sommaire
  it("shows the contents only from 1100 px of block, sticky, and hides it below", () => {
    expect(narrowCss).toMatch(/\.lp-doc-nav \{\s*display: none;/);
    expect(wideCss).toMatch(/\.lp-doc-nav \{[^}]*display: block;[^}]*position: sticky;/s);
    expect(narrowCss).not.toContain("position: sticky");
    expect(documentCss.match(/@container lp-home/g)).toHaveLength(1);
  });

  // Le seuil est celui de la maquette et il mesure le bloc de l'accueil : home.css le déclare conteneur, sinon la requête ne s'appliquerait jamais
  it("measures the block of the home page, as the mock-up does", () => {
    const homeCss = readFileSync(join(import.meta.dirname, "..", "home", "home.css"), "utf8");

    expect(homeCss).toContain("container: lp-home / inline-size;");
    expect(documentCss).toContain("@container lp-home (min-width: 1100px) {");
  });

  // Deux colonnes : le sommaire sur 240 px, le texte sur 784 px moins les 2 × 32 px de la carte, soit 720 px, centrés
  it("lays out 240 px for the contents and a text of 720 px inside a card of 784 px", () => {
    const columns = /grid-template-columns: (\d+)px (\d+)px;/.exec(wideCss);
    const padding = /\.lp-doc-card \{[^}]*padding: (\d+)px;/s.exec(wideCss);

    expect(columns?.slice(1)).toEqual(["240", "784"]);
    expect(Number(columns?.[2]) - 2 * Number(padding?.[1])).toBe(720);
    expect(wideCss).toMatch(/\.lp-doc \{[^}]*justify-content: center;/s);
  });

  // Sous le seuil, une seule colonne de 600 px au plus : la page d'aujourd'hui, sans la moindre grille
  it("keeps one column of 600 px at most below the threshold, with no grid", () => {
    expect(narrowCss).toMatch(/\.lp-doc-column \{[^}]*max-width: 600px;/s);
    expect(narrowCss).not.toContain("grid-template-columns");
    expect(narrowCss).not.toContain("column-gap");
  });

  // Le lien courant est à l'encre avec un filet à gauche, les autres en gris ; le clavier voit le focus du design system
  it("draws the current link in ink with a rule on its left, and a visible focus", () => {
    expect(documentCss).toMatch(/\.lp-doc-link \{[^}]*color: var\(--muted\);/s);
    expect(documentCss).toMatch(
      /\.lp-doc-link\[aria-current\] \{[^}]*border-left-color: var\(--ink\);[^}]*color: var\(--ink\);/s,
    );
    expect(documentCss).toMatch(
      /\.lp-doc-link:focus-visible \{[^}]*outline: 2px solid var\(--focus-ring\);/s,
    );
  });

  // Un clic sur le sommaire défile doucement, sauf pour qui a demandé moins de mouvement ; rien ne s'écrit hors de cette requête
  it("scrolls smoothly to an anchor only when the visitor has not asked for less motion", () => {
    const smooth = documentCss.indexOf("scroll-behavior: smooth");

    expect(documentCss.match(/scroll-behavior/g)).toHaveLength(1);
    expect(documentCss.lastIndexOf("@media (prefers-reduced-motion: no-preference)", smooth)).toBeGreaterThan(
      -1,
    );
    expect(documentCss).toMatch(/\.lp-doc-section \{[^}]*scroll-margin-top: var\(--space-4\);/s);
  });

  // Le repère du bas est la dernière chose du document, caché aux lecteurs d'écran, et hors du flux : il ne prend ni cellule ni place
  it("ends the document with a hidden marker that takes no room", () => {
    for (const locale of LOCALES) {
      const html = inLocale(locale);
      const marker = `<div id="${DOCUMENT_END_ID}" class="lp-doc-end" aria-hidden="true"></div>`;

      expect(html).toContain(marker);
      expect(html.indexOf(marker)).toBeGreaterThan(html.indexOf("</section>"));
      expect(html.indexOf(marker) + marker.length + "</div></div></main>".length).toBe(html.length);
    }
    expect(documentCss).toMatch(/\.lp-doc-end \{[^}]*position: absolute;/s);
  });

  // La feuille n'écrit aucune couleur : elle ne prend que des jetons du design system
  it("writes no color of its own", () => {
    expect(documentCss).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  });

  // Un lien dans une phrase reprend le style du lien de la fenêtre Supprimer mon compte (window.css), sans couleur ni effet de plus ;
  // le clavier voit son focus avec l'anneau du design system
  it("styles the links of the sentences like the link of the Supprimer mon compte window, with a visible keyboard focus", () => {
    const windowCss = readFileSync(join(import.meta.dirname, "..", "design", "window.css"), "utf8");

    expect(windowCss).toMatch(/\.lp-window-link \{\s*color: inherit;\s*text-decoration: underline;\s*\}/);
    expect(documentCss).toMatch(
      /\.lp-doc-section \.lp-window-link:focus-visible \{[^}]*outline: 2px solid var\(--focus-ring\);/s,
    );
    expect(documentCss).not.toMatch(/\.lp-window-link \{/);
  });
});
