import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RollingNumber } from "./rolling-number";

// Un nombre dont les chiffres défilent quand il change : ce que la page montre avant que rien ne bouge.

const NARROW_SPACE = " ";
const read = (name: string): string => readFileSync(join(import.meta.dirname, name), "utf8");
const css = read("rolling-number.css").replace(/\s+/g, " ");
const render = (value: string): string => renderToStaticMarkup(createElement(RollingNumber, { value }));

describe("le nombre qui défile, au premier affichage", () => {
  // Les lecteurs d'écran lisent la valeur finale une seule fois : le texte entier, jamais les chiffres en cours de défilement
  it("gives screen readers the whole value once, and hides the digits drawn for the eyes", () => {
    const html = render(`1${NARROW_SPACE}234 pixels`);
    expect(html).toContain(`<span class="lp-visually-hidden">1${NARROW_SPACE}234 pixels</span>`);
    expect(html).toContain('<span class="lp-rolling-visual" aria-hidden="true">');
    expect(html.indexOf("lp-visually-hidden")).toBeLessThan(html.indexOf("lp-rolling-visual"));
  });

  // Chaque chiffre a son cadran, et seulement lui : les séparateurs et les unités restent du texte
  it("gives every digit its own dial and nothing else", () => {
    expect(render(`1${NARROW_SPACE}234 pixels`).match(/lp-roll-dial/g)).toHaveLength(4);
    expect(render("dont 3 invités").match(/lp-roll-dial/g)).toHaveLength(1);
    expect(render("—")).not.toContain("lp-roll-dial");
  });

  // Les chiffres d'un nombre ne se coupent jamais à la ligne ; les mots, eux, gardent leurs retours à la ligne
  it("keeps a number whole on one line and leaves the words free to wrap", () => {
    expect(render("dont 3 invités")).toContain('<span class="lp-roll-number">');
    expect(css).toMatch(/\.lp-roll-number \{[^}]*white-space: nowrap/);
    expect(render("dont 3 invités")).not.toContain("white-space");
  });

  // La CSP de production bloque l'attribut `style` du HTML que le serveur écrit : tout passe par des classes
  it("writes no style attribute, which the production CSP would block", () => {
    expect(render(`12${NARROW_SPACE}345 px/h`)).not.toMatch(/\sstyle=/);
  });

  // Rien à l'écran ne montre un chiffre en cours de route : au premier affichage, le nombre est déjà là
  it("shows the shown digit of each dial at rest, with no leaving digit", () => {
    const html = render("42");
    expect(html).toContain('<span class="lp-roll-shown">4</span>');
    expect(html).toContain('<span class="lp-roll-shown">2</span>');
    expect(html).not.toContain("lp-roll-leaving");
  });
});

describe("le nombre qui défile, son style", () => {
  // Le chiffre est une fenêtre d'une ligne, que l'ancien et le nouveau traversent : ils ne débordent pas sur les lignes voisines
  it("clips each dial to its own line, and keeps its leaving digit over it", () => {
    expect(css).toMatch(
      /\.lp-roll-dial \{[^}]*position: relative;[^}]*display: inline-block;[^}]*overflow: clip/,
    );
    expect(css).toMatch(/\.lp-roll-leaving \{[^}]*position: absolute;[^}]*inset: 0/);
  });

  // Les chiffres tabulaires gardent la largeur : rien ne bouge autour
  it("keeps the digits tabular, so nothing moves around the number", () => {
    expect(css).toMatch(/\.lp-rolling \{[^}]*font-variant-numeric: tabular-nums/);
  });

  // La durée et la courbe viennent des tokens, que `prefers-reduced-motion` met à 0 : le CSS n'en écrit aucune
  it("takes its duration and curve from the motion tokens, and the CSS writes none", () => {
    expect(css).not.toMatch(/\d(ms|s)\b/);
    expect(read("rolling-number.tsx")).toContain('motionMs(root, "--lp-dur")');
    expect(read("rolling-number.tsx")).toContain("motionEasing(root)");
  });
});
