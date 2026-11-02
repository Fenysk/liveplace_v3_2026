import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Route } from "../../routes/confidentialite";
import { LocaleProvider } from "../locale/use-locale";
import { PrivacyPage } from "./privacy-page";
import { PRIVACY_END_ID, privacySections } from "./privacy-sections";
import { PRIVACY_TEXTS } from "./privacy-texts";

const titleFor = async (locale: "fr" | "en") => {
  const head = await Route.options.head?.({
    matches: [{ loaderData: { betaLabel: null, locale } }],
  } as never);
  return head?.meta?.find((tag) => tag && "title" in tag)?.title;
};

describe("la page Confidentialité dans les deux langues (§9.9)", () => {
  // Quand le serveur rend la page, le titre de l'onglet est écrit dans la langue que la racine a rendue
  it("writes the title of the tab in the language the root rendered", async () => {
    expect(await titleFor("fr")).toBe("Confidentialité · LivePlace");
    expect(await titleFor("en")).toBe("Privacy · LivePlace");
  });

  // Le titre de la page suit la langue
  it("writes the title of the page in the language of the visitor", () => {
    expect(renderToStaticMarkup(createElement(PrivacyPage))).toContain("Politique de confidentialité");
    expect(
      renderToStaticMarkup(createElement(LocaleProvider, { initial: "en" }, createElement(PrivacyPage))),
    ).toContain("Privacy policy");
  });

  // Tant que le texte n'est pas écrit, la page le dit sur un ton léger, dans la langue du visiteur, sous le titre (React écrit l'apostrophe `&#x27;`)
  it("says the policy is not written yet, with a joke, in the language of the visitor, under the title", () => {
    const french = renderToStaticMarkup(createElement(PrivacyPage));
    const english = renderToStaticMarkup(
      createElement(LocaleProvider, { initial: "en" }, createElement(PrivacyPage)),
    );

    expect(french).toContain(
      "Notre politique de confidentialité est tellement confidentielle qu&#x27;on ne l&#x27;a pas encore écrite.",
    );
    expect(english).toContain("Our privacy policy is so private we haven&#x27;t even written it yet.");
    expect(french.indexOf("Politique de confidentialité")).toBeLessThan(french.indexOf("Notre politique"));
    expect(english).not.toContain("tellement");
  });
});

const inLocale = (locale: "fr" | "en"): string =>
  renderToStaticMarkup(createElement(LocaleProvider, { initial: locale }, createElement(PrivacyPage)));

// L'adresse de contact, affichée telle quelle dans les deux langues
const CONTACT = "fenysk.pro@gmail.com";

const WORDMARK = '<a class="lp-type-display lp-wordmark" href="/">LivePlace</a>';

describe("la page Confidentialité ramène à l'accueil (§9.10)", () => {
  // Quand le visiteur arrive sur la page, « LivePlace » est le premier lien, vers l'accueil, avant le titre, dans les deux langues
  it("writes LivePlace first, as a link to the home page, in both languages", () => {
    for (const locale of ["fr", "en"] as const) {
      const html = inLocale(locale);

      expect(html).toContain(WORDMARK);
      expect(html.indexOf("LivePlace</a>")).toBeLessThan(html.indexOf("<h1"));
      expect(html.indexOf("<a ")).toBe(html.indexOf(WORDMARK));
    }
  });

  // Le mot est du texte seul, et le serveur n'écrit aucun `style` : la CSP de production le bloquerait
  it("carries no shape next to the name and no inline style", () => {
    for (const locale of ["fr", "en"] as const) {
      const html = inLocale(locale);

      expect(html).not.toMatch(/\sstyle=/);
      expect(html).toContain(WORDMARK);
    }
  });

  // Le texte de la page ne change pas : le mot-symbole n'est pas traduit, c'est le nom
  it("keeps the words of the page as they were", () => {
    expect(inLocale("fr")).toContain("Politique de confidentialité");
    expect(inLocale("en")).toContain("Privacy policy");
    expect(inLocale("en")).toContain("so private we haven&#x27;t even written it yet.");
    expect(inLocale("fr")).not.toMatch(/Accueil|Retour/);
  });

  // Le mot garde sa place d'une page à l'autre : c'est l'en-tête de l'accueil, ses marges et son bloc de 1600 px (home.css), sans les redire
  it("writes the header of the home page, so the name stays where the home page puts it", () => {
    const privacyCss = readFileSync(join(import.meta.dirname, "privacy.css"), "utf8");
    const homeCss = readFileSync(join(import.meta.dirname, "..", "home", "home.css"), "utf8");
    const html = inLocale("fr");

    expect(html).toContain(
      '<main class="lp-home-page"><div class="lp-void" aria-hidden="true"></div><div class="lp-home">',
    );
    expect(html).toContain(`<div class="lp-home-header">${WORDMARK}<div class="lp-home-settings">`);
    expect(homeCss).toContain("max-width: 1600px;");
    expect(privacyCss).not.toMatch(/clamp\(24px, 2\.5vw, 40px\)|1600px/);
  });

  // La route lie les deux feuilles : home.css pour la page et son en-tête, privacy.css pour les deux colonnes
  it("links the stylesheet of the home page and its own from the route", async () => {
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
    expect(route).toContain('import privacyCss from "../ui/privacy/privacy.css?url";');
    expect(route.indexOf("href: homeCss")).toBeLessThan(route.indexOf("href: privacyCss"));
  });
});

