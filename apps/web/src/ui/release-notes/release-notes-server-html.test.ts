import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PALETTE } from "@liveplace/domain";
import { createElement, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Route } from "../../routes/nouveautes";
import { enterLabel } from "../draft/draft-labels";
import { HomeSettings } from "../home/home-settings";
import { LocaleProvider } from "../locale/use-locale";
import { ReleaseList } from "./release-list";
import { AUDIENCE_DISPLAY_ORDER, AUDIENCES } from "./release-notes";
import { ReleaseNotesPage } from "./release-notes-page";
import { ReleaseNotesTab } from "./release-notes-tab";
import { RELEASES } from "./release-notes-texts";
import { THUMBNAILS } from "./release-thumbnails";

// Un attribut `style` : la CSP de production (`default-src 'self'`, sans `style-src`) bloque celui du HTML que le
// serveur écrit, et la couleur ou la forme qu'il portait disparaît. React, lui, pose `style` par le CSSOM, que la CSP laisse.
const INLINE_STYLE = /\sstyle=/;

const inLocale = (locale: "fr" | "en", element: ReactElement): string =>
  renderToString(createElement(LocaleProvider, { initial: locale }, element));

const serverHtml = {
  page: (locale: "fr" | "en" = "fr") => inLocale(locale, createElement(ReleaseNotesPage)),
  list: (audiences: Parameters<typeof ReleaseList>[0]["audiences"], locale: "fr" | "en" = "fr") =>
    inLocale(locale, createElement(ReleaseList, { audiences, level: 3 })),
};

// Les titres de groupe de la fenêtre (une légende atténuée) et ceux de la page (un titre, à l'encre)
const audienceTitlesOf = (html: string): string[] =>
  [...html.matchAll(/<h[34] class="lp-type-caption lp-muted">([^<]*)<\/h[34]>/g)].map(
    ([, title]) => title ?? "",
  );
const releaseDatesOf = (html: string): string[] =>
  [...html.matchAll(/<h2 class="lp-type-heading">([^<]*)<\/h2>/g)].map(([, date]) => date ?? "");
const pageAudienceTitlesOf = (html: string): string[] =>
  [...html.matchAll(/<h3 class="lp-type-title">([^<]*)<\/h3>/g)].map(([, title]) => title ?? "");

