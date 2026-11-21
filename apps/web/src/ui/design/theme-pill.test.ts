import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocaleProvider } from "../locale/use-locale";
import { ThemePill } from "./theme-pill";
import { THEME_BAR_HEIGHT, TOP_LEFT_WIDTH, TOP_RIGHT_WIDTH } from "./top-bar";

// §9.7 : la pill Thème, en haut au centre, pour tout le monde.

const render = (theme: string | undefined, isDocked = true): string =>
  renderToStaticMarkup(createElement(ThemePill, { theme, isDocked }));

const pillCss = readFileSync(join(import.meta.dirname, "pill.css"), "utf8");

describe("la pill Thème (§9.7)", () => {
  // Montre le thème en gros sous un petit texte discret, avec les deux phrases du petit texte : le CSS garde celle de l'écran
  it("shows the theme big under a small discreet text, carrying both phrases of it: the CSS keeps the one for the screen", () => {
    const markup = render("Halloween");

    expect(markup).toContain('<span class="lp-theme-text lp-type-heading">Halloween</span>');
    expect(markup).toContain('class="lp-theme-wide">Dessine sur le thème<');
    expect(markup).toContain('class="lp-theme-narrow">Thème<');
    expect(markup.indexOf("lp-theme-caption")).toBeLessThan(markup.indexOf("lp-theme-text"));
  });

  // Le petit texte et le thème sont frères dans un seul bloc : sur mobile, c'est lui que le `line-clamp` coupe, en un flux
  it("carries the small text and the theme as siblings in one block, for the mobile line clamp to cut as one flow", () => {
    const markup = render("Halloween");

    expect(markup).toContain('<span class="lp-theme-line"><span class="lp-theme-caption');
    expect(markup).toMatch(
      /<\/span><span class="lp-theme-text lp-type-heading">Halloween<\/span><\/span><\/p>/,
    );
  });

  // Pose en haut au centre, dans une pill de texte ; sans dock (/design), elle reste sur place
  it("sits at the top center, as a text pill, and stays in place without a dock", () => {
    expect(render("Halloween")).toContain('data-dock="tc"');
    expect(render("Halloween")).toContain("lp-pill--title");
    expect(render("Halloween", false)).not.toContain("data-dock");
  });

  // Écrit le thème tel quel, jamais comme du HTML : c'est le texte d'un streamer
  it("writes the theme as text, never as HTML: it is a streamer's text", () => {
    const markup = render('<img src=x onerror="alert(1)">');

    expect(markup).not.toContain("<img");
    expect(markup).toContain("&lt;img src=x");
  });

  // Sans thème, ou avec un thème vide, la pill n'existe pas
  it("does not exist without a theme, or with an empty one", () => {
    expect(render(undefined)).toBe("");
    expect(render("")).toBe("");
  });

  // Avec un thème, elle est visible et cliquable à rien : ni cachée, ni lien, ni bouton
  it("is visible with a theme, and nothing to click: not hidden, no link, no button", () => {
    const markup = render("Halloween");

    expect(markup).not.toContain("is-hidden");
    expect(markup).not.toContain("inert");
    expect(markup).not.toMatch(/<(a|button)\b/);
  });

  // Aucun attribut `style` rendu par le serveur : la CSP de la bêta et de la production le bloque (pas celle du dev)
  it("carries no inline style in the HTML the server writes: the CSP of beta and production blocks it", () => {
    for (const theme of ["Halloween", "Grande pixel war de la rentrée des lives"])
      for (const isDocked of [true, false]) {
        expect(renderToString(createElement(ThemePill, { theme, isDocked }))).not.toMatch(/\sstyle=/);
      }
  });
});

