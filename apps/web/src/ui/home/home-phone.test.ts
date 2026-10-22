import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocaleProvider } from "../locale/use-locale";
import { HomePage } from "./home-page";
import { targetOf } from "./pixel-grid";

const css = readFileSync(join(import.meta.dirname, "home.css"), "utf8");

const serverHtml = (): string =>
  renderToString(createElement(LocaleProvider, { initial: "fr" }, createElement(HomePage)));

// Le téléphone : tout ce que le serveur écrit entre son cadre et la couche des effets
const phoneOf = (html: string): string =>
  html.slice(html.indexOf('<div class="lp-home-phone"'), html.indexOf('<div class="lp-home-effects"'));

// Le corps d'une règle écrite à la racine de home.css (pas celles des requêtes de conteneur, indentées, ni la seconde ligne
// d'une liste de sélecteurs)
const ruleOf = (selector: string): string => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|(?<!,)\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";
};

// Ce qui s'applique sur un écran étroit : la requête de conteneur de 640 px, jusqu'à la fin du fichier
const narrowPart = css.slice(css.indexOf("@container lp-home (max-width: 640px)"));

describe("the phone of the home page, dressed as an iPhone", () => {
  // Quand le serveur écrit la page, le téléphone porte l'îlot, la barre d'état et la barre d'accueil, décoratifs
  it("writes the island, the status bar and the home bar, hidden from a screen reader", () => {
    const html = serverHtml();
    const phone = phoneOf(html);

    expect(phone.length).toBeGreaterThan(300);
    expect(phone).toContain('<div class="lp-home-chrome" aria-hidden="true">');
    expect(phone).toContain("lp-home-island");
    expect(phone).toContain("lp-home-statusbar");
    expect(phone).toContain("lp-home-homebar");
    expect(phone.indexOf("lp-home-screen")).toBeLessThan(phone.indexOf("lp-home-chrome"));
  });

  // La barre d'état : l'heure à gauche, puis trois formes (réseau, wifi, batterie), sans autre texte
  it("writes the time and three shapes in the status bar, and no other text", () => {
    const phone = phoneOf(serverHtml());

    expect(phone).toContain('<span class="lp-home-time">9:41</span>');
    expect(phone.indexOf("lp-home-time")).toBeLessThan(phone.indexOf("lp-home-signal"));
    for (const shape of ["lp-home-signal", "lp-home-wifi", "lp-home-battery"])
      expect(phone, shape).toContain(shape);
    expect(phone.match(/<svg/g)).toHaveLength(3);
    expect(phone.replace(/<[^>]*>/g, "").trim()).toBe("9:41");
  });

  // L'îlot est une pilule noire centrée en haut de l'écran ; la barre d'état a sa hauteur, que l'interface laisse libre
  it("centers a black island and keeps the interface under the status bar and above the home bar", () => {
    const island = ruleOf(".lp-home-island");

    expect(island).toMatch(/left:\s*50%/);
    expect(island).toMatch(/translateX\(-50%\)/);
    expect(island).toMatch(/background:\s*#000000/);
    expect(ruleOf(".lp-home-statusbar")).toMatch(/height:\s*var\(--lp-home-safe-top\)/);
    expect(ruleOf(".lp-home-identity")).toMatch(/padding:\s*var\(--lp-home-safe-top\)/);
    expect(ruleOf(".lp-home-sheet")).toMatch(/padding:[^;]*var\(--lp-home-safe-bottom\)/);
  });

  // Les coins de l'écran suivent ceux du cadre : le rayon de l'écran est celui du cadre moins son épaisseur
  it("rounds the screen like the frame", () => {
    expect(ruleOf(".lp-home-phone")).toMatch(/border-radius:\s*var\(--lp-home-radius\)/);
    expect(ruleOf(".lp-home-screen")).toMatch(
      /border-radius:\s*calc\(\(var\(--lp-home-radius\) - var\(--lp-home-bezel\)\) \/ var\(--lp-home-scale\)\)/,
    );
  });

  // Sur un écran étroit, il n'y a ni cadre, ni îlot, ni barres, ni boutons du côté : le vrai téléphone du visiteur en tient lieu
  it("shows no iPhone on a narrow screen", () => {
    expect(narrowPart.length).toBeGreaterThan(200);
    expect(narrowPart).toMatch(
      /\.lp-home-phone::before,\s*\.lp-home-phone::after,\s*\.lp-home-chrome\s*\{\s*display:\s*none/,
    );
    expect(narrowPart).toMatch(/\.lp-home-identity\s*\{\s*display:\s*none/);
  });
});

describe("the screen of the phone of the home page", () => {
  // Retouche 2 : un fond uni, la couleur du fond du jeu sans ses points
  it("has a plain background, the void of the game without its dots", () => {
    const screen = ruleOf(".lp-home-screen");

    expect(screen).toMatch(/background:\s*var\(--void\)\s*;/);
    expect(screen).not.toMatch(/radial-gradient|void-dot/);
  });
});

describe("the cell aimed at with the mouse, on the canvas of the phone", () => {
  // Retouche 4 : le trait double du jeu (render-scene.ts), blanc contre la case et noir autour, par-dessus le brouillon
  it("is ringed twice, white against the cell then black around it, like the game", () => {
    const target = ruleOf(".lp-home-cell.is-target");

    expect(target).toMatch(
      /box-shadow:\s*0 0 0 1px var\(--draft-outline-in\),\s*0 0 0 2px var\(--draft-outline-out\)/,
    );
    expect(target).toMatch(/z-index:\s*2/);
    expect(ruleOf(".lp-home-cell.is-draft")).toMatch(/z-index:\s*1/);
  });

  // Au doigt, le survol resterait collé : il ne se montre qu'à la souris (et au stylet, qui survole aussi) ; jamais par `:hover`
  it("is never drawn for a finger", () => {
    expect(targetOf("touch", 40)).toBeNull();
    expect(targetOf("mouse", 40)).toBe(40);
    expect(targetOf("pen", 40)).toBe(40);
    expect(targetOf("mouse", null)).toBeNull();
    expect(css).not.toMatch(/\.lp-home-cell[^{]*:hover/);
  });

  // Le curseur du jeu en Dessin est la croix : celui de la fresque du téléphone l'est déjà
  it("keeps the crosshair cursor of the game in Draw", () => {
    expect(ruleOf(".lp-home-grid--phone")).toMatch(/cursor:\s*crosshair/);
  });
});

describe("the canvas of the stream and the silhouette", () => {
  // Retouche 5 : un contour fin, clair, le même en clair et en sombre (l'écran n'a pas d'apparence)
  it("outlines the canvas of the stream with a thin line that reads on the blue-grey", () => {
    expect(ruleOf(".lp-home-grid--stream")).toMatch(/outline:\s*1px solid var\(--lp-home-outline\)/);
    expect(ruleOf(".lp-home-monitor")).toMatch(/--lp-home-outline:\s*#[0-9a-f]{6}/i);
  });

  // Retouche 3 : une tête qui fait la moitié des épaules, plus grande que l'ancienne (42 %)
  it("draws a head half as wide as the shoulders", () => {
    expect(ruleOf(".lp-home-person-head")).toMatch(/width:\s*50%/);
    expect(ruleOf(".lp-home-person-head")).toMatch(/top:\s*0/);
  });

  // Au PC, la silhouette s'accorde à la largeur du téléphone et à la place qui reste avant la fresque du stream
  it("follows the width of the phone on a wide screen", () => {
    const wide = css.slice(
      css.indexOf("@container lp-home (min-width: 641px) {\n  .lp-home-person"),
      css.indexOf(".lp-home-person-head"),
    );

    expect(wide).toMatch(/--lp-home-head-left:\s*calc\(var\(--lp-home-phone-w\)/);
    expect(wide).toMatch(/--lp-home-person-w:\s*min\(/);
    expect(wide).toMatch(/left:\s*calc\(var\(--lp-home-head-left\)/);
  });
});
