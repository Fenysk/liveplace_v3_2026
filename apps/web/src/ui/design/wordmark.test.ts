import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Wordmark } from "./wordmark";

const css = readFileSync(join(import.meta.dirname, "wordmark.css"), "utf8");
const designSystemCss = readFileSync(join(import.meta.dirname, "design-system.css"), "utf8");

describe("le mot-symbole « LivePlace » (Écart §9.1, JOURNAL 2026-10-31)", () => {
  // Sans adresse, c'est du texte seul, en Nunito 900 (`lp-type-display`) : ni pill, ni icône, ni forme
  it("writes the name as plain display text when it has no address", () => {
    const html = renderToStaticMarkup(createElement(Wordmark));

    expect(html).toBe('<p class="lp-type-display lp-wordmark">LivePlace</p>');
  });

  // Avec une adresse, le même mot est un lien, et rien d'autre ne l'accompagne
  it("writes the same name as a link to the address it is given", () => {
    const html = renderToStaticMarkup(createElement(Wordmark, { href: "/" }));

    expect(html).toBe('<a class="lp-type-display lp-wordmark" href="/">LivePlace</a>');
    expect(html).not.toMatch(/<svg|<img|<i[ >]|lp-pill|\sstyle=/);
  });

  // Le mot est en encre, sans soulignement, et son lien garde le focus visible du design system
  it("is ink, never underlined, and keeps a visible focus on its link", () => {
    expect(css).toMatch(/\.lp-wordmark\s*\{[^}]*color:\s*var\(--ink\)/);
    expect(css).not.toMatch(/text-decoration:\s*underline/);
    expect(css).toMatch(/\.lp-wordmark:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--focus-ring\)/);
    expect(css).not.toMatch(/logo|pictogram|::before|::after|background/i);
  });

  // La feuille du mot-symbole est liée une seule fois avec le design system, donc sur toutes les pages
  it("is linked with the design system", () => {
    expect(designSystemCss).toContain('@import "./wordmark.css";');
  });
});
