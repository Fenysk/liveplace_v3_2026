import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { type BubbleTargets, BubbleTargetsContext } from "../help/bubble-target";
import { ObsSettings } from "./obs-settings";

const doNothing = (): void => undefined;

const settingsHtml = (): string =>
  renderToString(
    createElement(ObsSettings, {
      address: "liveplace.test/kalyss",
      url: "https://liveplace.test/kalyss",
      obsDelayMs: 10_000,
      onPickDelay: doNothing,
    }),
  );

// Écart §9.1 (JOURNAL 2026-10-10) : le fond de la fresque se règle dans la section Fresque, avec un choix de plus, l'image. Ces cas,
// qui disaient où il se choisissait dans « Vue OBS », disent maintenant qu'il n'y est plus ; son comportement est prouvé par la
// section Fresque (canvas-background-settings.test.ts).
describe("the OBS section of the settings no longer holds the background (Écart §9.1, JOURNAL 2026-10-10)", () => {
  // Plus de clavier de couleurs, ni de titre « Fond de la vue OBS », ni d'interrupteur
  it("has no color keyboard under « Fond de la vue OBS » any more, and no switch", () => {
    const html = settingsHtml();

    expect(html).not.toContain("<legend");
    expect(html).not.toContain("Fond de la vue OBS");
    expect(html).not.toContain("Fond transparent");
    expect(html).not.toContain('type="checkbox"');
  });

  // Ni Transparent, ni Noir, ni Blanc : aucune pastille dans la section
  it("offers no Transparent, Noir or Blanc swatch", () => {
    const swatches = [
      ...settingsHtml().matchAll(/<button[^>]*class="(lp-swatch[^"]*)"[^>]*aria-label="([^"]*)"/g),
    ];

    expect(swatches).toEqual([]);
  });

  // Aucun bouton enfoncé : le fond n'est plus un réglage de cette section, pas même celui d'avant
  it("holds no pressed button, the background being no setting of this section any more", () => {
    expect([...settingsHtml().matchAll(/aria-pressed="true"/g)]).toEqual([]);
  });

  // Plus aucune légende : le groupe du fond était la seule
  it("holds no legend any more: the background group was the only one", () => {
    expect(settingsHtml().match(/<legend/g)).toBeNull();
  });

  // La rangée du Délai garde ses classes et sa valeur : c'est elle que le nom du fond imitait
  it("keeps the row of « Délai » with its classes and its value", () => {
    const html = settingsHtml();
    const [, delayRow = ""] =
      html.match(
        /<div class="([^"]*)"><label[^>]*>Délai<\/label><span class="lp-type-numeric">10 s<\/span>/,
      ) ?? [];

    expect(delayRow).toBe("lp-slider-row lp-type-body");
    expect(html).toContain("Le temps de retirer un pixel avant qu&#x27;il n&#x27;arrive sur le stream.");
  });

  // Plus de palette, de pastille ni de nom sous une pastille
  it("puts no palette in the section: no swatch, no row of them, no name under one", () => {
    const html = settingsHtml();

    expect(html).not.toContain("lp-palette");
    expect(html).not.toContain("lp-swatch");
    expect(html).not.toContain("lp-swatch-option");
  });

  // La phrase de la marche à suivre reste, celle du fond est partie avec lui
  it("keeps the sentence of the walkthrough, and drops the one of the background", () => {
    const html = settingsHtml();

    expect(html).toContain("Dans OBS Studio ou Streamlabs");
    expect(html).not.toContain("Transparent, le stream montre");
  });

  // La CSP de production bloque l'attribut `style` du HTML du serveur : la section n'en porte aucun
  it("carries no inline style: the production CSP would block it", () => {
    expect(settingsHtml()).not.toMatch(/\sstyle=/);
  });
});

// Écart §8.1 (JOURNAL 2026-10-09) : le champ qui copie l'adresse est la cible de la dernière bulle de la chaîne OBS
describe("l'adresse à copier, cible d'une bulle d'aide (Écart §8.1, JOURNAL 2026-10-09)", () => {
  const refs: BubbleTargets = {
    trace: { current: null },
    submit: { current: null },
    gauge: { current: null },
    claim: { current: null },
    settings: { current: null },
    reports: { current: null },
    "obs-tab": { current: null },
    "obs-address": { current: null },
  };
  const props = {
    address: "liveplace.test/kalyss",
    url: "https://liveplace.test/kalyss",
    obsDelayMs: 10_000,
    onPickDelay: doNothing,
  } as const;

  // Dans la page de jeu : un `<span>` entoure le champ, et lui seul, que la bulle vise
  it("wraps the copy field, and only it, in a span the bubble can aim at, in the game page", () => {
    const html = renderToString(
      createElement(BubbleTargetsContext, { value: refs }, createElement(ObsSettings, props)),
    );

    expect([...html.matchAll(/<span class="lp-bubble-target">/g)]).toHaveLength(1);
    expect(html).toMatch(/<span class="lp-bubble-target"><button[^>]*class="lp-btn lp-copy lp-type-body"/);
  });

  // Hors de la page de jeu (/design), le champ reste seul
  it("leaves the field alone outside the game page", () => {
    expect(settingsHtml()).not.toContain("lp-bubble-target");
  });
});
