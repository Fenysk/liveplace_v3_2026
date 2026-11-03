import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TWITCH_AVATAR_ORIGIN } from "../../shared/twitch-avatar-origin";
import type { Locale } from "../locale/locale";
import { LocaleProvider } from "../locale/use-locale";
import { DESIGN_TEXTS } from "./design-texts";
import { SupportButton, SupportPill, SupportWindow } from "./support";

// CDC 2026, Soutenir LivePlace : un don va à LivePlace, jamais à un streamer. Le bouton ouvre une petite fenêtre dont le bouton
// « Faire un don » mène à Ko-fi, la pill vit en bas à gauche d'une fresque pour tous, et le CSS l'efface en Dessin. Les garde-fous
// lisent le rendu et les règles du CSS.

const read = (file: string) => readFileSync(join(import.meta.dirname, file), "utf8");
const WEB_SOURCE = join(import.meta.dirname, "..", "..");

const doNothing = (): void => undefined;

const inLocale = (locale: Locale, element: ReactElement): string =>
  renderToStaticMarkup(createElement(LocaleProvider, { initial: locale }, element));

const listSources = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listSources(path);
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts") ? [path] : [];
  });

const sourcesOf = (prefix: string): { name: string; text: string }[] =>
  listSources(WEB_SOURCE)
    .map((path) => ({
      name: relative(WEB_SOURCE, path).replaceAll("\\", "/"),
      text: readFileSync(path, "utf8"),
    }))
    .filter(({ name }) => name.startsWith(prefix));

describe("le bouton Soutenir LivePlace (CDC 2026, Soutenir LivePlace)", () => {
  // Un vrai bouton, plus un lien : il ouvre la fenêtre, qui seule porte l'adresse de Ko-fi (vide tant qu'elle est fermée)
  it("is a button that opens the window, carrying no link and no Ko-fi address itself", () => {
    const markup = inLocale("fr", createElement(SupportButton, { onOpen: doNothing }));

    expect(markup).toMatch(/^<button type="button"/);
    expect(markup).not.toContain("<a ");
    expect(markup).not.toContain("href=");
    expect(markup).not.toContain("target=");
    expect(markup).not.toContain("ko-fi.com");
    expect(markup).not.toContain("<dialog");
  });

  // Un cœur et le texte, rose clair : une variante du bouton, pas un autre composant
  it("shows a heart and the text, as a variant of the button", () => {
    const markup = inLocale("fr", createElement(SupportButton, { onOpen: doNothing }));

    expect(markup).toContain("lp-btn lp-type-body lp-btn--support");
    expect(markup).toContain("lucide-heart");
    expect(markup).toContain("<span>Soutenir LivePlace</span>");
    expect(markup).not.toContain("lp-btn--icon");
  });

  // Sans libellé, le cœur seul est nommé par son titre et son nom accessible : le même texte
  it("keeps only the heart without a label, named by its title and its accessible name", () => {
    const markup = inLocale("fr", createElement(SupportButton, { hasLabel: false, onOpen: doNothing }));

    expect(markup).toContain("lp-btn--icon");
    expect(markup).toContain('title="Soutenir LivePlace"');
    expect(markup).toContain('aria-label="Soutenir LivePlace"');
    expect(markup).not.toContain("<span>");
    expect(markup).toMatch(/^<button type="button"/);
    expect(markup).not.toContain("ko-fi.com");
  });

  // L'accueil écrit le nom à côté : `label` remplace le texte seul (nommé par lui, sans titre qui le contredise), et le cœur seul garde le nom complet
  it("writes the label it is given in place of the full name, and keeps the full name on the heart alone", () => {
    for (const [locale, short, full] of [
      ["fr", "Soutenir", "Soutenir LivePlace"],
      ["en", "Support", "Support LivePlace"],
    ] as const) {
      const labelled = inLocale(locale, createElement(SupportButton, { label: short, onOpen: doNothing }));
      const iconOnly = inLocale(
        locale,
        createElement(SupportButton, { hasLabel: false, label: short, onOpen: doNothing }),
      );

      expect(labelled).toContain(`<span>${short}</span>`);
      expect(labelled).toContain("lp-btn--support");
      expect(labelled).not.toMatch(/\stitle=|aria-label|LivePlace/);
      expect(iconOnly).toContain(`title="${full}"`);
      expect(iconOnly).toContain(`aria-label="${full}"`);
      expect(iconOnly).not.toContain("<span>");
    }
  });

  // L'interface est bilingue : le texte, le titre et le nom accessible disent la même chose en anglais
  it("says Support LivePlace in English, the same in its text, title and accessible name", () => {
    const labelled = inLocale("en", createElement(SupportButton, { onOpen: doNothing }));
    const iconOnly = inLocale("en", createElement(SupportButton, { hasLabel: false, onOpen: doNothing }));

    expect(labelled).toContain("<span>Support LivePlace</span>");
    expect(iconOnly).toContain('title="Support LivePlace"');
    expect(iconOnly).toContain('aria-label="Support LivePlace"');
    expect(`${labelled}${iconOnly}`).not.toMatch(/Soutenir/);
  });

  // L'adresse vit à un seul endroit : aucune autre source de l'interface ne l'écrit
  it("keeps the address of the Ko-fi page in one place", () => {
    const writers = sourcesOf("").filter(({ text }) => text.includes("ko-fi.com"));

    expect(writers.map(({ name }) => name)).toEqual(["ui/design/support.tsx"]);
  });

  // Un don va à LivePlace : aucune pill de compte ni de fresque ne porte le bouton
  it("is carried by no pill of an account or of a canvas", () => {
    const pills = [
      "ui/account/account-pill.tsx",
      "ui/canvas/canvas-pill.tsx",
      "ui/canvas/viewport-pill.tsx",
      "ui/draft/draft-pill.tsx",
      "ui/inspection/inspection-pill.tsx",
      "ui/scoreboard/scoreboard-pill.tsx",
      "ui/archive/archive-banner.tsx",
      "ui/design/theme-pill.tsx",
      "ui/design/profile.tsx",
    ];
    const carriers = sourcesOf("")
      .filter(({ name }) => pills.includes(name))
      .filter(({ text }) => /design\/support|\.\/support|SupportButton|SupportPill/.test(text));

    expect(sourcesOf("").filter(({ name }) => pills.includes(name))).toHaveLength(pills.length);
    expect(carriers).toEqual([]);
  });
});

