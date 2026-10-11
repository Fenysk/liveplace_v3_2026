import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CopyButton } from "./copy-button";

// Le bouton Copier : Copier et Coché se croisent en fondu, avec une légère mise à l'échelle, à l'aller comme au retour.

const css = readFileSync(join(import.meta.dirname, "copy-button.css"), "utf8").replace(/\s+/g, " ");
const html = renderToStaticMarkup(createElement(CopyButton, { value: "liveplace.tv/kalyss" }));

describe("le bouton Copier, ses deux icônes", () => {
  // Les deux sont dans la page : l'une s'efface pendant que l'autre paraît, au lieu de se remplacer d'un coup
  it("keeps both icons in the page, so one can fade out while the other fades in", () => {
    expect(html.match(/<svg/g)).toHaveLength(2);
    expect(html).not.toContain("is-copied");
  });

  // Le fondu et la mise à l'échelle durent `--lp-dur-fast` et suivent `--lp-ease` : `prefers-reduced-motion` les met à 0
  it("fades and scales them through the motion tokens, which reduced motion sets to zero", () => {
    expect(css).toMatch(
      /\.lp-copy-icon > svg \{[^}]*transition: opacity var\(--lp-dur-fast\) var\(--lp-ease\), transform var\(--lp-dur-fast\) var\(--lp-ease\)/,
    );
    expect(css).not.toMatch(/\d(ms|s)\b/);
  });

  // Une fois copié, Coché prend la place de Copier, et la même transition fait le chemin du retour
  it("shows the check and hides the copy icon once copied", () => {
    expect(css).toMatch(/\.lp-copy-icon > svg:first-child \{[^}]*opacity: 1/);
    expect(css).toMatch(/\.is-copied \.lp-copy-icon > svg:first-child \{[^}]*opacity: 0/);
    expect(css).toMatch(/\.is-copied \.lp-copy-icon > svg:last-child \{[^}]*opacity: 1/);
  });
});
