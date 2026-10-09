import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ZONE_ABOVE_ATTRIBUTE } from "../canvas/arrival-insets";
import { DRAFTING_ATTRIBUTE } from "../draft/use-drafting-attribute";
import { COMPACT_SCREEN_QUERY, SIDE_COLUMN_QUERY } from "./use-media-query";

// Écart §8.1 et §9.3 (JOURNAL 2026-10-08) : un téléphone en paysage et les écrans à charnière. Le CSS est la source : ces
// garde-fous lisent ses règles, comme ceux du haut de l'écran sur mobile (mobile-header.test.ts).

const read = (file: string) => readFileSync(join(import.meta.dirname, file), "utf8");
// Sans commentaire, sur une ligne, et sans l'espace que le formateur laisse après « ( » ou avant « ) »
const flat = (css: string) =>
  css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replaceAll("( ", "(")
    .replaceAll(" )", ")");

const zoneCss = flat(read("canvas-zone.css"));
const landscapeCss = flat(read("pill-landscape.css"));
const hingeCss = flat(read("pill-hinge.css"));

// Un bloc `@media`, de son ouverture à son accolade fermante
const queryBodyOf = (css: string, opening: string): string => {
  const start = css.indexOf(opening);
  expect(start, opening).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let index = start + opening.length - 1; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    if (css[index] === "}") depth -= 1;
    if (depth === 0) return css.slice(start, index + 1);
  }
  return css.slice(start);
};

// Les trois requêtes de SIDE_COLUMN_QUERY : les deux d'un téléphone en paysage, puis celle d'un écran tactile large
const [LANDSCAPE_NARROW = "", LANDSCAPE_TOUCH = "", LARGE_TOUCH = ""] = SIDE_COLUMN_QUERY.split(", ");
const LANDSCAPE_MEDIA = `@media ${LANDSCAPE_NARROW}, ${LANDSCAPE_TOUCH} {`;
const SIDE_MEDIA = `@media ${SIDE_COLUMN_QUERY} {`;
const LARGE_MEDIA = `@media ${LARGE_TOUCH} {`;
// Le CSS sans ses blocs `@media`, imbriqués ou non
const withoutMedia = (css: string): string => {
  const start = css.indexOf("@media ");
  if (start < 0) return css;
  const body = queryBodyOf(css, css.slice(start, css.indexOf("{", start) + 1));
  return withoutMedia(css.slice(0, start) + css.slice(start + body.length));
};

const SEGMENTS_ACROSS = "@media (horizontal-viewport-segments: 2) and (pointer: coarse) {";
const SEGMENTS_STACKED =
  "@media (vertical-viewport-segments: 2) and (pointer: coarse), (device-posture: folded) and (orientation: portrait) and (pointer: coarse) {";

const landscape = queryBodyOf(landscapeCss, LANDSCAPE_MEDIA);
const side = queryBodyOf(landscapeCss, SIDE_MEDIA);
const large = queryBodyOf(landscapeCss, LARGE_MEDIA);
const across = queryBodyOf(hingeCss, SEGMENTS_ACROSS);
const stacked = queryBodyOf(hingeCss, SEGMENTS_STACKED);