describe("la fenêtre Soutenir LivePlace (CDC 2026, Soutenir LivePlace)", () => {
  const open = (locale: Locale): string =>
    inLocale(locale, createElement(SupportWindow, { isOpen: true, onClose: () => undefined }));
  const closed = (locale: Locale): string =>
    inLocale(locale, createElement(SupportWindow, { isOpen: false, onClose: () => undefined }));

  // Fermée, une petite fenêtre ne laisse ni texte ni lien : tout lecteur de la page y trouve du vide
  it("leaves no text and no link in the page while it is closed", () => {
    for (const locale of ["fr", "en"] as const) {
      const markup = closed(locale);

      expect(markup).toMatch(/^<dialog [^>]*><\/dialog>$/);
      expect(markup).not.toMatch(/ko-fi|Soutenir|Support|<a |<img/);
    }
  });

  // Le titre est le nom du bouton ; sous lui, la phrase forte, la ligne atténuée, la liste, dans un groupe serré
  it("says it in French: the strong sentence, the muted line, then the three reasons in a plain list", () => {
    const markup = open("fr");

    expect(markup).toContain(">Soutenir LivePlace</h2>");
    expect(markup).toContain('<div class="lp-support-lead">');
    expect(markup).toContain('<p class="lp-type-title">LivePlace est gratuit, pour tous.</p>');
    expect(markup).toContain(
      '<p class="lp-type-body lp-muted">Ton soutien paie ce qui le fait tourner :</p>',
    );
    expect(markup).toContain(
      '<ul class="lp-type-body"><li>un serveur qui tient le live</li><li>de la place pour conserver les fresques</li><li>mes soirées de développement</li></ul>',
    );
    expect(markup.indexOf("lp-type-title")).toBeLessThan(markup.indexOf("lp-muted"));
    expect(markup.indexOf("lp-muted")).toBeLessThan(markup.indexOf("<ul"));
  });

  it("says it in English, with no French left", () => {
    const markup = open("en");

    expect(markup).toContain(">Support LivePlace</h2>");
    expect(markup).toContain('<p class="lp-type-title">LivePlace is free, for everyone.</p>');
    expect(markup).toContain("Your support pays for what keeps it running:");
    expect(markup).toContain(
      "<li>a server that handles every pixel live</li><li>room to keep the canvases</li><li>my evenings spent developing it</li>",
    );
    expect(markup).toContain("No big company behind it, just me.");
    expect(markup).toContain("<span>Donate</span>");
    expect(markup).toContain("<span>Close</span>");
    expect(markup).not.toMatch(/Soutenir|gratuit|Faire un don|Fermer|Échap|boîte/);
  });

  // La liste n'a pas de ponctuation finale, et le texte ne parle ni de montant, ni de promesse, ni de badge
  it("ends no list item with a punctuation mark, and names no amount, no promise and no badge", () => {
    const texts = (locale: Locale): string[] => [
      DESIGN_TEXTS[locale].supportFree,
      DESIGN_TEXTS[locale].supportPays,
      ...DESIGN_TEXTS[locale].supportReasons,
      DESIGN_TEXTS[locale].supportSignature,
    ];

    for (const reason of [...DESIGN_TEXTS.fr.supportReasons, ...DESIGN_TEXTS.en.supportReasons])
      expect(reason).not.toMatch(/[.;:,!?]$/);
    expect([...texts("fr"), ...texts("en")].join(" ")).not.toMatch(/\d|[€$£]|badge|merci|thanks/i);
  });

  // Les deux points français s'écrivent avec une espace insécable avant (6d35d79) : « tourner : » ne passe jamais seul à la ligne
  it("glues the French colon to the word before it with a no-break space", () => {
    expect(DESIGN_TEXTS.fr.supportPays).toBe("Ton soutien paie ce qui le fait tourner :");
    expect(DESIGN_TEXTS.en.supportPays).toBe("Your support pays for what keeps it running:");
  });

  // La signature : la photo ronde de Fenysk (l'initiale dessous si elle ne charge pas), son nom, sa phrase atténuée
  it("signs with a round avatar, its initial under the photo, then the name and a muted sentence", () => {
    const markup = open("fr");
    const signature = markup.slice(
      markup.indexOf('<div class="lp-support-signature">'),
      markup.indexOf("</section>"),
    );

    expect(signature).toMatch(
      /<span class="lp-avatar lp-type-title" aria-hidden="true">F<img class="lp-avatar-img" src="https:\/\/static-cdn\.jtvnw\.net\/[^"]+" alt=""/,
    );
    expect(signature).toContain('<span class="lp-type-body">Fenysk</span>');
    expect(signature).toContain(
      '<span class="lp-type-body lp-muted">Pas de grosse boîte derrière, juste moi.</span>',
    );
    expect(markup.indexOf("lp-support-lead")).toBeLessThan(markup.indexOf("lp-support-signature"));
    expect(markup.indexOf("lp-support-signature")).toBeLessThan(markup.indexOf("lp-window-actions"));
  });

  // La photo vient du CDN de Twitch, déjà autorisé par `img-src` (security-headers) ; son adresse vit dans support.tsx seulement
  it("takes the photo from the Twitch CDN the CSP already allows, an address written in one place", () => {
    const photo = /<img [^>]*src="([^"]+)"/.exec(open("fr"))?.[1] ?? "";
    const writers = sourcesOf("").filter(({ text }) => text.includes("jtv_user_pictures"));

    expect(photo.startsWith(`${TWITCH_AVATAR_ORIGIN}/`)).toBe(true);
    expect(writers.map(({ name }) => name)).toEqual(["ui/design/support.tsx"]);
  });

  // En bas à droite : Fermer avec Échap, puis Faire un don, rose, vers Ko-fi dans un nouvel onglet
  it("ends with Close and its Escape key, then Donate, a pink link to Ko-fi in a new tab", () => {
    for (const [locale, close, key, donate] of [
      ["fr", "Fermer", "Échap", "Faire un don"],
      ["en", "Close", "Esc", "Donate"],
    ] as const) {
      const markup = open(locale);
      const actions = markup.slice(
        markup.indexOf('<footer class="lp-window-actions">'),
        markup.indexOf("</footer>"),
      );
      const link = /<a [^>]*>/.exec(actions)?.[0] ?? "";

      expect(actions).toContain(`<span>${close}</span>`);
      expect(actions).toContain(`<span class="lp-kbd lp-type-kbd" aria-hidden="true">${key}</span>`);
      expect(actions.indexOf(close)).toBeLessThan(actions.indexOf(donate));
      expect(link).toContain('href="https://ko-fi.com/fenysk"');
      expect(link).toContain('target="_blank"');
      expect(link).toContain('rel="noopener noreferrer"');
      expect(link).toContain("lp-btn--support");
      expect(actions).toContain("lucide-heart");
      expect(actions).toContain(`<span>${donate}</span>`);
      expect(markup.match(/<a /g)).toHaveLength(1);
    }
  });

  // Écrite par le serveur, sans attribut `style` : la CSP de production le bloque
  it("carries no inline style in the HTML the server writes", () => {
    expect(open("fr")).not.toMatch(/\sstyle=/);
    expect(open("en")).not.toMatch(/\sstyle=/);
  });

  // L'adresse de Ko-fi est celle du bouton, à un seul endroit : la fenêtre ne l'écrit qu'une fois
  it("writes the Ko-fi address once", () => {
    expect(open("fr").match(/ko-fi\.com/g)).toHaveLength(1);
  });
});

