import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ThemePill } from "./theme-pill";
import { THEME_BAR_HEIGHT, TOP_LEFT_WIDTH, TOP_RIGHT_WIDTH } from "./top-bar";

// Écart §8.1 (JOURNAL 2026-10-07) : la pill Thème, en haut au centre, pour tout le monde.

const render = (theme: string | undefined, isDocked = true): string =>
  renderToStaticMarkup(createElement(ThemePill, { theme, isDocked }));

const pillCss = readFileSync(join(import.meta.dirname, "pill.css"), "utf8");

describe("la pill Thème (Écart §8.1, JOURNAL 2026-10-07)", () => {
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

describe("la place de la pill Thème dans pill.css (Écart §8.1, JOURNAL 2026-10-07)", () => {
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