describe("la zone libre du canvas (Écart §9.3, JOURNAL 2026-10-08)", () => {
  // Sans propriété, la sonde couvre tout l'écran : le PC et les écrans sans disposition à part ne changent pas
  it("covers the whole screen when no layout says otherwise", () => {
    expect(zoneCss).toContain(".lp-canvas-zone { position: fixed; top: 0; left: var(--lp-zone-left, 0px);");
    expect(zoneCss).toContain(
      "width: calc(var(--lp-zone-w, 100%) - var(--lp-zone-left, 0px) - var(--lp-zone-right, 0px));",
    );
    expect(zoneCss).toContain("height: calc(var(--lp-zone-h, 100%) - var(--lp-zone-bottom, 0px));");
  });

  // Écart §9.3 (JOURNAL 2026-10-09) : la sonde de la zone au-dessus de la colonne ne diffère de l'autre que par ses deux marges,
  // et sans elles (une disposition qui n'en offre pas) elle est la même
  it("probes the zone above the column with its own right and bottom, the other zone's without them", () => {
    expect(zoneCss).toContain(
      ".lp-canvas-zone--above { width: calc(var(--lp-zone-w, 100%) - var(--lp-zone-left, 0px) - var(--lp-zone-above-right, var(--lp-zone-right, 0px)));",
    );
    expect(zoneCss).toContain(
      "height: calc(var(--lp-zone-h, 100%) - var(--lp-zone-above-bottom, var(--lp-zone-bottom, 0px)));",
    );
  });

  // Le bas d'un téléphone en portrait, comme le mesurait la barre elle-même : sa marge, une ligne de contrôles, ses deux marges
  it("keeps the bottom of a portrait phone: the bar's margin, one control row and its two margins", () => {
    expect(zoneCss).toContain("@media (max-width: 640px) {");
    expect(zoneCss).toContain(
      "--lp-zone-bottom: calc(max(var(--space-2), env(safe-area-inset-bottom)) + var(--control-size) + 2 * var(--space-2));",
    );
    expect(zoneCss).toContain(
      "--lp-zone-bottom: calc(var(--space-4) + var(--control-size) + 2 * var(--space-2));",
    );
  });

  // Au PC, aucune règle de disposition : seules les sondes sont écrites hors d'un bloc `@media`
  it("changes nothing on a PC: every layout rule sits in a media block", () => {
    for (const css of [zoneCss, landscapeCss, hingeCss]) {
      const outside = withoutMedia(css)
        .replace(/\.lp-canvas-zone \{[^}]*\}/, "")
        .replace(/\.lp-canvas-zone--above \{[^}]*\}/, "");
      expect(outside).not.toContain(".lp-floating");
      expect(outside).not.toContain("--lp-");
    }
  });
});

describe("la barre du bas en colonne (Écart §8.1 et §9.3, JOURNAL 2026-10-08)", () => {
  // La même requête dans le CSS et dans le code : la page rend le panneau là où le CSS fait la colonne
  it("writes the same three queries in the CSS and in the code", () => {
    expect(SIDE_COLUMN_QUERY.split(", ")).toHaveLength(3);
    expect(LANDSCAPE_NARROW).toBe("(orientation: landscape) and (max-height: 500px) and (max-width: 640px)");
    expect(LANDSCAPE_TOUCH).toBe("(orientation: landscape) and (max-height: 500px) and (pointer: coarse)");
    expect(landscapeCss).toContain(SIDE_MEDIA);
    expect(landscapeCss).toContain(LANDSCAPE_MEDIA);
    expect(landscapeCss).toContain(LARGE_MEDIA);
    // Tous les trois sont des écrans compacts : tactiles, ou étroits
    for (const query of SIDE_COLUMN_QUERY.split(", "))
      expect(COMPACT_SCREEN_QUERY.split(", ").some((compact) => query.includes(compact))).toBe(true);
  });

  // Un téléphone n'atteint jamais 560 px des deux côtés (440 px au plus) ; le plus étroit des pliables dépliés mesuré fait 626 px
  it("sets the large screens' threshold between the widest phone and the narrowest unfolded foldable", () => {
    expect(LARGE_TOUCH).toBe("(pointer: coarse) and (min-width: 560px) and (min-height: 560px)");
    const [, threshold = ""] = /min-width: (\d+)px/.exec(LARGE_TOUCH) ?? [];
    expect(Number(threshold)).toBeGreaterThan(440);
    expect(Number(threshold)).toBeLessThan(626);
  });

  // La barre du bas passe sur le côté droit, en colonne : la jauge et Dessiner l'un sous l'autre
  it("moves the bottom bar to the right edge, as a column", () => {
    expect(side).toContain(
      'html .lp-floating[data-dock="bc"] { top: auto; left: auto; right: var(--lp-land-right); bottom: var(--lp-land-bottom); width: var(--lp-side-width);',
    );
    expect(side).toContain(
      'html .lp-floating[data-dock="bc"] .lp-pill-content { flex-direction: column; align-items: stretch; }',
    );
  });

  // En Dessin, le contenu prend toute la hauteur (le morphing grandit la pill vers le haut) et la palette défile dedans
  it("makes the Drafting panel as tall as the screen, its palette scrolling inside", () => {
    expect(side).toContain(
      `html[${DRAFTING_ATTRIBUTE}] .lp-floating[data-dock="bc"] .lp-pill-content { height: calc(100dvh - var(--lp-land-top) - var(--lp-land-bottom)); }`,
    );
    expect(side).toContain("flex: 1 1 0; min-height: 0;");
    expect(side).toContain("overflow-y: auto;");
  });

  // Le canvas : à gauche de la colonne, de sa largeur et d'un espace de chaque côté, sans l'encoche latérale
  it("leaves the canvas the room left of the column, with the side notch out of it", () => {
    expect(side).toContain("--lp-zone-left: env(safe-area-inset-left, 0px);");
    expect(side).toContain(
      "--lp-zone-right: calc(var(--lp-land-right) + var(--lp-side-width) + var(--space-2));",
    );
    expect(side).toContain("--lp-zone-bottom: var(--lp-land-bottom);");
  });

  // Recentrer se pose contre la colonne ; sans colonne (la page d'une archive), il garde sa place. Il glisse d'une zone à l'autre
  // (Écart §9.3, JOURNAL 2026-10-09), avec la durée et la courbe des pills.
  it("puts Recentre against the column, only where there is a column, sliding between the zones", () => {
    expect(side).toContain(
      'html:has(.lp-floating[data-dock="bc"]) .lp-floating[data-dock="br"] { right: calc(var(--lp-land-right) + var(--lp-side-width) + var(--space-2)); bottom: var(--lp-land-bottom); transition: opacity var(--lp-dur-fade) ease, right var(--lp-dur) var(--lp-ease), bottom var(--lp-dur) var(--lp-ease); }',
    );
  });

  // Ce que la colonne laisse au canvas maintenant : la zone à côté d'elle, tant que rien d'autre ne le dit
  it("says what the column leaves the canvas now: the zone beside it unless another layout says otherwise", () => {
    expect(side).toContain("--lp-free-right: var(--lp-zone-right); --lp-free-bottom: var(--lp-zone-bottom);");
  });

  // Une bulle posée à gauche du panneau passe sur la rangée du haut : la bande Thème s'efface en fondu le temps de la bulle
  it("fades the Theme band while a bubble sits left of the panel, over the top row", () => {
    expect(side).toContain(
      'html:has(.lp-bubble[data-side="left"]:not(.is-hidden)) .lp-floating[data-dock="tc"] { opacity: 0; }',
    );
  });

  // Une encoche ou une Dynamic Island sur le côté : les marges la suivent, à 0 sans encoche
  it("keeps the margins off a side notch", () => {
    expect(side).toContain("--lp-land-left: max(var(--space-2), env(safe-area-inset-left));");
    expect(side).toContain("--lp-land-right: max(var(--space-2), env(safe-area-inset-right));");
    expect(landscapeCss).toContain(
      'html .lp-floating[data-dock="tl"] { left: max(var(--space-4), env(safe-area-inset-left)); }',
    );
    expect(landscapeCss).toContain("env(safe-area-inset-right)");
  });
});