describe("la fenêtre Soutenir LivePlace, ses règles (support.css)", () => {
  const css = read("support.css");

  // Les trois lignes du haut sont groupées serré : un --space-2 entre elles, alors que le corps garde son espace normal
  it("groups the strong sentence, the muted line and the list with one --space-2 between them", () => {
    const lead = /\.lp-support-lead \{([^}]*)\}/.exec(css)?.[1] ?? "";

    expect(lead.replace(/\s+/g, " ")).toContain("display: grid;");
    expect(lead.replace(/\s+/g, " ")).toContain("gap: var(--space-2);");
    expect(css).toMatch(/\.lp-support-lead p \{\s*margin: 0;\s*\}/);
  });

  // La liste garde ses puces par défaut : ni `list-style`, ni puce dessinée
  it("keeps the default bullets of the list", () => {
    expect(css).not.toContain("list-style");
    expect(css).not.toContain("::marker");
  });

  // La signature est une ligne : l'avatar d'un contrôle, puis deux lignes de texte l'une sous l'autre
  it("lays the signature out as a row: the avatar, then the name above its sentence", () => {
    const row = /\.lp-support-signature \{([^}]*)\}/.exec(css)?.[1] ?? "";
    const text = /\.lp-support-signature-text \{([^}]*)\}/.exec(css)?.[1] ?? "";

    expect(row.replace(/\s+/g, " ")).toContain("display: flex;");
    expect(row.replace(/\s+/g, " ")).toContain("align-items: center;");
    expect(row.replace(/\s+/g, " ")).toContain("gap: var(--space-3);");
    expect(text.replace(/\s+/g, " ")).toContain("display: grid;");
  });

  // Une classe, jamais une couleur ni une taille écrites : les jetons existants suffisent
  it("writes no color and no font size", () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    expect(css).not.toContain("font-size");
  });
});