describe("the HTML the server writes for /nouveautes (CSP of production)", () => {
  // Aucun attribut `style` dans la page entière, dans les deux langues
  it("carries no inline style in the whole page, in French and in English", () => {
    for (const locale of ["fr", "en"] as const) expect(serverHtml.page(locale)).not.toMatch(INLINE_STYLE);
  });

  // Ni la section de la fenêtre, ni la liste d'un viewer ou du streamer, ni chaque vignette seule
  it("carries none in the window section, in the list of each public, nor in any thumbnail", () => {
    expect(
      inLocale("fr", createElement(ReleaseNotesTab, { audiences: AUDIENCES, isOpen: false })),
    ).not.toMatch(INLINE_STYLE);
    expect(serverHtml.list(["viewer"])).not.toMatch(INLINE_STYLE);
    expect(serverHtml.list(AUDIENCES)).not.toMatch(INLINE_STYLE);
    for (const Thumbnail of Object.values(THUMBNAILS))
      expect(inLocale("fr", createElement(Thumbnail))).not.toMatch(INLINE_STYLE);
  });

  // Le serveur rend « tout est lu » : aucun point dans le HTML, il n'arrive qu'à l'hydratation
  it("writes no dot: what is read lives in the browser", () => {
    expect(serverHtml.page()).not.toContain("lp-avatar-dot");
  });

  // Dans chaque publication, les groupes vont dans l'ordre tous, modérateurs, streamers : celui de tous n'a pas de titre, les autres ont celui de la langue
  it("writes the byAudience of each release in order, the first with no title, the others with their titles in each language", () => {
    expect(pageAudienceTitlesOf(serverHtml.page("fr"))).toEqual([
      "Pour les streamers",
      "Pour les modérateurs",
      "Pour les streamers",
      "Pour les modérateurs",
      "Pour les streamers",
    ]);
    expect(pageAudienceTitlesOf(serverHtml.page("en"))).toEqual([
      "For streamers",
      "For moderators",
      "For streamers",
      "For moderators",
      "For streamers",
    ]);
    expect(serverHtml.page("fr")).not.toContain("Pour tous");
    expect(serverHtml.page("en")).not.toContain("For everyone");
  });

  // Le titre « Nouveautés » en grand, sa phrase, le titre de la publication (plus petit) avec sa date selon la langue, puis les 7 lignes
  it("writes the title, its sentence, the date alone as the title of each of the 5 releases, and the 18 lines", () => {
    const french = serverHtml.page("fr");
    const english = serverHtml.page("en");

    expect(french).toMatch(/<h1 class="lp-type-display">Nouveautés<\/h1>/);
    expect(english).toMatch(/<h1 class="lp-type-display">What(?:&#x27;|')s new<\/h1>/);
    expect(releaseDatesOf(french)).toEqual([
      "1er novembre",
      "18 octobre",
      "11 octobre",
      "4 octobre",
      "27 septembre",
    ]);
    expect(releaseDatesOf(english)).toEqual([
      "November 1",
      "October 18",
      "October 11",
      "October 4",
      "September 27",
    ]);
    expect(french).toContain(
      '<p class="lp-release-intro lp-type-body lp-muted">Ce qui change dans LivePlace, du plus récent au plus ancien.</p>',
    );
    expect(english).toMatch(
      /<p class="lp-release-intro lp-type-body lp-muted">What(?:&#x27;|')s changing in LivePlace, newest first\.<\/p>/,
    );
    expect(french.match(/<li class="lp-release-line[ "]/g)).toHaveLength(18);
    expect(french.indexOf("<h1")).toBeLessThan(french.indexOf("lp-release-intro"));
    expect(french.indexOf("lp-release-intro")).toBeLessThan(french.indexOf(">1er novembre<"));
  });

  // Le texte reste aligné à gauche : le titre en `lp-type-body`, la phrase dessous en légende atténuée
  it("writes each line as a title, then its sentence in a muted caption", () => {
    const html = serverHtml.page("fr");

    expect(html).toContain(
      '<div class="lp-release-text"><p class="lp-type-body">Archive et recommence</p><p class="lp-type-caption lp-muted">Archive ta fresque, elle garde son lien, et repars sur une fresque vide.</p></div>',
    );
    expect(html).not.toContain("Où :");
  });

  // Le mot-symbole ramène à l'accueil, et le bouton Nouveautés de l'accueil n'est pas là : on y est
  it("writes LivePlace as a link to the home page, and no Nouveautés link on this very page", () => {
    const html = serverHtml.page("fr");

    expect(html).toContain('<a class="lp-type-display lp-wordmark" href="/">LivePlace</a>');
    expect(html).not.toContain('href="/nouveautes"');
    expect(html.indexOf("lp-wordmark")).toBeLessThan(html.indexOf("<h1"));
  });

  // Les réglages de l'accueil sont là : la langue (les deux formes) et l'apparence
  it("keeps the language and the appearance of the home header", () => {
    const html = serverHtml.page("fr");

    expect(html).toContain('<div class="lp-home-settings">');
    expect(html).toContain('role="radiogroup" aria-label="Langue"');
    expect(html).toContain('title="Apparence : Auto"');
  });

  // Chaque vignette est un bouton nommé « Agrandir : … » dans la langue ; l'agrandissement n'est pas dans le HTML fermé
  it("writes each thumbnail as a button named Agrandir or Enlarge, with no dialog while closed", () => {
    const french = serverHtml.page("fr");
    const english = serverHtml.page("en");
    const names = (html: string) =>
      [...html.matchAll(/<button[^>]*class="lp-release-shot"[^>]*aria-label="([^"]*)"/g)].map(
        ([, name]) => name,
      );

    expect(names(french)).toEqual([
      "Agrandir\u00a0: Annuler, refaire",
      "Agrandir\u00a0: La fresque grandit seule",
      "Agrandir\u00a0: Un coup de pouce\u202f?",
      "Agrandir\u00a0: Le classement",
      "Agrandir\u00a0: Hello world!",
      "Agrandir\u00a0: App mobile",
      "Agrandir\u00a0: En live sur Twitch",
      "Agrandir\u00a0: Modération facile",
      "Agrandir\u00a0: Archive et recommence",
      "Agrandir\u00a0: Choisis ton fond",
      "Agrandir\u00a0: Un thème pour la fresque",
      "Agrandir\u00a0: Signaler un dessin",
      "Agrandir\u00a0: La pipette",
      "Agrandir\u00a0: Dessiner au clavier",
      "Agrandir\u00a0: Augmente ta jauge",
      "Agrandir\u00a0: Efface les dessins gênants",
      "Agrandir\u00a0: Le format de la fresque",
      "Agrandir\u00a0: Lancement de LivePlace (bêta)",
    ]);
    expect(names(english)).toEqual([
      "Enlarge: Undo, redo",
      "Enlarge: The canvas grows by itself",
      "Enlarge: Need a hand?",
      "Enlarge: The scoreboard",
      "Enlarge: Hello world!",
      "Enlarge: Mobile app",
      "Enlarge: Live on Twitch",
      "Enlarge: Easy moderation",
      "Enlarge: Archive and start over",
      "Enlarge: Pick your background",
      "Enlarge: A theme for your canvas",
      "Enlarge: Report a drawing",
      "Enlarge: The eyedropper",
      "Enlarge: Draw with the keyboard",
      "Enlarge: Grow your gauge",
      "Enlarge: Clear unwanted drawings",
      "Enlarge: The canvas format",
      "Enlarge: LivePlace launches (beta)",
    ]);
    expect(french).not.toContain("<dialog");
    expect(french).not.toContain("lp-zoom");
  });

  // Aucune icône d'agrandissement : un clic sur l'image suffit, le bouton garde son nom accessible et rien d'autre ne s'y ajoute
  it("has no enlarge icon: the picture is the only button, named for a screen reader, with nothing added inside", () => {
    const html = serverHtml.page("fr");

    expect(html).not.toContain("lp-release-shot-hint");
    expect(html).not.toContain("lucide-maximize");
    expect(serverHtml.list(AUDIENCES)).not.toContain("lp-release-shot-hint");
    expect(html.match(/<button[^>]*class="lp-release-shot"[^>]*aria-label="[^"]+"/g)).toHaveLength(18);
  });

  // Les vignettes ne sont pas des images : des tracés SVG et le podium, aucune `<img>`, aucune icône inventée
  it("draws the thumbnails as SVG and the real podium, with no image", () => {
    const html = serverHtml.page("fr");

    expect(html).not.toContain("<img");
    expect(html.match(/<svg class="lp-release-svg"/g)).toHaveLength(3); // la fresque qui grandit, les fonds et le format
    expect(html.match(/<svg class="lp-release-svg lp-release-mini"/g)).toHaveLength(12); // la Modération, Annuler refaire, Signaler, Effacer, la pipette, le clavier, la jauge, le lancement, l'aide, la langue, le live et le thème
    expect(html).toContain("lp-release-bg-preview");
    expect(html).toContain("lp-release-podium");
    expect(html.match(/class="lp-rank-ring lp-rank-ring--[123]"/g)).toHaveLength(3);
  });
});

// Les cartes de la page : le HTML dit que chaque nouveauté est une carte (sa vignette dans une cellule, puis son texte) ; les colonnes
// et la largeur sont du CSS (release-grid.test.ts).
describe("the cards of /nouveautes (server HTML)", () => {
  const linesOf = (html: string) =>
    [...html.matchAll(/<li class="(lp-release-line[^"]*)">(.*?)<\/li>/gs)].map(([, className, content]) => ({
      className: className ?? "",
      content: content ?? "",
    }));
  const titlesOf = (html: string): string[] =>
    linesOf(html).map(({ content }) => /<p class="lp-type-body">([^<]*)<\/p>/.exec(content)?.[1] ?? "");

  // La page est une grille de cartes, dans les deux langues ; la section de la fenêtre garde ses lignes
  it("lays the page lists out as cards, in both languages, and keeps the window section as rows", () => {
    for (const locale of ["fr", "en"] as const)
      expect(serverHtml.page(locale)).toContain('<div class="lp-releases lp-releases--grid">');
    const windowSections = [
      serverHtml.list(AUDIENCES),
      inLocale("fr", createElement(ReleaseNotesTab, { audiences: AUDIENCES, isOpen: false })),
    ];
    for (const html of windowSections) {
      expect(html).toContain('<div class="lp-releases">');
      expect(html).not.toMatch(/lp-releases--grid|lp-release-entry|lp-release-shot-cell/);
    }
  });

  // Une carte : la cellule de sa vignette d'abord (elle est en haut), puis son texte ; une carte sans vignette n'est que son texte, sans cellule vide
  it("writes a line as a card: its thumbnail in a cell first when it has one, then its text", () => {
    const entries = linesOf(serverHtml.page());
    const withShot = entries.filter(({ content }) => content.includes("lp-release-shot-cell"));

    expect(entries).toHaveLength(18);
    expect(withShot).toHaveLength(18);
    for (const { className, content } of entries) {
      expect(className).toBe("lp-release-line lp-release-entry");
      expect(content).toMatch(
        content.includes("lp-release-shot-cell")
          ? /^<div class="lp-release-shot-cell"><button .*<\/button><\/div><div class="lp-release-text">/s
          : /^<div class="lp-release-text">/,
      );
      expect(content.match(/lp-release-shot-cell/g)?.length ?? 0).toBeLessThanOrEqual(1);
    }
  });

  // Une seule forme : plus de ligne simple, une carte ; la cellule de la vignette n'existe que pour les dix-huit cartes qui en ont une
  it("has a single form: no plain row, a thumbnail cell only for the eighteen cards that have a thumbnail", () => {
    const html = serverHtml.page();

    expect(html).not.toContain("lp-release-plain");
    expect(html.match(/lp-release-shot-cell/g)).toHaveLength(18);
    expect(html.match(/<button[^>]*class="lp-release-shot"/g)).toHaveLength(18);
  });

  // Les cartes se lisent publication par publication, puis groupe par groupe dans l'ordre de l'écran (tous, modérateurs, streamers), chaque groupe dans l'ordre de la publication
  it("reads the cards release by release, then group by group in the order of the screen, each group in the order of the release", () => {
    const expected = RELEASES.flatMap(({ lines }) =>
      AUDIENCE_DISPLAY_ORDER.flatMap((audience) =>
        lines.filter((entry) => entry.audience === audience).map(({ texts }) => texts.fr.title),
      ),
    );

    expect(titlesOf(serverHtml.page("fr"))).toEqual(expected);
  });

  // Le titre d'une publication est un titre de niveau 2 sous le grand titre, ceux des groupes titrés de niveau 3 : chacun est le premier enfant
  // de son bloc ; le groupe de tous, sans titre, est une division qui s'ouvre sur ses cartes, juste sous la date
  it("puts the release title first in its article and each group title first in its section", () => {
    const html = serverHtml.page("fr");

    expect(html.match(/<article class="lp-release"><h2 class="lp-type-heading">/g)).toHaveLength(5);
    expect(html.match(/<section class="lp-release-audience"><h3 class="lp-type-title">/g)).toHaveLength(5);
    expect(html.match(/<\/h2><div class="lp-release-audience"><ul class="lp-release-lines">/g)).toHaveLength(
      5,
    );
    expect(html.match(/<div class="lp-release-audience">/g)).toHaveLength(5);
  });
});