describe("la place de la pill Thème dans pill.css (§9.7)", () => {
  // Se coupe entre les pills Canvas et Compte : elle réserve, des deux côtés, la plus large des deux, mesurée
  it("cuts between the Canvas and Account pills: it keeps, on both sides, the wider of the two, as measured", () => {
    expect(pillCss).toContain(
      `--lp-theme-side: calc(2 * var(--space-4) + max(var(${TOP_LEFT_WIDTH}, 260px), var(${TOP_RIGHT_WIDTH}, 260px)));`,
    );
    expect(pillCss).toContain("--lp-theme-room: calc(100vw - 2 * var(--lp-theme-side));");
  });

  // Le contenu garde sa propre taille, que la pill suit et anime : jamais en pourcentage de la pill, sans quoi chaque image
  // de l'animation changerait la taille qu'elle suit, et en relancerait une
  it("lets the content keep its own size, never a percentage of the pill it makes animate: that would loop", () => {
    const content = /\.lp-pill--title \.lp-pill-content\s*\{([^}]*)\}/.exec(pillCss)?.[1] ?? "";

    expect(content).toContain("max-width: var(--lp-theme-room, none);");
    expect(content).not.toMatch(/\d%/);
    expect(content).not.toContain("width: auto");
  });

  // Sur mobile, le toast se pose sous la pill Thème : sa hauteur mesurée, et ses deux espaces ; sans elle, rien ne bouge
  it("puts the toast under the Theme pill on mobile: its measured height and its two gaps, and nothing moves without it", () => {
    const mobile = pillCss.slice(pillCss.lastIndexOf("@media (max-width: 640px) {"));
    const toast = /\[data-dock="toast"\]\s*\{[^}]*top: calc\(([^;]*)\);/.exec(mobile)?.[1] ?? "";

    expect(toast.replace(/\s+/g, " ")).toContain(`var(${THEME_BAR_HEIGHT}) + var(--space-4)`);
    expect(pillCss).toContain(`${THEME_BAR_HEIGHT}: calc(-1 * var(--space-4));`);
    // Au PC, le toast reste en bas à gauche : sa règle de base ne lit rien de la pill Thème
    const base = /\.lp-floating\[data-dock="toast"\]\s*\{([^}]*)\}/.exec(pillCss)?.[1] ?? "";
    expect(base).not.toContain(THEME_BAR_HEIGHT);
  });

  // Sur mobile, tant qu'une fenêtre est ouverte, la feuille couvre le dessous de la pill Thème : le toast garde sa place
  // d'avant, sous les pills Canvas et Compte, sans le décalage de la pill ; la règle ne vit que sur mobile
  it("keeps the toast under the Canvas and Account pills while a window is open on mobile, without the Theme pill's offset", () => {
    const opened = /html:has\(dialog\[open\]\) \.lp-floating\[data-dock="toast"\]\s*\{([^}]*)\}/.exec(
      pillCss,
    );
    const top = /top: calc\(([^;]*)\);/.exec(opened?.[1] ?? "")?.[1] ?? "";

    expect(top.replace(/\s+/g, " ")).toBe(
      "max(var(--space-2), env(safe-area-inset-top)) + var(--control-size-touch) + var(--space-4)",
    );
    expect(top).not.toContain(THEME_BAR_HEIGHT);
    expect(opened?.index).toBeGreaterThan(pillCss.lastIndexOf("@media (max-width: 640px) {"));
    // Il vient après la règle qui décale le toast sous la pill : à égalité de rang, la dernière gagne
    const shifted = pillCss.indexOf(
      `var(${THEME_BAR_HEIGHT})`,
      pillCss.lastIndexOf("@media (max-width: 640px) {"),
    );
    expect(opened?.index).toBeGreaterThan(shifted);
  });
});

const renderEvent = (theme: string | undefined, eventTitle: string | undefined): string =>
  renderToStaticMarkup(createElement(ThemePill, { theme, eventTitle }));
const themeCss = readFileSync(join(import.meta.dirname, "theme-pill.css"), "utf8");
const toastCss = readFileSync(join(import.meta.dirname, "donation-toast.css"), "utf8");