describe("la pill Soutenir (CDC 2026, Soutenir LivePlace)", () => {
  // Pour tous, un invité compris : rien ne la conditionne, elle ne lit ni compte ni fresque
  it("is a pill for everyone, in the bottom left corner, carrying the button", () => {
    const markup = inLocale("fr", createElement(SupportPill));

    expect(markup).toContain('data-dock="bl"');
    expect(markup).toContain('<button type="button"');
    expect(markup).not.toContain("ko-fi.com");
    expect(markup).toContain("Soutenir LivePlace");
    expect(markup).not.toContain("is-hidden");
    expect(markup).not.toContain("inert");
  });

  // Sa fenêtre est à côté d'elle : le CSS cache la pill (Dessin, déplacement de la vue, inspection), et une fenêtre ouverte dedans
  // disparaîtrait avec elle en laissant la page inerte
  it("carries its window next to itself, never inside the pill the CSS hides", () => {
    const markup = inLocale("fr", createElement(SupportPill));
    const pill = markup.slice(0, markup.indexOf("<dialog"));

    expect(markup.match(/<dialog /g)).toHaveLength(1);
    expect(pill).toContain('data-dock="bl"');
    expect(pill).toContain("<button");
    expect(pill.match(/<div/g)).toHaveLength(pill.match(/<\/div>/g)?.length ?? 0);
  });

  // Écrite par le serveur, sans attribut `style` : la CSP de production le bloque
  it("carries no inline style in the HTML the server writes", () => {
    expect(inLocale("fr", createElement(SupportPill))).not.toMatch(/\sstyle=/);
  });

  // Sur /design, elle reste sur place
  it("stays in place without a dock, as on /design", () => {
    expect(inLocale("fr", createElement(SupportPill, { isDocked: false }))).not.toContain("data-dock");
  });

  // Le dock « bl » est un dock que les pills connaissent : bas gauche
  it("is a dock the pills know", () => {
    expect(read("pill.tsx")).toMatch(/export type PillDock = [^;]*"bl"/);
  });
});

