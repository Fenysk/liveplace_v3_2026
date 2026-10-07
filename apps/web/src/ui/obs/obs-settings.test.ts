import { OBS_BACKGROUNDS, type ObsBackground } from "@liveplace/domain";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ObsSettings } from "./obs-settings";

const doNothing = (): void => undefined;

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

  // Transparent, Noir, Blanc, dans cet ordre, chacun sous son nom ; le noir et le blanc par une classe de teinte
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
    const labels: Record<ObsBackground, string> = {
      transparent: "Transparent",
      black: "Noir",
      white: "Blanc",
    };

    for (const background of OBS_BACKGROUNDS) {
      const pressed = [
        ...settingsHtml(background).matchAll(/aria-label="([^"]*)"[^>]*aria-pressed="true"/g),
      ].map(([, label]) => label);

      expect(pressed).toEqual([labels[background]]);
    }
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
