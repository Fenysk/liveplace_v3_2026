import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DRAFTING_ATTRIBUTE } from "../draft/use-drafting-attribute";
import { COMPACT_SCREEN_QUERY } from "./use-media-query";

// Écart §8.1 (JOURNAL 2026-10-08) : le haut de l'écran sur mobile, en Vue puis en Dessin. Le CSS est la source : ces
// garde-fous lisent ses règles, comme ceux de la pill Thème (theme-pill.test.ts).

const read = (file: string) => readFileSync(join(import.meta.dirname, file), "utf8");
const pillCss = read("pill.css");
const twitchCss = read("twitch.css");

const COMPACT_MEDIA = `@media ${COMPACT_SCREEN_QUERY} {`;
// Le dernier bloc de pill.css réservé aux écrans étroits (jamais tactiles larges) : les marges de 8 px
const NARROW_MEDIA = "@media (max-width: 640px) {";

// Le contenu d'un bloc `@media`, de son ouverture à son accolade fermante (les règles s'y ferment une à une)
const mediaBlockOf = (css: string, opening: string, from = 0): string => {
  const start = css.indexOf(opening, from);
  let depth = 0;
  for (let index = start + opening.length - 1; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    if (css[index] === "}") depth -= 1;
    if (depth === 0) return css.slice(start, index + 1);
  }
  return css.slice(start);
};