describe("la pill Soutenir, ses règles (support.css)", () => {
  const css = read("support.css");
  const dock = '.lp-floating[data-dock="bl"]';
  const block = (selector: string): string => {
    const start = css.indexOf(`${selector} {`);
    return css.slice(start, css.indexOf("}", start));
  };

  // Au PC, en bas à gauche, au bord de la bande de la publicité (sa variable, à 0 tant qu'elle n'existe pas)
  it("sits in the bottom left corner on a PC, against the advertising strip's edge", () => {
    const base = block(`\n${dock}`).replace(/\s+/g, " ");

    expect(base).toContain("bottom: var(--space-4);");
    expect(base).toContain(
      "left: calc(var(--lp-ad-side, 0px) + max(var(--space-4), env(safe-area-inset-left)));",
    );
  });

  // En Dessin, elle s'efface en fondu, puis quitte le clavier et les lecteurs d'écran, au PC comme sur mobile
  it("fades out in Draw mode, then leaves the keyboard and the screen readers, on a PC as on mobile", () => {
    const drafting = block(`html[data-drafting] ${dock}`).replace(/\s+/g, " ");

    expect(drafting).toContain("opacity: 0;");
    expect(drafting).toContain("visibility: hidden;");
    expect(drafting).toContain("visibility 0s linear var(--lp-dur-fade)");
    expect(drafting).toContain("opacity var(--lp-dur-fade) ease");
    expect(css.indexOf(`html[data-drafting] ${dock}`)).toBeLessThan(css.indexOf("@media"));
  });

  // Les durées passent par les jetons, que le mouvement réduit met à 0 : aucune durée écrite ici
  it("takes its durations from the tokens alone, which reduced motion sets to 0", () => {
    expect(css).not.toMatch(/\d(ms|s)\b(?!\s*linear)/);
  });

  // Sur mobile, elle s'efface aussi pendant un geste de vue, contrairement à la barre du bas ; au PC, la règle commune des pills
  it("fades out with the view gesture on mobile, which the bottom bar never does", () => {
    const panning = css.slice(css.indexOf("@media (max-width: 640px), (pointer: coarse) {"));
    const faded = panning.slice(0, panning.indexOf("}")).replace(/\s+/g, " ");

    expect(faded).toContain(`html[data-panning] ${dock} {`);
    expect(faded).toContain("opacity: 0;");
    expect(faded).toContain("visibility: hidden;");
    expect(css).toContain(`html[data-panning] ${dock} > .lp-pill {`);
    expect(css).not.toContain('data-dock="bc"');
  });

  // Sur mobile, au-dessus de la barre du bas, à gauche, à la hauteur de Recentrer, qui est à droite
  it("sits above the bottom bar on mobile, on the left, at the height of Recenter on the right", () => {
    const mobile = css.slice(css.indexOf("@media (max-width: 640px) {"));
    const rule = mobile.slice(0, mobile.indexOf("}")).replace(/\s+/g, " ");
    const pill = read("pill.css");
    const recenter =
      /\.lp-floating\[data-dock="cr"\],\s*\.lp-floating\[data-dock="br"\] \{\s*bottom: calc\(([^;]*)\);/.exec(
        pill,
      )?.[1];

    expect(rule).toContain("left: var(--space-2);");
    expect(recenter).toBeDefined();
    expect(rule.replace(/\s+/g, "")).toContain((recenter ?? "").replace(/\s+/g, ""));
  });

  // Le toast se pose au-dessus d'elle au PC : sa règle de base lit le décalage que la pill pose sur <html>
  it("lifts the toast above itself: the base rule of the toast reads the offset the pill sets", () => {
    const toast = /\.lp-floating\[data-dock="toast"\] \{([^}]*)\}/.exec(read("pill.css"))?.[1] ?? "";

    expect(toast.replace(/\s+/g, " ")).toContain("bottom: calc(var(--space-4) + var(--lp-toast-lift, 0px));");
    expect(css.replace(/\s+/g, " ")).toContain(
      `html:has(${dock}) { --lp-toast-lift: calc(var(--control-size) + 3 * var(--space-2)); }`,
    );
  });

  // Une pill, un espace : le décalage vaut exactement la hauteur d'une pill d'une ligne et un espace
  it("lifts the toast by the height of a one-line pill and a gap", () => {
    // contrôle + 2 marges (la pill) + 1 espace (entre les deux) = contrôle + 3 espaces
    expect(css).toContain("calc(var(--control-size) + 3 * var(--space-2))");
    expect(read("pill.css")).toMatch(
      /--lp-radius-box: calc\(var\(--control-size\) \/ 2 \+ var\(--space-2\)\)/,
    );
  });

  // Elle ne change ni les zones du canvas ni le cadrage d'arrivée : aucune variable de zone n'y est posée
  it("moves no canvas zone: the arrival framing is left as it was", () => {
    expect(css).not.toMatch(/--lp-zone-[a-z-]+\s*:/);
    expect(css).not.toContain("--lp-top-");
    expect(css).not.toContain("--lp-bottom-bar:");
  });

  // L'inspection de mobile couvre sa place, et une bulle qui vise la barre se pose dessus : elle s'efface le temps de l'une ou de l'autre
  it("steps aside for the inspection sheet and for a bubble aimed at the bottom bar", () => {
    expect(css).toContain(`html:has(.lp-floating[data-dock="cr"] > .lp-pill:not(.is-hidden)) ${dock}`);
    expect(css).toContain(`html:has(.lp-bubble--pointing[data-aimed-dock="bc"]:not(.is-hidden)) ${dock}`);
  });

  // Le conseil de première visite monte au-dessus d'elle (mobile, paysage), sauf en Dessin où elle n'est pas là
  it("lifts the first visit hint above itself, except in Draw mode where the pill is gone", () => {
    const hint = ".lp-floating.lp-bubble:not(.lp-bubble--pointing)";

    expect(css.replace(/\s+/g, " ").split(`html:not([data-drafting]):has(${dock}) ${hint} {`)).toHaveLength(
      4,
    );
  });
});