describe("un téléphone en paysage (Écart §8.1 et §9.3, JOURNAL 2026-10-08)", () => {
  // Les pills du haut restent dans les coins, la pill Thème entre les deux comme au PC : une seule rangée
  it("keeps the top pills in their corners and the Theme pill between them: a single row", () => {
    expect(landscape).toContain('html .lp-floating[data-dock="tl"] { --lp-canvas-room:');
    expect(landscape).toContain("top: var(--lp-land-top); left: var(--lp-land-left); }");
    expect(landscape).toContain(
      'html .lp-floating[data-dock="tc"] { --lp-theme-side: calc(max(var(--lp-land-left), var(--lp-land-right)) +',
    );
    expect(landscape).toContain("--lp-theme-room: calc(100vw - 2 * var(--lp-theme-side));");
    expect(landscape).toContain("top: var(--lp-land-top); left: 0; right: 0; }");
  });

  // La pill Compte allégée n'est qu'un contrôle, et l'invité n'en a aucune : le thème ne réserve pas de place à droite pour rien
  it("reserves one control for an unmeasured Account pill, and nothing on the right for a guest who has none", () => {
    expect(landscape).toContain("var(--lp-top-right, calc(var(--control-size) + 2 * var(--space-2)))");
    expect(landscape).toContain(
      'html:not(:has(.lp-floating[data-dock="tr"] > .lp-pill:not(.is-hidden))) .lp-floating[data-dock="tc"] { --lp-theme-side: calc(max(var(--lp-land-left), var(--lp-land-right)) + var(--space-2) + var(--lp-top-left, 260px)); }',
    );
  });

  // En Dessin, les pills du haut s'effacent (pill.css) et le thème se centre dans ce que le panneau laisse au canvas
  it("centres the theme in what the panel leaves the canvas, by transform", () => {
    expect(landscape).toContain(
      `html[${DRAFTING_ATTRIBUTE}] .lp-floating[data-dock="tc"] { --lp-theme-room: calc(100vw - var(--lp-zone-left) - var(--lp-zone-right) - 2 * var(--space-2)); transform: translateX(calc((var(--lp-zone-left) - var(--lp-zone-right)) / 2)); }`,
    );
  });

  // L'inspection à gauche, sans passer sous la colonne
  it("puts the inspection on the left, never under the column", () => {
    expect(landscape).toContain(
      'html .lp-floating[data-dock="cr"] { top: auto; left: var(--lp-land-left); right: auto; bottom: var(--lp-land-bottom); transform: none; }',
    );
    expect(landscape).toContain("calc(100vw - var(--lp-land-left) - var(--lp-zone-right) - var(--space-2))");
    expect(landscape).toContain("max-height: calc(100dvh - var(--lp-land-top) - var(--lp-land-row)");
  });
});