describe("the thumbnails of a pill (server HTML, still image)", () => {
  const still = (kind: keyof typeof THUMBNAILS, locale: "fr" | "en" = "fr"): string =>
    inLocale(locale, createElement(THUMBNAILS[kind]));

  // La Modération : la pill Compte (bouclier avec son point rouge, Nouveautés, la photo), en haut à droite d'une mini-fresque, et la liste fermée
  it("shows the account pill with the red dot on the shield, in the top right of a mini canvas", () => {
    const html = still("moderation");

    expect(html).toContain("lp-release-pill--top-right");
    expect(html.match(/lp-btn--dot/g)).toHaveLength(1);
    expect(html.match(/class="lp-release-dot"/g)).toHaveLength(1);
    expect(html).toContain("lp-release-sheet");
    expect(html).toContain("lp-release-cursor");
    expect(html.match(/<svg class="lp-release-svg lp-release-mini"/g)).toHaveLength(1);
    expect(html).not.toContain("lp-avatar-dot"); // la classe du point du bouton Nouveautés reste à lui seul
    expect(
      [...html.matchAll(/lp-avatar lp-type-title" aria-hidden="true">(\w)</g)].map(([, letter]) => letter),
    ).toEqual(["A", "K", "N"]);
  });

  // Annuler, refaire : la pill Dessin en bas au centre (trois pastilles, trois outils, Annuler dégrisé, Refaire grisé), le champignon posé
  // dans les couleurs de la palette, sans le cœur de l'ancienne vignette
  it("shows the draw pill with three swatches and three tools, Undo ready, and the mushroom placed in palette colors", () => {
    const html = still("undo");

    expect(html).toContain("lp-release-pill--bottom-center");
    expect(html).toContain('data-can-undo="true" data-can-redo="false" data-can-discard="true"');
    expect(html).toContain("lp-release-tool-undo");
    expect(html).toContain("lp-release-tool-redo");
    expect(html).toContain("lp-release-tool-discard");
    expect(html.match(/lp-swatch--recent/g)).toHaveLength(3);
    expect(html.match(/data-chosen="true"/g)).toHaveLength(1); // la pastille du pied, le dernier trait
    expect(html.match(/data-chosen="false"/g)).toHaveLength(2);
    expect(html.match(/data-cell="/g)).toHaveLength(44); // 26 cases de chapeau, 7 de points, 11 de pied
    for (const colorIndex of [5, 42, 13, 16]) expect(html).toContain(`fill="${PALETTE[colorIndex]}"`);
    expect(html).not.toContain('fill="#c878af"'); // le rose du cœur n'est plus là
    expect(html).not.toContain('visibility="hidden"'); // l'image fixe montre les trois traits en entier
    expect(html).toContain("lp-release-pointer"); // la souris est écrite, mais cachée par le CSS tant que rien ne bouge
  });

  // Soutenir LivePlace n'est pas dans les Nouveautés : ni sa ligne, ni sa vignette, ni son rose, dans les deux langues, page et fenêtre
  it("says nothing of the support button: no line, no thumbnail, no pink, in either language", () => {
    for (const locale of ["fr", "en"] as const) {
      const html = serverHtml.page(locale) + serverHtml.list(AUDIENCES, locale);

      expect(html).not.toMatch(/Soutenir|Support LivePlace/);
      expect(html).not.toContain("lp-release-support");
    }
    expect(Object.keys(THUMBNAILS)).toEqual([
      "archives",
      "backgrounds",
      "growth",
      "scoreboard",
      "moderation",
      "undo",
      "report",
      "clear",
      "eyedropper",
      "keyboard",
      "gauge",
      "format",
      "launch",
      "help",
      "language",
      "install",
      "live",
      "theme",
    ]);
  });
});

describe("Report, Clear and the eyedropper (server HTML, still image)", () => {
  const still = (kind: keyof typeof THUMBNAILS, locale: "fr" | "en" = "fr"): string =>
    inLocale(locale, createElement(THUMBNAILS[kind]));

  // Signaler : la pill Inspection avec « Signalé » grisé et le toast, la fenêtre de confirmation écrite mais invisible, le gribouillis resté
  it("shows the Inspection pill saying Reported with its toast, and the scribble left in place", () => {
    const html = still("report");

    expect(html).toContain('data-done="true"');
    expect(html).toContain("lp-release-inspection");
    expect(html).toContain("Signaler ce dessin de Kira");
    expect(html).toContain("Signalement envoyé");
    expect(html).toContain("lp-release-veil");
    expect(html).toContain('data-part="scribble" opacity="1"');
    expect(html).toContain('data-part="ring" opacity="1"');
    expect(html).not.toMatch(INLINE_STYLE);
    expect(still("report", "en")).toContain("Report this drawing by Kira");
  });

  // Effacer : le gribouillis est parti (un seul pas), l'Inspection reste ouverte, ni « Signalé » ni toast
  it("shows the Inspection pill still open with the scribble gone, and no toast", () => {
    const html = still("clear");

    expect(html).toContain('data-done="false"');
    expect(html).toContain('data-part="scribble" opacity="0"');
    expect(html).toContain("Effacer ses dessins");
    expect(html).toContain("Effacer ce dessin de Kira");
    expect(html).not.toContain("lp-release-toast");
    expect(html).not.toMatch(INLINE_STYLE);
  });

  // La pipette : trois pastilles dont la rouge est choisie, la pipette désarmée, le champignon posé en palette, sans contour ni souris
  it("shows the red swatch chosen, the eyedropper disarmed, and the mushroom in palette colors", () => {
    const html = still("eyedropper");

    expect(html).toContain('data-armed="false"');
    expect(html).toContain("lp-release-pill--bottom-center");
    expect(html).toContain("lucide-pipette");
    expect(html.match(/lp-swatch--recent/g)).toHaveLength(3);
    expect(html.match(/data-chosen="true"/g)).toHaveLength(1);
    expect(html.match(/data-chosen="false"/g)).toHaveLength(2);
    expect(html).toMatch(new RegExp(`data-chosen="true"[^>]*><svg[^>]*><circle[^>]*fill="${PALETTE[5]}"`));
    expect(html).toContain('data-part="outline" opacity="0"');
    expect(html).toContain("lp-release-pointer--tool");
    expect(html).not.toMatch(INLINE_STYLE);
  });
});

describe("Keyboard, Gauge and Format (server HTML, still image)", () => {
  const still = (kind: keyof typeof THUMBNAILS, locale: "fr" | "en" = "fr"): string =>
    inLocale(locale, createElement(THUMBNAILS[kind]));

  // Dessiner au clavier : les quatre flèches et Espace en `lp-kbd`, la case visée sur le dernier pixel, le sourire dessiné, aucune souris
  it("shows the five keys, the aimed cell on the last pixel and the four pixels of the smile, with no mouse", () => {
    const html = still("keyboard");

    for (const key of ["up", "left", "down", "right", "space"]) expect(html).toContain(`data-tap="${key}"`);
    expect(html.match(/class="lp-kbd lp-release-key /g)).toHaveLength(5);
    for (const icon of ["lucide-arrow-up", "lucide-arrow-left", "lucide-arrow-down", "lucide-arrow-right"])
      expect(html).toContain(icon);
    expect(
      html.match(new RegExp(`data-part="pixel-[0-9]" [^>]*fill="${PALETTE[28]}" opacity="1"`, "g")),
    ).toHaveLength(4);
    expect(html).toContain('data-part="outline" opacity="1"');
    expect(html).toContain('data-part="target" transform="translate(15 0)"');
    expect(html).not.toContain("lp-release-pointer");
    expect(html).not.toMatch(INLINE_STYLE);
  });

  // Augmente ta jauge : le +1 doré à côté de la jauge pleine (20/20), « 21/21 » et « Dessiner » écrits mais cachés, la souris cachée
  it("shows the golden +1 next to the full gauge, the claimed state written but hidden", () => {
    const html = still("gauge");

    expect(html).toContain('data-claimed="false"');
    expect(html).toContain("lp-claim");
    expect(html).toContain(">+1<");
    expect(html).toContain("20/20");
    expect(html).toContain("21/21");
    expect(html).toContain(">Dessiner<");
    expect(still("gauge", "en")).toContain(`>${enterLabel(0, "en")}<`);
    expect(html).toContain("lp-gauge is-full");
    expect(html).not.toMatch(INLINE_STYLE);
  });

  // Le format : les cinq options du sélecteur, 16:9 choisi, le cadre à ses proportions (64 × 36), le cœur au centre
  it("shows the five options with 16:9 chosen, and the frame of a 16:9 canvas", () => {
    const html = still("format");
    const options = [
      ...html.matchAll(/<span class="lp-segmented-option lp-type-body( is-selected)?" data-tap="([^"]+)"/g),
    ];

    expect(options.map(([, , format]) => format)).toEqual(["1:1", "16:9", "9:16", "4:3", "3:4"]);
    expect(options.flatMap(([, selected, format]) => (selected ? [format] : []))).toEqual(["16:9"]);
    expect(html).toMatch(/data-part="canvas" x="24" y="8" width="64" height="36"/);
    expect(html).toContain("lp-segmented lp-selection");
    expect(html).not.toMatch(INLINE_STYLE);
  });
});

describe("Launch, Help and Language (server HTML, still image)", () => {
  const still = (kind: keyof typeof THUMBNAILS, locale: "fr" | "en" = "fr"): string =>
    inLocale(locale, createElement(THUMBNAILS[kind]));

  // Le lancement : le compte connecté au premier plan (la pill de l'invité écrite mais cachée par le CSS), les trois dessins arrivés, aucune souris
  it("shows the signed-in account and the three drawings fully arrived, the guest pill written but hidden", () => {
    const html = still("launch");

    expect(html).toContain("lp-release-account");
    expect(html).toContain("lp-release-guest");
    expect(html).toContain("lp-btn--twitch");
    expect(html).toContain(">Se connecter<");
    expect(still("launch", "en")).toContain(">Sign in<");
    expect(html).toContain('data-part="drawings" opacity="1"');
    expect(html.match(/<rect data-drawing="[012]" data-cell="[0-9]+"/g)?.length).toBeGreaterThan(40);
    expect(html.match(/data-drawing="[012]"[^>]*opacity="1"/g)).toHaveLength(
      html.match(/data-drawing="[012]"/g)?.length ?? -1,
    );
    expect(html.match(/lp-avatar /g)).toHaveLength(1);
    expect(html).toContain("lp-release-pointer");
    expect(html).not.toMatch(INLINE_STYLE);
  });

  // Les trois dessins ont les couleurs de la palette : le violet d'un fantôme, l'orange d'un chat, le rouge d'un cœur
  it("draws the three arrivals with palette colors: a ghost, a cat and a heart", () => {
    const html = still("launch");

    for (const colorIndex of [32, 8, 5]) expect(html).toContain(`fill="${PALETTE[colorIndex]}"`);
  });

  // Un coup de pouce : la bulle de Valider (la vraie, avec sa flèche et son anneau), celle de la jauge écrite mais cachée, la fenêtre Mon compte et le toast cachés
  it("shows the Confirm bubble with its arrow, the gauge bubble written but hidden, and the window and toast hidden", () => {
    const html = still("help");

    expect(html).toContain("lp-bubble lp-bubble--pointing lp-release-bubble lp-release-bubble--submit");
    expect(html).toContain("lp-release-bubble--gauge");
    expect(html.match(/class="lp-bubble-arrow"/g)).toHaveLength(2);
    expect(html).toContain("Clique sur la fresque pour préparer ton dessin, Valider l&#x27;envoie");
    expect(html).toMatch(/Ta jauge se recharge toute seule\s: 1 pixel toutes les 10 s/); // l'espace insécable d'avant « : »
    expect(html).toContain("lp-release-aim--submit");
    expect(html).toContain("lp-release-aim--gauge");
    expect(html).toContain(">Valider<");
    expect(html).toContain(">Tutoriel<");
    expect(html).toContain("Revoir le tuto");
    expect(html).toContain("Le tuto repart du début");
    expect(html).toContain("lp-release-veil");
    expect(html).not.toMatch(INLINE_STYLE);
  });

  // Les bulles et la fenêtre disent la langue de la page : jamais de français dans la page en anglais
  it("writes the bubbles and the window in the language of the page", () => {
    const html = still("help", "en");

    expect(html).toContain("Click the canvas to prepare your drawing, then Confirm to send it");
    expect(html).toContain("Your gauge refills on its own: 1 pixel every 10 s");
    expect(html).toContain(">Confirm<");
    expect(html).toContain(">Tutorial<");
    expect(html).toContain("Replay the tutorial");
    expect(html).toContain("The tutorial starts over");
    expect(html).not.toContain("Valider");
  });

  // Hello world! : le choix de la langue (Français, English), English choisi ; les mots de la pill écrits dans les deux langues, quelle que soit celle de la page
  it("shows the language choice with English chosen, and the pill words written in both languages", () => {
    for (const locale of ["fr", "en"] as const) {
      const html = still("language", locale);
      const options = [
        ...html.matchAll(
          /<span class="lp-segmented-option lp-type-body( is-selected)?" data-tap="([^"]+)"[^>]*>([^<]+)</g,
        ),
      ];

      expect(options.map(([, , language, name]) => [language, name])).toEqual([
        ["fr", "Français"],
        ["en", "English"],
      ]);
      expect(options.flatMap(([, selected, language]) => (selected ? [language] : []))).toEqual(["en"]);
      expect(html).toContain('data-locale="en"');
      expect(html).toContain(">Dessiner<");
      expect(html).toContain(">Draw<");
      expect(html).toContain("lp-release-in-fr");
      expect(html).toContain("lp-release-in-en");
      expect(html).toContain("lp-gauge is-full");
      expect(html).not.toMatch(INLINE_STYLE);
    }
  });
});

describe("Mobile app and Live on Twitch (server HTML, still image)", () => {
  const still = (kind: keyof typeof THUMBNAILS, locale: "fr" | "en" = "fr"): string =>
    inLocale(locale, createElement(THUMBNAILS[kind]));

  // App mobile : l'appli ouverte (par défaut), l'écran d'accueil écrit en dessous avec l'icône « LP » aux teintes sombres et son nom « LP », aucun doigt
  it("shows the app open on the phone, the home screen written under it with the LP icon and its name", () => {
    const html = still("install");

    expect(html).toContain("lp-release-phone");
    expect(html).toContain("lp-release-home");
    expect(html).toContain("lp-release-app");
    expect(html).toMatch(/<svg class="lp-release-app-icon" viewBox="0 0 100 100" data-appearance="dark"/);
    expect(html).toMatch(/lp-release-app-letters"[^>]*>LP</);
    expect(html).toContain('<span class="lp-release-app-name">LP</span>');
    expect(html).toContain('data-tap="app"');
    expect(html.match(/lp-release-app-icon lp-release-app-icon--other/g)).toHaveLength(19);
    expect(html).toContain("lp-release-touch");
    expect(html).not.toMatch(INLINE_STYLE);
  });

  // L'appli ouverte montre les pills du jeu, dans la langue de la page : la pill Compte (la photo d'un viewer) et la pill Dessin (la jauge pleine et Dessiner)
  it("shows the game pills inside the phone, the Draw pill in the language of the page", () => {
    const html = still("install");

    expect(html.match(/lp-avatar /g)).toHaveLength(1);
    expect(html).toContain("lp-gauge is-full");
    expect(html).toContain(">20/20<");
    expect(html).toContain(">Dessiner<");
    expect(still("install", "en")).toContain(">Draw<");
    expect(still("install", "en")).not.toContain("Dessiner");
  });

  // Rien dans le téléphone n'est un vrai lien, ni une image : des `<span>` et un SVG
  it("has no link and no image in the phone", () => {
    const html = still("install");

    expect(html).not.toMatch(/<a[\s>]|href=|<img|twitch\.tv/);
  });

  // En live sur Twitch : la pill Inspection de Kira, son bouton Twitch dans ses deux états superposés (le logo seul, et en live avec « Art »), la case entourée
  it("shows the Inspection pill with the Twitch button live and its category, the plain logo written under it", () => {
    const html = still("live");

    expect(html).toContain("lp-release-inspection");
    expect(html).toContain(">Kira<");
    expect(html).toContain("lp-release-twitch-off");
    expect(html).toMatch(/lp-btn lp-btn--live lp-type-caption lp-release-twitch-on/);
    expect(html).toContain("lp-twitch-live-dot");
    expect(html).toContain('<span class="lp-live-category">Art</span>');
    expect(html).toContain("(12, 9)");
    expect(html).toContain(`fill="${PALETTE[8]}"`);
    expect(html).toContain('data-part="ring" opacity="1"');
    expect(html).toContain("lp-release-pointer");
    expect(html).not.toMatch(INLINE_STYLE);
  });

  // Le bouton est dessiné, pas le vrai : ni lien vers Twitch, ni image
  it("has no link to Twitch and no image: the button is drawn, not the real link", () => {
    const html = still("live");

    expect(html).not.toMatch(/<a[\s>]|href=|<img|twitch\.tv/);
    expect(still("live", "en")).toContain('<span class="lp-live-category">Art</span>');
  });

  // Un thème pour la fresque : la pill Thème (« Dessine sur le thème », le thème), la fenêtre écrite sous son voile avec son champ (libellé, exemple,
  // lettres écrites, phrase d'aide), le toast, aucun `style` ni image ; la souris est écrite, cachée par le CSS
  it("shows the Theme pill with its theme, the window and its field written under the veil, no style and no image", () => {
    const html = still("theme");

    expect(html).toContain("lp-pill--title");
    expect(html).toContain("lp-release-pill--top-center");
    expect(html).toContain('<span class="lp-type-caption lp-muted">Dessine sur le thème</span>');
    expect(html).toContain('<span class="lp-type-heading lp-release-theme-text">Aventure</span>');
    expect(html).toContain("lp-release-veil");
    expect(html).toContain('<span class="lp-type-body">Thème</span>');
    expect(html).toContain('<span class="lp-release-placeholder">Ex. : Halloween</span>');
    expect(html).toContain("Affiché en haut de la fresque, pour tout le monde.");
    expect(html).toContain("Thème enregistré");
    expect(html).toContain('data-target="field"');
    expect(html).toContain('data-focused="false"');
    expect(html).toContain('data-empty="false"');
    expect(html.match(/class="lp-release-letter is-written" data-letter="\d"/g)).toHaveLength(8);
    expect([...html.matchAll(/data-letter="\d">([^<]*)</g)].map(([, letter]) => letter).join("")).toBe(
      "Aventure",
    );
    expect(html.match(/<svg class="lp-release-svg lp-release-mini"/g)).toHaveLength(1);
    expect(html).toContain("lp-release-pointer");
    expect(html).not.toMatch(INLINE_STYLE);
    expect(html).not.toContain("<img");
    expect(html).not.toMatch(/<input/);
    for (const colorIndex of [9, 11, 13, 20, 33, 42]) expect(html).toContain(`fill="${PALETTE[colorIndex]}"`); // l'épée, le coffre et la potion, en couleurs de la palette
  });

  // En anglais : le thème, la pill, le champ et le toast sont ceux de l'anglais
  it("writes the theme, the pill, the field and the toast in English", () => {
    const html = still("theme", "en");

    expect(html).toContain('<span class="lp-type-caption lp-muted">Draw the theme</span>');
    expect(html).toContain('<span class="lp-type-heading lp-release-theme-text">Adventure</span>');
    expect(html).toContain('<span class="lp-type-body">Theme</span>');
    expect(html).toContain("E.g. Halloween");
    expect(html).toContain("Shown at the top of the canvas, for everyone.");
    expect(html).toContain("Theme saved");
    expect(html.match(/class="lp-release-letter is-written" data-letter="\d"/g)).toHaveLength(9);
  });
});

describe("the still image of each animated thumbnail (reduced motion, server)", () => {
  const still = (kind: keyof typeof THUMBNAILS, locale: "fr" | "en" = "fr"): string =>
    inLocale(locale, createElement(THUMBNAILS[kind]));

  // L'archivage : six fresques, chacune avec ses propres pixel arts, la pile de trois en escalier (devant 1, au milieu 0,8, derrière 0,55)
  it("holds six different canvases, three of them stacked in sight: front, middle and back", () => {
    const html = still("archives");
    const canvases = [...html.matchAll(/<g data-canvas="(\d)" opacity="([^"]+)"[^>]*>(.*?)<\/g><\/g>/gs)];
    const opacityOf = (index: string) => canvases.find(([, canvas]) => canvas === index)?.[2];

    expect(html).toContain('data-order="234501"'); // de l'arrière à l'avant : la 0 devant, puis la 1, qui va entrer, tout dessus
    expect(canvases.map(([, index]) => index)).toEqual(["2", "3", "4", "5", "0", "1"]);
    expect(new Set(canvases.map(([, , , drawing]) => drawing)).size).toBe(6);
    expect([opacityOf("0"), opacityOf("5"), opacityOf("4")]).toEqual(["1", "0.8", "0.55"]);
    for (const outOfSight of ["1", "2", "3"]) expect(opacityOf(outOfSight)).toBe("0");
  });

  // Les pixel arts sont dessinés avec des couleurs de la palette : le rouge d'un champignon, l'ambre d'une couronne
  it("draws the pixel arts in palette colors, with no random stroke left", () => {
    const html = still("archives");

    expect(html).toContain('fill="#ec273f"'); // le rouge du champignon et du cœur
    expect(html).toContain('fill="#f3a833"'); // l'ambre de l'étoile, de la couronne
    expect(html).not.toMatch(/style=/);
  });

  // Le fond : les vraies pastilles du jeu (damier, noir, blanc) et celle de l'image, une seule sélectionnée, et un seul aperçu
  it("shows the real swatches of the background, the image one selected, over a single preview", () => {
    const html = still("backgrounds");
    const swatches = [...html.matchAll(/<span class="(lp-swatch[^"]*)" data-option="(\d)"/g)];

    expect(swatches.map(([, classes]) => classes)).toEqual([
      "lp-swatch is-transparent",
      "lp-swatch lp-swatch--png-black",
      "lp-swatch lp-swatch--png-white",
      "lp-swatch lp-release-swatch--image lp-release-swatch--on",
    ]);
    expect(html.match(/lp-release-swatch--on/g)).toHaveLength(1);
    expect(html.match(/<svg class="lp-release-bg-preview"/g)).toHaveLength(1);
    expect(html.match(/<path[^>]*fill="#[0-9a-f]+"[^>]*transform="translate\(26 0\)/g)).toHaveLength(1); // un seul cœur
  });

  // L'image se pose par-dessus le fond blanc, à 40 % comme par défaut dans le jeu, sans `<image>` ni adresse
  it("lays a pixel landscape over the white background at 40 %, with no image file", () => {
    const html = still("backgrounds");

    expect(html).toMatch(/data-layer="black"[^>]*opacity="0"|opacity="0"[^>]*data-layer="black"/);
    expect(html).toMatch(/data-layer="white"[^>]*opacity="1"|opacity="1"[^>]*data-layer="white"/);
    expect(html).toMatch(/<g data-layer="image" opacity="0\.4">/);
    expect(html).not.toMatch(/<image|<img|href=/);
  });

  // Le podium : les pseudos numérotés, les numéros de la place (1, 2, 3 de haut en bas), les pseudos d'abord K, A, N comme les anneaux
  it("writes numbered nicknames beside the rings: the numbers stay on the places, the nicknames follow the rings", () => {
    const html = still("scoreboard");
    const rows = [
      ...html.matchAll(
        /lp-release-slot--(\d)"[^>]*data-avatar="(\d)">.*?lp-rank-name lp-type-body">([^<]+)</g,
      ),
    ];
    const numbers = [
      ...html.matchAll(
        /lp-release-number lp-release-slot--(\d) lp-type-numeric lp-muted">(\d)<sup class="lp-rank-sup">([^<]+)<\/sup>/g,
      ),
    ];

    expect(rows.map(([, slot, , name]) => [slot, name])).toEqual([
      ["1", "Ana"],
      ["2", "Nox"],
      ["0", "Kira"],
    ]);
    expect(numbers.map(([, slot, place, suffix]) => [slot, place, suffix])).toEqual([
      ["0", "1", "er"],
      ["1", "2", "e"],
      ["2", "3", "e"],
    ]);
    // L'initiale de l'anneau est celle du pseudo
    expect(
      [...html.matchAll(/lp-avatar lp-type-title" aria-hidden="true">(\w)</g)].map(([, letter]) => letter),
    ).toEqual(["A", "N", "K"]);
  });

  // Le podium se lit de gauche à droite : la place, puis l'anneau (la photo de profil), puis le pseudo
  it("reads the place, then the ring, then the nickname", () => {
    const html = still("scoreboard");
    const row = html.slice(html.indexOf('data-avatar="0"'));

    expect(html.indexOf("lp-release-number")).toBeLessThan(html.indexOf("lp-release-rank "));
    expect(row.indexOf("lp-rank-ring")).toBeGreaterThanOrEqual(0);
    expect(row.indexOf("lp-rank-ring")).toBeLessThan(row.indexOf("lp-rank-name"));
  });

  // La place s'écrit « 1er », « 2e », « 3e » en français et « 1st », « 2nd », « 3rd » en anglais, en `lp-type-numeric lp-muted`
  it("writes the place as 1er 2e 3e in French and 1st 2nd 3rd in English", () => {
    const places = (html: string) =>
      [...html.matchAll(/lp-type-numeric lp-muted">(\d)<sup class="lp-rank-sup">([^<]+)<\/sup>/g)].map(
        ([, number, suffix]) => `${number}${suffix}`,
      );

    expect(places(still("scoreboard", "fr"))).toEqual(["1er", "2e", "3e"]);
    expect(places(still("scoreboard", "en"))).toEqual(["1st", "2nd", "3rd"]);
  });
});

describe("the lists of each public", () => {
  // Un viewer ne voit que ce qui s'adresse à tous : onze lignes dans cinq publications, toutes avec leur vignette (à droite du texte), et aucun titre de groupe
  it("gives a viewer the eleven lines for everyone, each with a thumbnail, and no group title", () => {
    const html = serverHtml.list(["viewer"]);

    expect(audienceTitlesOf(html)).toEqual([]);
    expect(html.match(/class="lp-release-line"/g)).toHaveLength(11);
    expect(html.match(/class="lp-release-shot"/g)).toHaveLength(11);
    expect(html).toContain("Annuler, refaire");
    expect(html).not.toContain("Archive et recommence");
    expect(html).not.toContain("Modération facile");
  });

  // Un modérateur de la fresque : tous (sans titre) puis modérateurs (titré), dans les deux publications qui lui parlent ; 13 lignes
  it("gives a moderator the everyone lines with no title, then the moderators' with theirs", () => {
    const html = serverHtml.list(["moderator", "viewer"]);

    expect(audienceTitlesOf(html)).toEqual(["Pour les modérateurs", "Pour les modérateurs"]);
    expect(html.match(/class="lp-release-line"/g)).toHaveLength(13);
    expect(html).not.toContain("Archive et recommence");
  });

  // Le streamer sur sa fresque : les trois groupes, les 18 lignes, cinq titres de groupe
  it("gives the owner the three byAudience, five group titles, and the eighteen lines", () => {
    const html = serverHtml.list(AUDIENCES);

    expect(audienceTitlesOf(html)).toHaveLength(5);
    expect(html.match(/class="lp-release-line"/g)).toHaveLength(18);
  });

  // Le titre de la publication de la fenêtre est de niveau 3 sous le titre de la fenêtre ; sur la page, de niveau 2 sous le grand titre
  it("sets the release title one level under the title it sits below", () => {
    expect(serverHtml.list(["viewer"])).toMatch(/<h3 class="lp-type-title">1er novembre<\/h3>/);
    expect(serverHtml.list(AUDIENCES)).toMatch(
      /<h4 class="lp-type-caption lp-muted">Pour les modérateurs<\/h4>/,
    );
    expect(serverHtml.page()).toMatch(/<h3 class="lp-type-title">Pour les modérateurs<\/h3>/);
  });

  // La fenêtre dit les mêmes phrases que la page, dans le même ordre des groupes, mais sans la phrase d'accueil
  it("says the same sentences as the page, in the same order of the byAudience, without its welcome sentence", () => {
    const html = serverHtml.list(AUDIENCES);

    expect(html).toContain("Archive ta fresque, elle garde son lien, et repars sur une fresque vide.");
    expect(html).not.toContain("lp-release-intro");
    expect(html).not.toContain("Ce qui change dans LivePlace");
    expect(audienceTitlesOf(html)).toEqual([
      "Pour les streamers",
      "Pour les modérateurs",
      "Pour les streamers",
      "Pour les modérateurs",
      "Pour les streamers",
    ]);
  });
});

describe("the Nouveautés link of the home page", () => {
  const settings = (locale: "fr" | "en", hasReleaseNotesLink?: boolean) =>
    inLocale(
      locale,
      createElement(HomeSettings, hasReleaseNotesLink === undefined ? {} : { hasReleaseNotesLink }),
    );
  const linkOf = (html: string): string =>
    html.match(/<a [^>]*href="\/nouveautes"[^>]*>.*?<\/a>/s)?.[0] ?? "";

  // Un vrai lien vers /nouveautes, bouton fantôme à icône seule, nommé « Nouveautés » ou « What's new »
  it("is a real link to /nouveautes, a ghost icon button named in the language of the page", () => {
    const french = linkOf(settings("fr"));
    const english = linkOf(settings("en"));

    expect(french).toContain('title="Nouveautés"');
    expect(french).toContain('aria-label="Nouveautés"');
    expect(french).toContain("lp-btn--ghost");
    expect(french).toContain("lp-btn--icon");
    expect(french).toContain("<svg");
    expect(english).toMatch(/title="What(?:&#x27;|')s new"/);
  });

  // À gauche de la langue, avant elle dans le HTML, et aucun point écrit par le serveur
  it("stands left of the language, with no dot written by the server", () => {
    const html = settings("fr");

    expect(html.indexOf('href="/nouveautes"')).toBeGreaterThanOrEqual(0);
    expect(html.indexOf('href="/nouveautes"')).toBeLessThan(html.indexOf('role="radiogroup"'));
    expect(html).not.toContain("lp-avatar-dot");
    expect(html).not.toMatch(INLINE_STYLE);
    // Soutenir LivePlace reste sur l'accueil seul : `/nouveautes` et `/confidentialite` reprennent ces réglages sans lui
    expect(html).not.toContain("lp-btn--support");
    expect(html).not.toContain("<dialog");
  });

  // Les boutons de la langue et de l'apparence ne changent pas : deux boutons, le lien n'en est pas un
  it("leaves the two buttons of the language and the appearance as they were", () => {
    expect(settings("fr").match(/<button/g)).toHaveLength(2);
  });

  // Sur /nouveautes même, le lien manque
  it("is left out on the page of the Nouveautés itself", () => {
    expect(linkOf(settings("fr", false))).toBe("");
  });
});

describe("the route /nouveautes", () => {
  const titleFor = async (locale: "fr" | "en") => {
    const head = await Route.options.head?.({
      matches: [{ loaderData: { betaLabel: null, locale } }],
    } as never);
    return head?.meta?.find((tag) => tag && "title" in tag)?.title;
  };

  // Le serveur écrit le titre de l'onglet dans la langue que la racine a rendue
  it("writes the title of the tab in the language the root rendered", async () => {
    expect(await titleFor("fr")).toBe("Nouveautés · LivePlace");
    expect(await titleFor("en")).toBe("What's new · LivePlace");
  });

  // La route lie la feuille de l'accueil : sans elle, la page n'aurait ni ses marges ni son en-tête
  it("links the stylesheet of the home page", async () => {
    const head = await Route.options.head?.({
      matches: [{ loaderData: { betaLabel: null, locale: "fr" } }],
    } as never);

    expect(head?.links?.some((link) => link?.rel === "stylesheet")).toBe(true);
  });

  // Passe avant `/{login}`, comme `/confidentialite` : l'adresse est un fichier de routes à part, non indexée
  it("is a route of its own, kept out of the sitemap and the robots rules like /confidentialite", () => {
    const sitemap = readFileSync(join(import.meta.dirname, "..", "sitemap", "sitemap-xml.ts"), "utf8");
    const robots = readFileSync(join(import.meta.dirname, "..", "robots", "robots-txt.ts"), "utf8");
    const tree = readFileSync(join(import.meta.dirname, "..", "..", "app", "routeTree.gen.ts"), "utf8");

    expect(tree).toContain("path: '/nouveautes'");
    expect(tree).toContain("path: '/confidentialite'");
    expect(sitemap).not.toContain("nouveautes");
    expect(robots).not.toContain("nouveautes");
  });
});

describe("the style sheet of the Nouveautés (design system)", () => {
  const css = readFileSync(join(import.meta.dirname, "..", "design", "release-notes.css"), "utf8");
  const system = readFileSync(join(import.meta.dirname, "..", "design", "design-system.css"), "utf8");

  // Une couleur vient d'un jeton, jamais d'une valeur écrite dans la feuille
  it("writes no color: every one comes from a token", () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  });

  // Le voile du design system, et un flou sur tout ce qui est derrière, fenêtre comprise
  it("blurs what stands behind the enlarged thumbnail, with the usual scrim", () => {
    const zoom = css.slice(css.indexOf(".lp-zoom {"), css.indexOf("}", css.indexOf(".lp-zoom {")));

    expect(zoom).toContain("background: var(--scrim);");
    expect(zoom).toContain("backdrop-filter: blur(var(--pill-blur));");
  });

  // Au PC, quatre fois la taille de la vignette ; sur un écran étroit, la largeur de l'écran moins 32 px (deux marges)
  it("opens at four times the size on a PC, and at the width of the screen minus two margins on a phone", () => {
    expect(css).toContain("4 * 112px");
    expect(css).toContain("100vw - 2 * var(--space-4)");
  });

  // Sans animation d'ouverture sous `prefers-reduced-motion` : la durée vient du jeton, que tokens.css met à zéro
  it("animates the opening with the duration token, which reduced motion sets to zero", () => {
    expect(css).toContain("animation: lp-zoom-in var(--lp-dur) var(--lp-ease);");
    expect(readFileSync(join(import.meta.dirname, "..", "design", "tokens.css"), "utf8")).toMatch(
      /prefers-reduced-motion: reduce\)[^}]*--lp-dur: 0s;/s,
    );
  });

  // La feuille est liée une fois, avec le design system : le jeu et la page la reçoivent
  it("is imported by the design system", () => {
    expect(system).toContain('@import "./release-notes.css";');
  });
});