describe("la section Supprimer ton compte de la page Confidentialité (CDC §8, JOURNAL 2026-11-02)", () => {
  const sectionOf = (html: string): string => /<section[^>]*>(.*?)<\/section>/s.exec(html)?.[1] ?? "";

  // Quand le visiteur lit la page en français, la section dit comment supprimer son compte, avec les deux phrases d'Alexis, mot pour mot
  it("says how to delete the account in French, with the two sentences word for word", () => {
    const section = sectionOf(inLocale("fr"));

    expect(section).toMatch(/<h2[^>]*>Supprimer ton compte<\/h2>/);
    expect(section).toContain("Connecte-toi, ouvre Mon compte, clique Supprimer mon compte.");
    expect(section).toContain("Un compte sans connexion depuis 2 ans est supprimé de la même façon.");
  });

  // En anglais, chaque phrase a la sienne
  it("says it in English too, in the same tone", () => {
    const section = sectionOf(inLocale("en"));

    expect(section).toMatch(/<h2[^>]*>Delete your account<\/h2>/);
    expect(section).toContain("Sign in, open My account, click Delete my account.");
    expect(section).toContain("An account with no sign-in for 2 years is deleted the same way.");
    expect(section).not.toMatch(/Connecte|Supprimer|compte/);
  });

  // Les sauvegardes : une seule phrase, la durée au plus que le code tient (JOURNAL 2026-11-02), dans les deux langues
  it("says in one sentence how long a deleted account takes to leave the backups, in both languages", () => {
    const french = sectionOf(inLocale("fr"));
    const english = sectionOf(inLocale("en"));

    expect(french).toContain("Ton compte sort aussi de nos sauvegardes, en 24 heures au plus.");
    expect(english).toContain("Your account also leaves our backups, within 24 hours at most.");
    expect(english).not.toMatch(/sauvegarde|compte|heures/);
  });

  // Rien d'autre : un titre, trois phrases, puis la ligne de contact, un seul lien dans la section et aucun texte provisoire
  it("holds a title, three sentences and the contact line, and nothing else: one link, no placeholder", () => {
    for (const locale of ["fr", "en"] as const) {
      const section = sectionOf(inLocale(locale));

      expect(section.match(/<h2/g)).toHaveLength(1);
      expect(section.match(/<p /g)).toHaveLength(4);
      expect(section.match(/<a /g)).toHaveLength(1);
      // L'adresse s'écrit deux fois dans le HTML : le `href` et le texte du lien
      expect(section.match(/@/g)).toHaveLength(2);
      expect(section).not.toMatch(/e-mail|email|mail me|écris-moi/i);
    }
  });

  // Quand le visiteur ne peut pas se connecter, la section finit par la phrase qui donne l'adresse (CDC §8), dans les deux langues :
  // l'adresse est un lien `mailto:` dont le texte est l'adresse, et le point final reste hors du lien (React écrit l'apostrophe `&#x27;`)
  it("ends the section with the contact line: the address as a mailto link, the full stop outside of it", () => {
    const link = `<a class="lp-window-link" href="mailto:${CONTACT}">${CONTACT}</a>`;

    expect(sectionOf(inLocale("fr"))).toMatch(
      new RegExp(`<p class="lp-type-body">Tu ne peux pas te connecter \\? Écris à ${link}\\.</p>$`),
    );
    expect(sectionOf(inLocale("en"))).toMatch(
      new RegExp(`<p class="lp-type-body">Can&#x27;t sign in\\? Write to ${link}\\.</p>$`),
    );
  });

  // La ligne de contact vient après les trois phrases, jamais avant : le visiteur y arrive s'il n'a pas pu suivre les autres
  it("writes the contact line after the three sentences", () => {
    for (const locale of ["fr", "en"] as const) {
      const section = sectionOf(inLocale(locale));
      const last = PRIVACY_TEXTS[locale].deleteAccountSentences.at(-1) ?? "";

      expect(section.indexOf(last)).toBeGreaterThan(-1);
      expect(section.indexOf(last)).toBeLessThan(section.indexOf("<a "));
      expect(section.lastIndexOf("<p ")).toBeGreaterThan(section.indexOf(last));
    }
  });

  // L'adresse n'est pas traduite : elle vit une seule fois dans le code, hors des phrases, et les mots autour passent par les textes
  it("holds the address once in the code, in no phrase, and the words around it in both languages", () => {
    const sources = ["privacy-page.tsx", "privacy-sections.ts", "privacy-texts.ts"].map((file) =>
      readFileSync(join(import.meta.dirname, file), "utf8"),
    );

    expect(sources.join("\n").split(CONTACT)).toHaveLength(2);
    expect(JSON.stringify(PRIVACY_TEXTS)).not.toContain("@");
    expect(PRIVACY_TEXTS.fr.deleteAccountContact).toEqual({
      before: "Tu ne peux pas te connecter ? Écris à ",
      after: ".",
    });
    expect(PRIVACY_TEXTS.en.deleteAccountContact).toEqual({ before: "Can't sign in? Write to ", after: "." });
  });

  // Le lien reprend le style du lien dans le texte de la fenêtre Supprimer mon compte (window.css), sans couleur ni effet de plus, et
  // le clavier voit son focus avec l'anneau du design system
  it("styles the address like the link of the Supprimer mon compte window, with a visible keyboard focus", () => {
    const windowCss = readFileSync(join(import.meta.dirname, "..", "design", "window.css"), "utf8");
    const privacyCss = readFileSync(join(import.meta.dirname, "privacy.css"), "utf8");

    expect(windowCss).toMatch(/\.lp-window-link \{\s*color: inherit;\s*text-decoration: underline;\s*\}/);
    expect(privacyCss).toMatch(
      /\.lp-privacy-section \.lp-window-link:focus-visible \{[^}]*outline: 2px solid var\(--focus-ring\);/s,
    );
    expect(privacyCss).not.toMatch(/\.lp-window-link \{/);
  });

  // La ligne « pas encore écrite » reste, avant la section
  it("keeps the line that says the policy is not written yet, before the section", () => {
    const french = inLocale("fr");

    expect(french).toContain("Notre politique de confidentialité est tellement confidentielle");
    expect(french.indexOf("Notre politique")).toBeLessThan(french.indexOf("<section"));
    expect(french.indexOf("Politique de confidentialité")).toBeLessThan(french.indexOf("<section"));
  });

  // La liste des phrases reste à trois dans les deux langues, rendue telle quelle ; la ligne de contact est un texte à part, qui n'y entre pas
  it("renders the list of three sentences as it is, and keeps the contact line out of it", () => {
    expect(PRIVACY_TEXTS.fr.deleteAccountSentences).toHaveLength(3);
    expect(PRIVACY_TEXTS.en.deleteAccountSentences).toHaveLength(
      PRIVACY_TEXTS.fr.deleteAccountSentences.length,
    );
    expect(PRIVACY_TEXTS.fr.deleteAccountSentences.join(" ")).not.toContain("connecter");
    expect(PRIVACY_TEXTS.en.deleteAccountSentences.join(" ")).not.toContain("Can't");
  });
});

describe("la page Confidentialité en deux colonnes, sommaire à gauche (variante A, JOURNAL 2026-11-02)", () => {
  const privacyCss = readFileSync(join(import.meta.dirname, "privacy.css"), "utf8");
  // Ce que la feuille écrit dans un bloc `@container lp-home (min-width: 1100px) { … }`, et hors de lui
  const WIDE = "@container lp-home (min-width: 1100px) {";
  const wideCss = privacyCss.slice(privacyCss.indexOf(WIDE));
  const narrowCss = privacyCss.slice(0, privacyCss.indexOf(WIDE));
  const navLinks = (html: string): string[] =>
    [...html.matchAll(/<a [^>]*href="#[^"]*"[^>]*>[^<]*<\/a>/g)].map(([link]) => link);

  // Quand le visiteur ouvre la page, le titre est un h1 de la taille display, puis le contenu est dans une carte (pill)
  it("writes the title as a display h1, then the content in a pill", () => {
    for (const locale of ["fr", "en"] as const) {
      const html = inLocale(locale);

      expect(html).toMatch(/<h1 class="lp-type-display">[^<]+<\/h1><div class="lp-pill lp-privacy-card">/);
      expect(html.indexOf("lp-privacy-card")).toBeLessThan(html.indexOf("<section"));
    }
  });

  // Le sommaire est une navigation nommée, avant le titre, dans la langue du visiteur ; son nom est le seul texte nouveau de la page
  it("names the contents `Sommaire` or `Contents`, before the title, and adds no other words", () => {
    expect(inLocale("fr")).toContain('<nav class="lp-privacy-nav" aria-label="Sommaire">');
    expect(inLocale("en")).toContain('<nav class="lp-privacy-nav" aria-label="Contents">');
    expect(inLocale("en")).not.toContain("Sommaire");
    expect(inLocale("fr").indexOf("<nav")).toBeLessThan(inLocale("fr").indexOf("<h1"));
    expect(Object.keys(PRIVACY_TEXTS.fr).sort()).toEqual(
      [
        "contentsLabel",
        "deleteAccountContact",
        "deleteAccountSentences",
        "deleteAccountTitle",
        "documentTitle",
        "title",
        "underConstruction",
      ].sort(),
    );
  });

  // Une entrée du sommaire par section, depuis la même liste que la page : l'ancre est l'identifiant de la section, le lien dit son titre
  it("links every section from the contents, with the anchor of the section and its title", () => {
    for (const locale of ["fr", "en"] as const) {
      const html = inLocale(locale);
      const sections = privacySections(PRIVACY_TEXTS[locale]);
      const links = navLinks(html).filter((link) => link.includes("lp-privacy-link"));

      expect(links).toHaveLength(sections.length);
      expect(html.match(/<section /g)).toHaveLength(sections.length);
      for (const [index, section] of sections.entries()) {
        expect(links[index]).toContain(`href="#${section.id}"`);
        expect(links[index]).toContain(`>${section.title}</a>`);
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
    for (const locale of ["fr", "en"] as const) {
      const html = inLocale(locale);

      expect(html.match(/aria-current=/g)).toHaveLength(1);
      expect(html).toContain(
        'class="lp-privacy-link lp-type-body" href="#privacy-delete-account" aria-current="location"',
      );
    }
  });

  // Le sommaire est caché sous le seuil de la maquette, et montré, collant, à partir de lui : le téléphone n'a pas de sommaire
  it("shows the contents only from 1100 px of block, sticky, and hides it below", () => {
    expect(narrowCss).toMatch(/\.lp-privacy-nav \{\s*display: none;/);
    expect(wideCss).toMatch(/\.lp-privacy-nav \{[^}]*display: block;[^}]*position: sticky;/s);
    expect(narrowCss).not.toContain("position: sticky");
    expect(privacyCss.match(/@container lp-home/g)).toHaveLength(1);
  });

  // Le seuil est celui de la maquette et il mesure le bloc de l'accueil : home.css le déclare conteneur, sinon la requête ne s'appliquerait jamais
  it("measures the block of the home page, as the mock-up does", () => {
    const homeCss = readFileSync(join(import.meta.dirname, "..", "home", "home.css"), "utf8");

    expect(homeCss).toContain("container: lp-home / inline-size;");
    expect(privacyCss).toContain("@container lp-home (min-width: 1100px) {");
  });

  // Deux colonnes : le sommaire sur 240 px, le texte sur 784 px moins les 2 × 32 px de la carte, soit 720 px, centrés
  it("lays out 240 px for the contents and a text of 720 px inside a card of 784 px", () => {
    const columns = /grid-template-columns: (\d+)px (\d+)px;/.exec(wideCss);
    const padding = /\.lp-privacy-card \{[^}]*padding: (\d+)px;/s.exec(wideCss);

    expect(columns?.slice(1)).toEqual(["240", "784"]);
    expect(Number(columns?.[2]) - 2 * Number(padding?.[1])).toBe(720);
    expect(wideCss).toMatch(/\.lp-privacy-doc \{[^}]*justify-content: center;/s);
  });

  // Sous le seuil, une seule colonne de 600 px au plus : la page d'aujourd'hui, sans la moindre grille
  it("keeps one column of 600 px at most below the threshold, with no grid", () => {
    expect(narrowCss).toMatch(/\.lp-privacy-column \{[^}]*max-width: 600px;/s);
    expect(narrowCss).not.toContain("grid-template-columns");
    expect(narrowCss).not.toContain("column-gap");
  });

  // Le lien courant est à l'encre avec un filet à gauche, les autres en gris ; le clavier voit le focus du design system
  it("draws the current link in ink with a rule on its left, and a visible focus", () => {
    expect(privacyCss).toMatch(/\.lp-privacy-link \{[^}]*color: var\(--muted\);/s);
    expect(privacyCss).toMatch(
      /\.lp-privacy-link\[aria-current\] \{[^}]*border-left-color: var\(--ink\);[^}]*color: var\(--ink\);/s,
    );
    expect(privacyCss).toMatch(
      /\.lp-privacy-link:focus-visible \{[^}]*outline: 2px solid var\(--focus-ring\);/s,
    );
  });

  // Un clic sur le sommaire défile doucement, sauf pour qui a demandé moins de mouvement ; rien ne s'écrit hors de cette requête
  it("scrolls smoothly to an anchor only when the visitor has not asked for less motion", () => {
    const smooth = privacyCss.indexOf("scroll-behavior: smooth");

    expect(privacyCss.match(/scroll-behavior/g)).toHaveLength(1);
    expect(privacyCss.lastIndexOf("@media (prefers-reduced-motion: no-preference)", smooth)).toBeGreaterThan(
      -1,
    );
    expect(privacyCss).toMatch(/\.lp-privacy-section \{[^}]*scroll-margin-top: var\(--space-4\);/s);
  });

  // Le repère du bas est la dernière chose du document, caché aux lecteurs d'écran, et hors du flux : il ne prend ni cellule ni place
  it("ends the document with a hidden marker that takes no room", () => {
    for (const locale of ["fr", "en"] as const) {
      const html = inLocale(locale);
      const marker = `<div id="${PRIVACY_END_ID}" class="lp-privacy-end" aria-hidden="true"></div>`;

      expect(html).toContain(marker);
      expect(html.indexOf(marker)).toBeGreaterThan(html.indexOf("</section>"));
      expect(html.indexOf(marker) + marker.length + "</div></div></main>".length).toBe(html.length);
    }
    expect(privacyCss).toMatch(/\.lp-privacy-end \{[^}]*position: absolute;/s);
  });

  // Le serveur n'écrit aucun `style`, et la feuille n'écrit aucune couleur : elle ne prend que des jetons du design system
  it("writes no style attribute and no color of its own", () => {
    expect(inLocale("fr")).not.toMatch(/\sstyle=/);
    expect(privacyCss).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  });
});