describe("les jetons de Soutenir LivePlace (tokens.css)", () => {
  const tokens = read("tokens.css");
  const sectionOf = (opening: string): string => {
    const start = tokens.indexOf(opening);
    return tokens.slice(start, tokens.indexOf("\n}", start));
  };
  const light = sectionOf(':root,\n[data-appearance="light"] {');
  const dark = sectionOf('[data-appearance="dark"] {');
  const brand = sectionOf(":root {\n  --space-1");

  const toRgb = (hex: string): number[] =>
    [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
  const luminance = (rgb: number[]): number => {
    const [red = 0, green = 0, blue = 0] = rgb.map((channel) => {
      const value = channel / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const contrast = (first: number[], second: number[]): number => {
    const [high = 0, low = 0] = [luminance(first), luminance(second)].sort((left, right) => right - left);
    return (high + 0.05) / (low + 0.05);
  };
  const variableValue = (block: string, name: string): string =>
    new RegExp(`${name}:\\s*([^;]+);`).exec(block)?.[1]?.trim() ?? "";
  const hueOf = (hex: string): number => {
    const [red = 0, green = 0, blue = 0] = toRgb(hex);
    const max = Math.max(red, green, blue);
    const spread = max - Math.min(red, green, blue);
    const sector =
      max === red
        ? ((green - blue) / spread + 6) % 6
        : max === green
          ? (blue - red) / spread + 2
          : (red - green) / spread + 4;
    return sector * 60;
  };

  // Chaque apparence donne les trois jetons du bouton : le fond, son survol, l'encre
  it("gives the three tokens of the button to each appearance, and the pink to both", () => {
    for (const block of [light, dark])
      for (const name of ["--support-bg", "--support-bg-hover", "--support-ink"])
        expect(variableValue(block, name)).not.toBe("");
    expect(variableValue(brand, "--support")).toBe("#e0529c");
  });

  // Le fond est le rose à 16 % sur la pill, 24 % au survol : la recette du live Twitch
  it("tints the background at 16 %, and 24 % when hovered, as the live Twitch button does", () => {
    for (const block of [light, dark]) {
      expect(variableValue(block, "--support-bg")).toBe(
        "color-mix(in srgb, var(--support) 16%, var(--pill-surface))",
      );
      expect(variableValue(block, "--support-bg-hover")).toBe(
        "color-mix(in srgb, var(--support) 24%, var(--pill-surface))",
      );
    }
  });

  // L'encre tient le contraste AA (4,5:1) sur le fond teinté, au repos et au survol, dans les deux apparences
  it("keeps the ink at AA contrast (4.5:1) on the tinted background, resting and hovered, in both appearances", () => {
    const pink = toRgb(variableValue(brand, "--support"));
    for (const block of [light, dark]) {
      const surface = toRgb(variableValue(block, "--pill-surface"));
      const ink = toRgb(variableValue(block, "--support-ink"));
      for (const name of ["--support-bg", "--support-bg-hover"]) {
        const share = Number(/var\(--support\) (\d+)%/.exec(variableValue(block, name))?.[1]) / 100;
        const tinted = pink.map((channel, index) => channel * share + (surface[index] ?? 0) * (1 - share));
        expect(contrast(ink, tinted)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  // Le rose se distingue du rouge des actions destructives : l'encre est loin de la teinte de --danger, dans les deux apparences
  it("keeps the pink apart from the red of the destructive actions", () => {
    for (const block of [light, dark]) {
      const gap = Math.abs(
        hueOf(variableValue(block, "--support-ink")) - hueOf(variableValue(block, "--danger")),
      );
      expect(gap).toBeGreaterThanOrEqual(15);
    }
  });

  // Le bouton lit ses jetons, jamais une couleur écrite
  it("reads its tokens in the button, never a written color", () => {
    const rule = /\.lp-btn--support \{([^}]*)\}/.exec(read("button.css"))?.[1] ?? "";

    expect(rule).toContain("background: var(--support-bg);");
    expect(rule).toContain("color: var(--support-ink);");
    expect(read("button.css")).toMatch(
      /@media \(hover: hover\) \{\s*\.lp-btn--support:hover \{\s*background: var\(--support-bg-hover\);/,
    );
  });
});