describe("un écran tactile large, pliable déplié ou tablette (Écart §8.1 et §9.3, JOURNAL 2026-10-08)", () => {
  // Il garde ses pills du haut et sa bande Thème : seule la barre du bas change. En Dessin, la bande s'arrête avant le panneau.
  it("keeps its top pills and its Theme band, the band stopping before the panel in Drafting", () => {
    expect(large).toContain(
      `html[${DRAFTING_ATTRIBUTE}] .lp-floating[data-dock="tc"] { right: max(var(--space-4), var(--lp-zone-right)); }`,
    );
    expect(large).not.toContain('data-dock="tl"');
    expect(large).not.toContain('data-dock="tr"');
  });

  // Sur le plus étroit, le toast d'en haut se pose au centre de ce que la colonne laisse au canvas, et glisse d'une zone à l'autre
  it("centres the toast of the narrowest in what the column leaves the canvas, sliding between the zones", () => {
    expect(large).toContain("@media (max-width: 640px) {");
    expect(large).toContain("left: calc((var(--lp-zone-left) + 100% - var(--lp-free-right)) / 2);");
    expect(large).toContain(
      "max-width: calc(100% - var(--lp-zone-left) - var(--lp-free-right) - 2 * var(--space-2));",
    );
    expect(large).toContain("top var(--lp-dur) var(--lp-ease), left var(--lp-dur) var(--lp-ease);");
  });

  // Écart §9.3 (JOURNAL 2026-10-09) : en Vue, la colonne offre au canvas une seconde zone, au-dessus d'elle, sur une colonne de
  // hauteur fixe : celle de Vue, la jauge et Dessiner. La feuille Dessin, qui la grandit, ne déplace donc pas le canvas.
  it("offers the zone above the column, on its Vue height and not on the measured one the Drafting panel grows", () => {
    expect(large).toContain("--lp-zone-above-right: env(safe-area-inset-right, 0px);");
    expect(large).toContain(
      "--lp-zone-above-bottom: calc(var(--lp-land-bottom) + 2 * var(--control-size) + 4 * var(--space-2));",
    );
    expect(large).not.toContain("--lp-bottom-bar");
    expect(side).not.toContain("--lp-zone-above-right");
  });

  // Seul le cadrage d'arrivée dit qu'il y est (`data-zone-above`), et seulement en Vue : en Dessin, le panneau tient la droite
  it("moves what the column leaves to the zone above only in Vue, once the framing says so", () => {
    expect(large).toContain(
      `html[${ZONE_ABOVE_ATTRIBUTE}]:not([${DRAFTING_ATTRIBUTE}]) { --lp-free-right: var(--lp-zone-above-right); --lp-free-bottom: var(--lp-zone-above-bottom); }`,
    );
    expect(ZONE_ABOVE_ATTRIBUTE).toBe("data-zone-above");
  });

  // Recentrer, en Vue au-dessus de la colonne, se pose au coin de la zone, contre le bord droit
  it("puts Recentre at the corner of the zone above the column, against the right edge", () => {
    expect(large).toContain(
      `html[${ZONE_ABOVE_ATTRIBUTE}]:not([${DRAFTING_ATTRIBUTE}]):has(.lp-floating[data-dock="bc"]) .lp-floating[data-dock="br"] { right: var(--lp-land-right); bottom: var(--lp-free-bottom); }`,
    );
  });
});

