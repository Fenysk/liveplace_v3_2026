import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Flag } from "lucide-react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Chip } from "./chip";

const read = (file: string): string => readFileSync(join(import.meta.dirname, file), "utf8");
const chipCss = read("chip.css");
const tokens = read("tokens.css");

describe("la pastille (JOURNAL 2026-11-04)", () => {
  // Une pastille dit un nom, avec l'icône du bouton à sa gauche, muette
  it("writes the name, with the icon of the button on its left, hidden from screen readers", () => {
    const html = renderToStaticMarkup(createElement(Chip, { label: "Signaler", icon: Flag }));

    expect(html).toMatch(/^<span class="lp-chip"><svg [^>]*aria-hidden="true">.*<\/svg>Signaler<\/span>$/);
  });

  // Sans icône (Inspection, Classement), le nom seul
  it("writes the name alone when the button has no icon", () => {
    expect(renderToStaticMarkup(createElement(Chip, { label: "Inspection" }))).toBe(
      '<span class="lp-chip">Inspection</span>',
    );
  });

  // Une couleur de plus par teinte, la neutre n'ajoute rien
  it("adds a class only for the danger and the Twitch tones", () => {
    const classOf = (tone: "neutral" | "danger" | "twitch") =>
      /class="([^"]*)"/.exec(renderToStaticMarkup(createElement(Chip, { label: "Nom", tone })))?.[1];

    expect(classOf("neutral")).toBe("lp-chip");
    expect(classOf("danger")).toBe("lp-chip lp-chip--danger");
    expect(classOf("twitch")).toBe("lp-chip lp-chip--twitch");
  });

  // Ce n'est ni un lien ni un bouton : rien à cliquer, rien à atteindre au clavier, aucun style écrit par le serveur
  it("is neither a link nor a button, takes no focus and writes no inline style", () => {
    const html = renderToStaticMarkup(createElement(Chip, { label: "Signaler", icon: Flag, tone: "danger" }));

    expect(html).not.toMatch(/<(?:a|button)\b|tabindex|role=|href=|onclick|\sstyle=/i);
    expect(html.startsWith("<span ")).toBe(true);
  });
});

describe("la feuille de la pastille (chip.css)", () => {
  // Plate, arrondie à fond, sur le fond des contrôles, en gras 700, et jamais coupée en fin de ligne
  it("draws a flat, fully rounded chip on the control background, bold, that never breaks across lines", () => {
    const base = /\.lp-chip \{([^}]*)\}/.exec(chipCss)?.[1] ?? "";

    // En ligne : en bloc en ligne, la phrase se couperait entre « l' » et la pastille
    expect(base).toMatch(/display: inline;/);
    expect(base).toContain("border-radius: var(--radius-pill);");
    expect(base).toContain("background: var(--chip);");
    expect(base).toContain("font-weight: 700;");
    expect(base).toContain("white-space: nowrap;");
    expect(base).not.toMatch(/box-shadow|border:|transition|transform/);
  });

  // Ce n'est pas un contrôle : ni survol, ni curseur de lien, ni focus
  it("has no hover, no link cursor and no focus style", () => {
    expect(chipCss).not.toMatch(/:hover|:focus|:active|cursor: (?:pointer|default)/);
  });

  // Le rouge de Supprimer mon compte, et l'encre violette sur le fond teinté du bouton live
  it("takes the red of the danger button and the tinted violet of the live button", () => {
    expect(chipCss).toMatch(/\.lp-chip--danger \{\s*color: var\(--danger\);\s*\}/);
    expect(chipCss).toMatch(
      /\.lp-chip--twitch \{\s*background: var\(--twitch-live-bg\);\s*color: var\(--twitch-live-ink\);\s*\}/,
    );
  });

  // Clair et sombre : chaque jeton que la feuille lit change avec l'apparence, et aucune couleur n'est écrite ici
  it("reads only tokens that both appearances define, and writes no color of its own", () => {
    const dark = tokens.slice(tokens.indexOf('[data-appearance="dark"] {'));
    const light = tokens.slice(0, tokens.indexOf('[data-appearance="dark"] {'));

    for (const token of ["--chip", "--ink", "--danger", "--twitch-live-bg", "--twitch-live-ink"]) {
      expect(chipCss).toContain(`var(${token})`);
      expect(light).toContain(`${token}:`);
      expect(dark).toContain(`${token}:`);
    }
    expect(chipCss).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  });

  // La feuille est liée une seule fois, avec celles du design system
  it("is imported by the design system sheet", () => {
    expect(read("design-system.css")).toContain('@import "./chip.css";');
  });
});