describe("le titre de l'événement dans la pill Thème (CDC 2026, Mode événement)", () => {
  // La pastille est au-dessus du thème, dans la même pill, sans icône
  it("puts the title in a pill above the theme, in the same pill, without an icon", () => {
    const markup = renderEvent("Halloween", "Live caritatif");

    expect(markup).toContain('<span class="lp-event-title-text">Live caritatif</span>');
    expect(markup).not.toContain("<svg");
    expect(markup.indexOf("lp-event-title")).toBeLessThan(markup.indexOf("lp-theme-line"));
    expect(markup.match(/lp-pill /g)?.length).toBe(1);
  });

  // Sans thème la pastille reste seule ; sans titre, la pill est celle du thème ; sans rien, il n'y a pas de pill
  it("keeps the title alone without a theme, the theme alone without a title, and no pill without either", () => {
    expect(renderEvent(undefined, "Live caritatif")).not.toContain("lp-theme-line");
    expect(renderEvent(undefined, "Live caritatif")).toContain("Live caritatif");
    expect(renderEvent("Halloween", undefined)).not.toContain("lp-event-title");
    expect(renderEvent("Halloween", undefined)).not.toContain("lp-pill--claim");
    expect(renderEvent(undefined, undefined)).toBe("");
  });

  // Sans thème, la pastille est la pill elle-même, avec son cadre arc-en-ciel. Avec un thème, la pill reste blanche, et le cadre est celui de la pastille.
  it("makes the pill itself the rainbow frame when the title is alone, and keeps it white with a theme", () => {
    expect(renderEvent(undefined, "Live caritatif")).toMatch(/class="lp-pill lp-pill--title lp-pill--claim"/);
    expect(renderEvent("Halloween", "Live caritatif")).not.toContain("lp-pill--claim");
    expect(themeCss).toMatch(
      /\.lp-event-title,\s*\.lp-pill--claim \{\s*position: relative;\s*overflow: hidden;/,
    );
    expect(themeCss).toMatch(/\.lp-event-frame-boost \{[^}]*background: var\(--event-rainbow\)/);
  });

  // Au mobile, la pastille seule se resserre sur elle, centrée, au lieu de remplir la bande
  it("shrinks the lone pill to its content, centered, on a phone", () => {
    expect(themeCss).toMatch(
      /\.lp-floating\[data-dock="tc"\] > \.lp-pill\.lp-pill--claim \{\s*width: max-content;\s*max-width: calc\(100vw - 2 \* var\(--space-4\)\);\s*margin-inline: auto;/,
    );
  });

  // Le titre est le texte d'un streamer : jamais du HTML
  it("writes the title as text, never as HTML", () => {
    const markup = renderEvent(undefined, '<img src=x onerror="alert(1)">');

    expect(markup).not.toContain("<img");
    expect(markup).toContain("&lt;img src=x");
  });

  // La pastille est blanche, sans fond doré ni encre de jeton ; au mobile le titre tient sur deux lignes
  it("paints the pill white with a rainbow frame, no gold background, and clamps the title to two lines on a phone", () => {
    expect(themeCss).toMatch(/\.lp-event-body \{[^}]*background: var\(--pill-surface\)/);
    expect(themeCss).not.toContain("var(--event)");
    expect(themeCss).not.toContain("var(--on-event)");
    expect(themeCss).not.toContain("var(--claim)");
    expect(themeCss).toMatch(/\.lp-event-title-text \{[^}]*line-clamp: 2/);
  });

  // Le titre est au niveau « heading » (20 px) et n'a plus de cœur
  it("sets the title at the heading size, with no heart", () => {
    expect(renderEvent("Halloween", "Live caritatif")).toContain(
      '<p class="lp-event-heading lp-type-heading">',
    );
    expect(themeCss).not.toMatch(/\.lp-event-title svg/);
  });

  // Le cadre est de 3 px, fait un tour en 12 s, trois tours de plus au survol, et reste fixe en mouvement réduit
  it("frames the pill with 3 px, turns once in 12 s, adds 3 turns on hover, and stays still with reduced motion", () => {
    expect(themeCss).toMatch(/\.lp-event-title \{[^}]*padding: 3px;/);
    expect(themeCss).toMatch(/animation: lp-event-frame-turn 12s linear infinite;/);
    expect(themeCss).toMatch(/@keyframes lp-event-frame-turn \{\s*to \{\s*rotate: 360deg;/);
    expect(themeCss).toMatch(
      /\.is-boosting \{\s*animation: lp-event-frame-boost 2\.6s cubic-bezier\(0\.45, 0, 0\.25, 1\);/,
    );
    expect(themeCss).toMatch(/@keyframes lp-event-frame-boost \{\s*to \{\s*rotate: 1080deg;/);
    expect(themeCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.lp-event-frame,\s*\.lp-event-frame-boost\.is-boosting \{\s*animation: none;/,
    );
  });

  // Deux couches imbriquées, sans classe de survol au repos
  it("nests two frame layers before the white body, with no boost class at rest", () => {
    const markup = renderEvent("Halloween", "Live caritatif");

    expect(markup).toContain(
      '<span class="lp-event-frame" aria-hidden="true"><span class="lp-event-frame-boost"></span></span><div class="lp-event-body">',
    );
    expect(markup).not.toContain("is-boosting");
  });

  // Les sept couleurs du cadre sont des jetons, jamais écrites dans le composant
  it("defines the seven frame colors as tokens, in the light and in the dark theme, and writes none in the component", () => {
    const tokens = readFileSync(join(import.meta.dirname, "tokens.css"), "utf8");

    for (const index of [1, 2, 3, 4, 5, 6, 7])
      expect(tokens.match(new RegExp(`--event-rainbow-${index}: #[0-9a-f]{6};`, "g"))).toHaveLength(2);
    expect(tokens.match(/--event-rainbow: conic-gradient\(/g)).toHaveLength(2);
    expect(tokens).not.toContain("--event:");
    expect(themeCss).not.toMatch(/#[0-9a-f]{3,6}\b/i);
  });

  // La ligne (compte à rebours, « En cours » ou fin) est sous le titre, dans la pastille, en petit et en gris ; sans elle, rien
  it("puts the line under the title, small and muted, and nothing without it", () => {
    const markup = renderToStaticMarkup(
      createElement(ThemePill, {
        theme: "Halloween",
        eventTitle: "Live caritatif",
        eventLine: "Commence dans 2 j 5 h",
      }),
    );

    expect(markup).toContain('<p class="lp-event-line lp-type-numeric lp-muted">Commence dans 2 j 5 h</p>');
    expect(markup.indexOf("lp-event-title")).toBeLessThan(markup.indexOf("lp-event-line"));
    expect(markup.indexOf("lp-event-line")).toBeLessThan(markup.indexOf("</div></div>"));
    expect(markup.indexOf("lp-event-line")).toBeLessThan(markup.indexOf("lp-theme-line"));
    expect(renderEvent("Halloween", "Live caritatif")).not.toContain("lp-event-line");
    expect(renderToStaticMarkup(createElement(ThemePill, { theme: undefined, eventLine: "x" }))).toBe("");
  });

  // Avec une adresse de don, le titre et la ligne sont un lien vers un nouvel onglet, au nom accessible complet ; le bouton « + » reste dehors
  it("wraps the title and the line in a donation link when there is an address, and nothing without one", () => {
    const donation = { donation: { id: 1, donor: "lunaa", amountCents: 500 }, onClaim: () => undefined };
    const linked = renderToStaticMarkup(
      createElement(ThemePill, {
        theme: "Halloween",
        eventTitle: "Live caritatif",
        eventLine: "En cours",
        eventHref: "https://streamlabscharity.com/@exemple/soiree",
        donation,
      }),
    );

    expect(linked).toContain(
      '<a class="lp-event-link" href="https://streamlabscharity.com/@exemple/soiree" target="_blank" rel="noopener noreferrer" aria-label="Live caritatif, faire un don (nouvel onglet)">',
    );
    const link = linked.slice(linked.indexOf("<a "), linked.indexOf("</a>"));
    expect(link).toContain("Live caritatif");
    expect(link).toContain("En cours");
    expect(link).not.toContain("<button");
    expect(linked.indexOf("</a>")).toBeLessThan(linked.indexOf("<button"));
    expect(linked.match(/<a /g)).toHaveLength(1);

    const plain = renderToStaticMarkup(
      createElement(ThemePill, { theme: "Halloween", eventTitle: "Live caritatif", eventLine: "En cours" }),
    );
    expect(plain).not.toContain("<a ");
    expect(plain).not.toContain("href");
  });

  // Le nom accessible du lien est dit en anglais aussi, et le CSS lui donne le curseur et un focus visible
  it("names the link in English and styles it with a pointer and a visible focus", () => {
    const en = renderToStaticMarkup(
      createElement(
        LocaleProvider,
        { initial: "en" },
        createElement(ThemePill, {
          theme: undefined,
          eventTitle: "Charity night",
          eventHref: "https://streamlabscharity.com/@example/night",
        }),
      ),
    );
    expect(en).toContain('aria-label="Charity night, donate (new tab)"');
    expect(themeCss).toMatch(/\.lp-event-link \{[^}]*cursor: pointer;/);
    expect(themeCss).toMatch(/\.lp-event-link:focus-visible/);
  });

  // Le toast d'un don n'est plus une pill à part posée sous le bloc : sa couche, et tout ce qui la plaçait, ont disparu
  it("has no separate donation layer under the block any more", () => {
    expect(toastCss).not.toContain("lp-donation-layer");
    expect(toastCss).not.toContain("--lp-theme-bar");
  });

  // Sans titre, pas de ligne de don : la ligne vit dans le bloc de l'événement, qui existe tant qu'il a un titre
  it("opens the donation line only while the event title is shown", () => {
    const donation = { donation: { id: 1, donor: "lunaa", amountCents: 500 }, onClaim: () => undefined };
    const withTitle = renderToStaticMarkup(
      createElement(ThemePill, { theme: "Halloween", eventTitle: "Live caritatif", donation }),
    );
    const withoutTitle = renderToStaticMarkup(createElement(ThemePill, { theme: "Halloween", donation }));

    expect(withTitle).toContain("lp-donation-rule");
    expect(withTitle.indexOf("lp-theme-line")).toBeLessThan(withTitle.indexOf("lp-donation-rule"));
    expect(withoutTitle).not.toContain("lp-donation");
    expect(withoutTitle).not.toContain('role="status"');
  });

  // Avec un thème, la ligne est séparée du thème par un trait fin ; sans thème, elle s'ouvre dans le cadre arc-en-ciel, sur le fond blanc du titre, sans trait
  it("separates the line from the theme by a thin rule, or opens it white inside the rainbow frame", () => {
    expect(toastCss).toMatch(/\.lp-donation-rule \{[^}]*height: 1px;[^}]*background: var\(--chip-hover\)/);
    expect(toastCss).toMatch(/\.lp-theme ~ \.lp-donation-rule \{\s*display: block/);
    expect(toastCss).toMatch(
      /\.lp-pill--claim \.lp-donation \{[^}]*align-self: stretch;[^}]*margin-inline: calc\(var\(--space-1\) - var\(--space-3\)\)/,
    );
    const alone = renderToStaticMarkup(
      createElement(ThemePill, {
        theme: undefined,
        eventTitle: "Live caritatif",
        donation: { donation: { id: 1, donor: "lunaa", amountCents: 500 }, onClaim: () => undefined },
      }),
    );
    expect(alone.indexOf("lp-event-body")).toBeLessThan(alone.indexOf("lp-donation"));
    expect(alone.indexOf("lp-donation")).toBeLessThan(alone.lastIndexOf("</div></div>"));
  });

  // Sur un téléphone, la bulle d'aide de la rangée du haut s'efface tant que la pastille est là, au lieu de la recouvrir
  it("hides the help bubble of the top row on a phone while the title is shown", () => {
    expect(themeCss).toMatch(
      /@media \(max-width: 640px\) \{\s*html:has\(\.lp-event-body\) \.lp-bubble:is\(\[data-aimed-dock="tl"\], \[data-aimed-dock="tr"\]\)/,
    );
  });
});