describe("deux écrans côte à côte (Écart §8.1 et §9.3, JOURNAL 2026-10-08)", () => {
  // Le canvas, ses pills et Recentrer dans le premier écran ; rien ne passe sur la charnière
  it("keeps the canvas, its pills and Recentre inside the first screen", () => {
    expect(across).toContain("--lp-zone-w: env(viewport-segment-width 0 0);");
    expect(across).toContain("--lp-canvas-room: calc(var(--lp-zone-w) - 2 * var(--space-2));");
    expect(across).toContain("width: calc(var(--lp-zone-w) - 2 * var(--space-2));");
    expect(across).toContain(
      'html .lp-floating[data-dock="br"], html:has(.lp-floating[data-dock="bc"]) .lp-floating[data-dock="br"] { right: auto; left: calc(var(--lp-zone-w) - var(--space-2) - var(--control-size) - 2 * var(--space-2));',
    );
  });

  // Les commandes dans le second : la colonne de la barre du bas (contre son bord droit), l'inspection, les fenêtres
  it("keeps the controls inside the second screen: column, inspection, windows", () => {
    expect(across).toContain("--lp-seg2-start: env(viewport-segment-left 1 0);");
    expect(across).not.toContain('html .lp-floating[data-dock="bc"] {');
    expect(across).not.toContain('data-dock="cr"');
    expect(across).toContain("inset: 0 0 0 var(--lp-seg2-start);");
    expect(across).toContain("max-width: calc(100% - var(--lp-seg2-start) - 2 * var(--space-4));");
  });

  // Une charnière à elle seule dit la zone : ni encoche latérale, ni marge à droite en plus, ni zone au-dessus de la colonne
  it("lets the hinge alone say the zone's sides, with no zone above the column", () => {
    expect(across).toContain("--lp-zone-left: 0px; --lp-zone-right: 0px;");
    expect(across).toContain("--lp-zone-bottom: var(--space-2);");
    expect(across).toContain("--lp-zone-above-right: initial; --lp-zone-above-bottom: initial;");
  });
});

describe("deux écrans l'un sur l'autre, ou un pliable à moitié plié (Écart §8.1 et §9.3, JOURNAL 2026-10-08)", () => {
  // Sans segment (Galaxy Z Flip en Flex mode), la charnière est au milieu ; avec, elle est où elle dit
  it("puts the hinge in the middle without a segment, where the segments say it with them", () => {
    expect(stacked).toContain("--lp-zone-h: 50dvh; --lp-seg2-top: 50dvh;");
    expect(stacked).toContain("--lp-zone-bottom: var(--space-2);");
    expect(stacked).toContain("--lp-zone-above-right: initial; --lp-zone-above-bottom: initial;");
    expect(hingeCss).toContain(
      "@media (vertical-viewport-segments: 2) and (pointer: coarse) { :root { --lp-zone-h: env(viewport-segment-height 0 0); --lp-seg2-top: env(viewport-segment-top 0 1); } }",
    );
    // La posture seule ne vaut qu'en portrait : une charnière en paysage n'a pas de place connue
    expect(stacked).not.toContain("landscape");
  });

  // Recentrer au bas de l'écran du haut, l'inspection dans celui du bas, au-dessus de la barre : jamais au centre de l'écran
  it("puts Recentre at the bottom of the top screen and the inspection in the bottom one", () => {
    expect(stacked).toContain(
      'html .lp-floating[data-dock="br"], html:has(.lp-floating[data-dock="bc"]) .lp-floating[data-dock="br"] { top: calc(var(--lp-zone-h) - var(--space-2) - var(--control-size) - 2 * var(--space-2)); bottom: auto; }',
    );
    expect(stacked).toContain(
      'html .lp-floating[data-dock="cr"] { top: auto; transform: none; bottom: calc(',
    );
  });

  // Rien du bas ne monte au-delà de la charnière : la barre, l'inspection et les fenêtres défilent
  it("never lets the bottom pills climb past the hinge", () => {
    expect(stacked).toContain(
      'html .lp-floating[data-dock="bc"] .lp-pill-content { max-height: calc(100dvh - var(--lp-seg2-top) - 2 * var(--space-2)); overflow-y: auto; }',
    );
    expect(stacked).toContain(
      "html .lp-window { max-height: calc(100dvh - var(--lp-seg2-top) - var(--space-2)); }",
    );
    expect(hingeCss).toContain("html .lp-window { top: var(--lp-seg2-top); }");
  });

  // Les trois dispositions à charnière ne valent que sur un écran tactile : un PC aux deux écrans garde sa disposition
  it("only applies to touch screens", () => {
    for (const media of [across, stacked]) expect(media).toContain("(pointer: coarse)");
  });
});