const ruleOf = (css: string, selector: string): string =>
  new RegExp(`${selector.replace(/[[\]().$|*+?^]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";

const compact = mediaBlockOf(pillCss, COMPACT_MEDIA);
const narrow = mediaBlockOf(pillCss, NARROW_MEDIA, pillCss.indexOf(compact) + compact.length);

describe("la pill Canvas sur mobile (Écart §8.1, JOURNAL 2026-10-08)", () => {
  // Elle ne dépasse jamais la place que la pill Compte lui laisse : sa largeur publiée, et un espace entre les deux
  it("never goes past the room the Account pill leaves it: its published width, and a gap between the two", () => {
    for (const block of [compact, narrow]) {
      const room = ruleOf(block, '.lp-floating[data-dock="tl"]').replace(/\s+/g, " ");
      expect(room).toContain("--lp-canvas-room: calc(");
      expect(room).toContain("var(--lp-top-right,");
      expect(room).toMatch(/- var\(--space-2\) \);/);
    }
    expect(ruleOf(compact, '.lp-floating[data-dock="tl"] .lp-pill-content')).toContain(
      "max-width: var(--lp-canvas-room);",
    );
  });

  // Le plafond de 64 px ne vaut plus dans la pill Canvas : la catégorie y prend toute la place qui reste
  it("lifts the 64 px cap of the live category in the Canvas pill only", () => {
    expect(ruleOf(compact, '.lp-floating[data-dock="tl"] .lp-live-category')).toContain("max-width: none;");
    expect(twitchCss).toContain("max-width: 64px;");
  });

  // Le bouton live cède avant le nom : un facteur de rétrécissement bien plus grand, et la catégorie passe à la ligne
  // plutôt que de rester à une lettre
  it("makes the live button give way before the name, the category wrapping out of it rather than staying at a letter", () => {
    const button = ruleOf(twitchCss, ".lp-btn--live");

    expect(button).toMatch(/flex:\s*0\s+\d{4,}\s+auto;/);
    expect(button).toContain("flex-wrap: wrap;");
    expect(button).toContain("overflow: hidden;");
    expect(ruleOf(twitchCss, ".lp-live-category")).toContain("min-width: 3ch;");
  });
});

describe("la pill Canvas sans pill Compte sur mobile (Écart §8.1, JOURNAL 2026-10-08)", () => {
  // Tant qu'aucune pill Compte n'est visible (l'invité n'en a pas, un viewer l'attend du gateway), rien n'est réservé
  const alone =
    'html:not(:has(.lp-floating[data-dock="tr"] > .lp-pill:not(.is-hidden))) .lp-floating[data-dock="tl"]';

  it("gives the Canvas pill the whole row while no Account pill is visible, with the same side margins as the docks", () => {
    expect(ruleOf(compact, alone).replace(/\s+/g, " ")).toContain(
      "--lp-canvas-room: calc(100vw - 2 * var(--space-4));",
    );
    expect(ruleOf(narrow, alone).replace(/\s+/g, " ")).toContain(
      "--lp-canvas-room: calc(100vw - 2 * var(--space-2));",
    );
    expect(ruleOf(compact, alone)).not.toContain("--lp-top-right");
    expect(ruleOf(narrow, alone)).not.toContain("--lp-top-right");
  });

  // Avant sa première mesure, la pill Compte vaut une photo : un contrôle et ses deux marges, comme pour un viewer
  it("reserves one control and its margins for an Account pill not yet measured", () => {
    for (const block of [compact, narrow]) {
      expect(ruleOf(block, '.lp-floating[data-dock="tl"]').replace(/\s+/g, " ")).toContain(
        "var(--lp-top-right, calc(var(--control-size) + 2 * var(--space-2)))",
      );
    }
  });

  // Au PC, rien ne change : la place rendue à la pill Canvas ne vaut que sur les écrans étroits ou tactiles
  it("changes nothing on a PC: the whole-row rule is only inside the narrow or touch screens' blocks", () => {
    const outside = pillCss.replace(compact, "").replace(narrow, "");

    expect(outside).not.toContain("--lp-canvas-room");
    expect(pillCss).toContain(alone);
  });
});

describe("la bande Thème sur mobile (Écart §8.1, JOURNAL 2026-10-08)", () => {
  // Même largeur que la rangée du haut : de la marge d'un côté à la marge de l'autre, comme les docks du haut
  it("spans the top row: from one margin to the other, as the top docks do", () => {
    const band = ruleOf(compact, '.lp-floating[data-dock="tc"]');
    expect(band).toContain("left: var(--space-4);");
    expect(band).toContain("right: var(--space-4);");
    const narrowBand = ruleOf(narrow, '.lp-floating[data-dock="tc"]');
    expect(narrowBand).toContain("left: var(--space-2);");
    expect(narrowBand).toContain("right: var(--space-2);");
    expect(ruleOf(compact, '.lp-floating[data-dock="tc"] > .lp-pill')).toContain("width: 100%;");
    expect(ruleOf(compact, '.lp-floating[data-dock="tc"] .lp-pill-content')).toContain("max-width: none;");
  });

  // Le thème y prend la taille « title », par les jetons : jamais une taille écrite dans un composant
  it("gives the theme the title size through tokens, never a size written in a component", () => {
    const themeCss = read("theme-pill.css");
    const compactTheme = mediaBlockOf(themeCss, COMPACT_MEDIA);
    const text = ruleOf(compactTheme, ".lp-theme .lp-theme-text");

    expect(text).toContain("font-size: var(--type-title-size);");
    expect(text).toContain("line-height: var(--type-title-line);");
    expect(text).toContain("font-weight: var(--type-title-weight);");
    // Le `line-clamp` est sur la boîte, dont le seul bloc porte le petit texte et le thème à la suite
    expect(ruleOf(compactTheme, ".lp-theme")).toContain("-webkit-line-clamp: 2;");
    expect(ruleOf(compactTheme, ".lp-theme-line")).toContain("display: block;");
    expect(ruleOf(themeCss, ".lp-theme-line")).toContain("display: contents;");
    expect(ruleOf(read("tokens.css"), ".lp-type-title")).toContain("font-size: var(--type-title-size);");
  });
});

describe("le mode Dessin sur mobile (Écart §8.1, JOURNAL 2026-10-08)", () => {
  const drafting = `html[${DRAFTING_ATTRIBUTE}]`;

  // Seul le thème reste en haut : les pills Canvas et Compte s'effacent, puis quittent aussi le clavier
  it("fades the Canvas and Account pills out, then takes them out of the keyboard's reach too", () => {
    const faded = ruleOf(compact, `${drafting} .lp-floating:is([data-dock="tl"], [data-dock="tr"])`);

    expect(faded).toContain("opacity: 0;");
    expect(faded).toContain("visibility: hidden;");
    // La visibilité ne part qu'une fois le fondu fini : sans cela, il n'y aurait pas de fondu
    expect(faded.replace(/\s+/g, " ")).toContain("visibility 0s linear var(--lp-dur-fade)");
  });

  // La bande monte à la place de la rangée par `transform`, jamais par `top` : le cadrage du canvas lit sa place de Vue
  it("raises the band into the row's place by transform, never by top: the canvas framing reads its Vue place", () => {
    const raised = ruleOf(compact, `${drafting} .lp-floating[data-dock="tc"]`);

    expect(raised.replace(/\s+/g, " ")).toContain(
      "transform: translateY(calc(-1 * (var(--control-size) + 3 * var(--space-2))));",
    );
    expect(raised).not.toContain("top:");
    expect(ruleOf(compact, '.lp-floating[data-dock="tc"]')).toContain(
      "transform var(--lp-dur) var(--lp-ease)",
    );
  });

  // Le toast se pose sous la bande montée, ou tout en haut sans thème (--lp-theme-bar vaut alors son opposé)
  it("puts the toast under the raised band, or at the very top without a theme", () => {
    const toast = ruleOf(narrow, `${drafting} .lp-floating[data-dock="toast"]`).replace(/\s+/g, " ");

    expect(toast).toContain("max(0px, var(--lp-theme-bar) + var(--space-2))");
    expect(toast).toContain("max(var(--space-2), env(safe-area-inset-top))");
  });

  // Au PC, rien ne change : aucune règle du Dessin hors du bloc des écrans étroits ou tactiles
  it("changes nothing on a PC: no Drafting rule outside the narrow or touch screens' block", () => {
    const outside = pillCss.replace(compact, "").replace(narrow, "");

    expect(outside).not.toContain(drafting);
    expect(pillCss).toContain(drafting);
  });
});

describe("la route du jeu et le mode Dessin (Écart §8.1, JOURNAL 2026-10-08)", () => {
  // La page pose l'attribut que lit le CSS : sans cet appel, rien ne s'efface en Dessin
  it("sets the attribute the CSS reads, from the game page", () => {
    const route = readFileSync(join(import.meta.dirname, "..", "..", "routes", "$login.tsx"), "utf8");

    expect(route).toContain("useDraftingAttribute(stores.draft)");
    expect(DRAFTING_ATTRIBUTE).toBe("data-drafting");
  });
});

describe("le haut pendant un geste de vue sur mobile (Écart §8.1, JOURNAL 2026-10-09)", () => {
  const panning = "html[data-panning]";
  const TOP_DOCKS = '[data-dock="tl"], [data-dock="tr"], [data-dock="tc"]';
  // Tout ce qui n'est pas le haut : la barre du bas, Recentrer, l'inspection, le classement et le toast
  const OTHER_DOCKS = ["bc", "br", "cr", "cl", "toast"];

  // Pendant le geste, les pills Canvas et Compte et la bande s'effacent, puis quittent le clavier
  it("fades the Canvas and Account pills and the band out while the view moves, then out of the keyboard's reach", () => {
    const faded = ruleOf(compact, `${panning} .lp-floating:is(${TOP_DOCKS})`).replace(/\s+/g, " ");

    expect(faded).toContain("opacity: 0;");
    expect(faded).toContain("visibility: hidden;");
    // La visibilité ne part qu'une fois le fondu fini : sans ce délai, il n'y aurait pas de fondu
    expect(faded).toContain("visibility 0s linear var(--lp-dur-fade)");
    expect(faded).toContain("opacity var(--lp-dur-fade) ease");
  });

  // Les durées passent par les jetons, que `prefers-reduced-motion` met à 0 : sans mouvement, le haut part et revient d'un coup
  it("takes its durations from the tokens alone, which reduced motion sets to 0: no animated fade", () => {
    const faded = ruleOf(compact, `${panning} .lp-floating:is(${TOP_DOCKS})`);

    expect(faded).not.toMatch(/\d(ms|s)\b(?!\s*linear)/);
    expect(read("tokens.css")).toMatch(
      /prefers-reduced-motion: reduce\) \{\s*:root \{[^}]*--lp-dur-fade: 0s;/,
    );
  });

  // Une bulle qui vise une pill du haut part et revient avec elle : seule, sa flèche pointerait sur du vide
  it("takes a bubble aimed at a top pill away with the pills, and back with them", () => {
    const aimed = ["tl", "tr", "tc"].map((dock) => `[data-aimed-dock="${dock}"]`).join(", ");

    expect(compact.replace(/\s+/g, " ")).toContain(
      `${panning} .lp-bubble:is(${aimed}), ${panning} .lp-floating:is(${TOP_DOCKS}) {`,
    );
  });

  // Pendant le fondu, elles ne prennent déjà plus les touchers
  it("takes the touches off the pills at once, without waiting for the fade to end", () => {
    expect(ruleOf(compact, `${panning} .lp-floating:is(${TOP_DOCKS}) > .lp-pill`)).toContain(
      "pointer-events: none;",
    );
  });

  // Rien ne bouge de place : le cadrage du canvas lit les pills là où elles sont en Vue
  it("moves nothing: no top, no display, no transform, so the canvas framing stays where it is", () => {
    const faded = ruleOf(compact, `${panning} .lp-floating:is(${TOP_DOCKS})`).replace(
      /transition:[^;]*;/,
      "",
    );

    for (const property of [
      "top:",
      "left:",
      "right:",
      "bottom:",
      "display:",
      "transform:",
      "height:",
      "width:",
    ]) {
      expect(faded).not.toContain(property);
    }
  });

  // Le pouce est en bas : la barre du bas, Recentrer, l'inspection et le toast ne s'effacent jamais
  it("leaves the bottom bar, Recenter, the inspection sheet and the toast alone", () => {
    // Le sélecteur de chaque règle du geste, de `html[data-panning]` à son accolade
    const rules = compact
      .split(panning)
      .slice(1)
      .map((rest) => rest.slice(0, rest.indexOf("{")));

    expect(rules.length).toBeGreaterThan(0);
    for (const dock of OTHER_DOCKS) {
      expect(rules.filter((rule) => rule.includes(`data-dock="${dock}"`))).toEqual([]);
    }
  });

  // Au PC, rien ne change : toutes les pills s'effacent au geste, comme avant, et la règle du haut seul n'y est pas
  it("changes nothing on a PC: every pill still fades with the gesture, and the top-only rule is not there", () => {
    const outside = pillCss.replace(compact, "").replace(narrow, "");
    const pc = mediaBlockOf(outside, "@media not ((max-width: 640px) or (pointer: coarse)) {");

    expect(ruleOf(pc, `${panning} .lp-floating`)).toContain("opacity: 0;");
    expect(ruleOf(pc, `${panning} .lp-floating > .lp-pill`)).toContain("pointer-events: none;");
    expect(outside).not.toContain(`${panning} .lp-floating:is(`);
    expect(compact).not.toContain(`${panning} .lp-floating {`);
  });

  // Aucun intermédiaire entre le geste et le CSS : sur mobile aussi, la règle lit l'attribut que la scène pose et lève,
  // trois fois (la bulle visée, les pills, leurs touchers), et le PC garde ses deux
  it("reads the gesture attribute itself on mobile, with no hold in between", () => {
    expect(compact.split(panning)).toHaveLength(4);
    expect(pillCss.split(panning)).toHaveLength(6);
    expect(pillCss).not.toContain("data-pan-hold");
  });

  // Le retour est la sortie de la règle : le fondu normal des pills, sans délai, et la visibilité revient d'un coup
  it("brings the top back at once with the normal fade: no delay on the way back, visibility not transitioned", () => {
    // La règle de base, au début d'une ligne (les règles du geste la contiennent aussi), et celle de la bande
    const back = [ruleOf(pillCss, "\n.lp-floating"), ruleOf(compact, '.lp-floating[data-dock="tc"]')].map(
      (rule) => rule.replace(/\s+/g, " "),
    );

    for (const rule of back) {
      expect(rule).toContain("opacity var(--lp-dur-fade) ease");
      expect(rule).not.toContain("visibility");
      expect(rule).not.toMatch(/delay|\d(ms|s)\b/);
    }
    expect(ruleOf(compact, `${panning} .lp-floating:is(${TOP_DOCKS})`)).not.toContain("transition-delay");
  });
});
