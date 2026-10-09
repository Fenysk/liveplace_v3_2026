import { PALETTE, TRANSPARENT_COLOR_INDEX } from "@liveplace/domain";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Palette, RecentSwatches } from "./palette";

// La palette au clavier (JOURNAL 2026-10-09) : un groupe radio, un seul arrêt de Tab, chaque couleur sous son nom.

const noop = (): void => undefined;

const renderPalette = (colorIndex: number, props: { isTouch?: boolean; hasEraser?: boolean } = {}): string =>
  renderToStaticMarkup(createElement(Palette, { palette: PALETTE, colorIndex, onPick: noop, ...props }));

const swatchesOf = (markup: string): string[] => markup.match(/<button[^>]*>/g) ?? [];
const tabStopsOf = (swatches: readonly string[]) =>
  swatches.filter((swatch) => swatch.includes('tabindex="0"'));
const checkedOf = (swatches: readonly string[]) =>
  swatches.filter((swatch) => swatch.includes('aria-checked="true"'));

describe("la palette du Dessin (JOURNAL 2026-10-09)", () => {
  // Un groupe radio nommé, que la fenêtre de jeu reconnaît pour lui laisser ses touches
  it("is a named radio group that the draft keys recognize", () => {
    const markup = renderPalette(5);

    expect(markup).toMatch(/^<div [^>]*role="radiogroup"/);
    expect(markup).toContain('aria-label="Toutes les couleurs"');
    expect(markup).toContain("data-palette");
  });

  // La gomme en tête, puis les 42 couleurs : chacune est un radio
  it("lists the eraser first, then the 42 colors, each one a radio", () => {
    const swatches = swatchesOf(renderPalette(5));

    expect(swatches).toHaveLength(PALETTE.length);
    expect(swatches.every((swatch) => swatch.includes('role="radio"'))).toBe(true);
    expect(swatches[0]).toContain('aria-label="Gomme"');
  });

  // Une seule couleur est cochée, la couleur actuelle, et c'est le seul arrêt de Tab
  it("checks the current color only, and makes it the single Tab stop", () => {
    const swatches = swatchesOf(renderPalette(5));

    expect(checkedOf(swatches)).toHaveLength(1);
    expect(checkedOf(swatches)[0]).toContain(`title="${PALETTE[5]}"`);
    expect(tabStopsOf(swatches)).toEqual(checkedOf(swatches));
    expect(swatches.filter((swatch) => swatch.includes('tabindex="-1"'))).toHaveLength(PALETTE.length - 1);
  });

  // Gomme armée : c'est la gomme qui est cochée et qui prend le Tab
  it("checks the eraser and gives it the Tab when the eraser is armed", () => {
    const swatches = swatchesOf(renderPalette(TRANSPARENT_COLOR_INDEX));

    expect(checkedOf(swatches)).toHaveLength(1);
    expect(checkedOf(swatches)[0]).toContain('aria-label="Gomme"');
    expect(tabStopsOf(swatches)).toEqual(checkedOf(swatches));
  });

  // Sur mobile la gomme est dans les outils : gomme armée, aucune pastille cochée, et la première prend le Tab
  it("checks nothing and gives the Tab to the first color when the eraser is armed but not in the palette", () => {
    const swatches = swatchesOf(renderPalette(TRANSPARENT_COLOR_INDEX, { isTouch: true, hasEraser: false }));

    expect(swatches).toHaveLength(PALETTE.length - 1);
    expect(checkedOf(swatches)).toEqual([]);
    expect(tabStopsOf(swatches)).toHaveLength(1);
    expect(tabStopsOf(swatches)[0]).toContain(`title="${PALETTE[1]}"`);
  });

  // Chaque couleur garde son nom accessible, sa valeur, et ne se dit plus « appuyée »
  it("keeps the accessible name of each color, its value, and no longer says pressed", () => {
    const markup = renderPalette(5);

    expect(markup).toContain(`aria-label="Couleur ${PALETTE[5]}"`);
    expect(markup).toContain(`aria-label="Couleur ${PALETTE[42]}"`);
    expect(markup).not.toContain("aria-pressed");
  });
});

describe("les couleurs récentes (JOURNAL 2026-10-09)", () => {
  const recentMarkup = () =>
    renderToStaticMarkup(
      createElement(RecentSwatches, {
        palette: PALETTE,
        recentColorIndexes: [5, 28, 19, 9, 42],
        onPick: noop,
      }),
    );

  // Chaque récente dit la touche qui la prend, 1 à 5 dans l'ordre où elles s'affichent
  it("tells the key that takes each one, 1 to 5 in the order they are shown", () => {
    const swatches = swatchesOf(recentMarkup());

    expect(swatches).toHaveLength(5);
    swatches.forEach((swatch, place) => {
      expect(swatch).toContain(`aria-keyshortcuts="${place + 1}"`);
    });
  });

  // L'infobulle de chacune ajoute la touche à la valeur, et le nom accessible ne change pas
  it("adds the key to the tooltip of each one, and keeps its accessible name", () => {
    const swatches = swatchesOf(recentMarkup());

    expect(swatches[0]).toContain(`title="${PALETTE[5]} (1)"`);
    expect(swatches[4]).toContain(`title="${PALETTE[42]} (5)"`);
    expect(swatches[0]).toContain(`aria-label="Couleur ${PALETTE[5]}"`);
  });
});
