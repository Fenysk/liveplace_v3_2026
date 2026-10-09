import { OBS_BACKGROUNDS, type ObsBackground } from "@liveplace/domain";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { type BubbleTargets, BubbleTargetsContext } from "../help/bubble-target";
import { ObsSettings } from "./obs-settings";

const doNothing = (): void => undefined;

const BACKGROUND_NAMES: Record<ObsBackground, string> = {
  transparent: "Transparent",
  black: "Noir",
  white: "Blanc",
};

// Le contenu de la légende : le titre du groupe, puis le nom du choix à sa droite
const legendOf = (html: string): string => html.match(/<legend[^>]*>(.*?)<\/legend>/)?.[1] ?? "";

const settingsHtml = (obsBackground: ObsBackground, isTouch = false): string =>
  renderToString(
    createElement(ObsSettings, {
      address: "liveplace.test/kalyss",
      url: "https://liveplace.test/kalyss",
      obsDelayMs: 10_000,
      onPickDelay: doNothing,
      obsBackground,
      onPickBackground: doNothing,
      isTouch,
    }),
  );

describe("the background of the OBS view in the settings (CDC 2026 §1)", () => {
  // Plus d'interrupteur : le clavier de couleurs du PNG, sous « Fond de la vue OBS »
  it("shows the color keyboard of the PNG under « Fond de la vue OBS », and no switch any more", () => {
    const html = settingsHtml("transparent");

    expect(html).toContain("<legend");
    expect(html).toContain("Fond de la vue OBS");
    expect(html).not.toContain("Fond transparent");
    expect(html).not.toContain('type="checkbox"');
  });

  // Transparent, Noir, Blanc, dans cet ordre, sans nom dessous ; le noir et le blanc par une classe de teinte
  it("offers Transparent, Noir and Blanc in that order, black and white by a tone class, transparent by the checker", () => {
    const html = settingsHtml("transparent");
    const swatches = [...html.matchAll(/<button[^>]*class="(lp-swatch[^"]*)"[^>]*aria-label="([^"]*)"/g)].map(
      ([, className, label]) => [className, label],
    );

    expect(swatches).toEqual([
      ["lp-swatch is-transparent", "Transparent"],
      ["lp-swatch lp-swatch--png-black", "Noir"],
      ["lp-swatch lp-swatch--png-white", "Blanc"],
    ]);
  });

  // Un réglage : la valeur actuelle est toujours sélectionnée, jamais de choix vide
  it("always selects the current value, whichever it is, and only it", () => {
    for (const background of OBS_BACKGROUNDS) {
      const pressed = [
        ...settingsHtml(background).matchAll(/aria-label="([^"]*)"[^>]*aria-pressed="true"/g),
      ].map(([, label]) => label);

      expect(pressed).toEqual([BACKGROUND_NAMES[background]]);
    }
  });

  // JOURNAL 2026-10-10 : le nom du fond choisi est à droite du titre, comme « 10 s » à droite de « Délai », et caché aux lecteurs
  it("names the chosen background on the right of the title, whichever it is, and hides that name from screen readers", () => {
    for (const background of OBS_BACKGROUNDS) {
      expect(legendOf(settingsHtml(background))).toMatch(
        new RegExp(
          `^Fond de la vue OBS<span class="lp-type-numeric" aria-hidden="true">${BACKGROUND_NAMES[background]}</span>$`,
        ),
      );
    }
  });

  // La rangée du titre prend les classes de celle du Délai : les deux réglages voisins se ressemblent
  it("lays the title row out with the classes of the row of « Délai » and its value", () => {
    const html = settingsHtml("black");
    const [, delayRow = ""] =
      html.match(
        /<div class="([^"]*)"><label[^>]*>Délai<\/label><span class="lp-type-numeric">10 s<\/span>/,
      ) ?? [];
    const [, legendClasses = ""] = html.match(/<legend class="([^"]*)">/) ?? [];

    expect(delayRow).toBe("lp-slider-row lp-type-body");
    for (const className of delayRow.split(" ")) expect(legendClasses.split(" ")).toContain(className);
  });

  // JOURNAL 2026-10-10 : les noms de largeurs différentes rendaient les écarts inégaux ; les pastilles sont seules dans leur rangée
  it("puts no name under the swatches: the row holds the three buttons only, with no label around them", () => {
    const html = settingsHtml("black");
    const row = html.match(/<div class="lp-palette lp-palette--choice[^"]*">(.*?)<\/div>/)?.[1] ?? "";

    expect(row.match(/<button[^>]*><\/button>/g)).toHaveLength(OBS_BACKGROUNDS.length);
    expect(row.replace(/<button[^>]*><\/button>/g, "")).toBe("");
    expect(html).not.toContain("lp-swatch-option");
  });

  // Sur un écran étroit ou tactile : les pastilles rondes de la taille d'un contrôle, comme dans la fenêtre du PNG
  it("gives round touch swatches on a narrow or touch screen, and the compact ones otherwise", () => {
    expect(settingsHtml("white", true)).toContain("lp-palette--touch");
    expect(settingsHtml("white")).not.toContain("lp-palette--touch");
  });

  // La CSP de production bloque l'attribut `style` du HTML du serveur : les pastilles ont leur teinte par une classe
  it("carries no inline style: the production CSP would block it", () => {
    for (const background of OBS_BACKGROUNDS) expect(settingsHtml(background)).not.toMatch(/\sstyle=/);
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
    obsBackground: "transparent",
    onPickBackground: doNothing,
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
    expect(settingsHtml("transparent")).not.toContain("lp-bubble-target");
  });
});
