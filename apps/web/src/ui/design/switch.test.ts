import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Switch } from "./switch";

// L'interrupteur : un vrai bouton `switch`, qui s'active au clavier comme à la souris, et dont la piste et le rond ont leurs mesures.

const css = readFileSync(join(import.meta.dirname, "switch.css"), "utf8").replace(/\s+/g, " ");
const props = { label: "Événement", onLabel: "Activé", offLabel: "Désactivé" };
const render = (isOn: boolean, isDisabled = false): string =>
  renderToStaticMarkup(createElement(Switch, { ...props, isOn, onToggle: () => undefined, isDisabled }));

describe("l'interrupteur", () => {
  // Un `<button role="switch">` natif : Espace et Entrée le déclenchent sans code de plus, et il prend le focus au clavier
  it("is a native button with the switch role, so Space and Enter work and the Tab key reaches it", () => {
    const markup = render(false);

    expect(markup).toMatch(/^<button type="button" role="switch"/);
    expect(markup).not.toContain("tabindex");
    expect(css).toMatch(/\.lp-switch:focus-visible \{ outline: 2px solid var\(--focus-ring\)/);
  });

  // L'état est dit par `aria-checked`, le nom par `aria-label` ; le libellé d'état écrit à gauche est caché au lecteur d'écran
  it("tells its state by aria-checked and its name by aria-label, and hides the written state from screen readers", () => {
    expect(render(true)).toContain('aria-checked="true"');
    expect(render(false)).toContain('aria-checked="false"');
    expect(render(true)).toContain('aria-label="Événement"');
    expect(render(true)).toContain('<span class="lp-switch-state" aria-hidden="true">Activé</span>');
    expect(render(false)).toContain('<span class="lp-switch-state" aria-hidden="true">Désactivé</span>');
  });

  // Le libellé d'état est à gauche de la piste
  it("writes the state to the left of the track", () => {
    const markup = render(true);

    expect(markup.indexOf("lp-switch-state")).toBeLessThan(markup.indexOf("lp-switch-track"));
  });

  // Un clic (que le clavier déclenche aussi sur un bouton) rend l'état inverse ; désactivé, le bouton ne se déclenche pas
  it("hands back the opposite state on a click, and is not clickable when disabled", () => {
    const received: { isOn: boolean }[] = [];
    const element = Switch({
      ...props,
      isOn: false,
      onToggle: (isOn) => received.push({ isOn }),
    }) as ReactElement<{
      onClick: () => void;
    }>;
    element.props.onClick();
    const back = Switch({
      ...props,
      isOn: true,
      onToggle: (isOn) => received.push({ isOn }),
    }) as ReactElement<{
      onClick: () => void;
    }>;
    back.props.onClick();

    expect(received).toEqual([{ isOn: true }, { isOn: false }]);
    expect(render(false, true)).toContain("disabled");
    expect(render(false)).not.toContain("disabled");
  });

  // La piste mesure 44 × 26 px, le rond 20 px ; la piste est à l'encre activée, à la puce sinon
  it("measures 44 by 26 px for the track and 20 px for the thumb, ink when on and chip when off", () => {
    expect(css).toMatch(
      /\.lp-switch-track \{[^}]*width: 44px; height: 26px;[^}]*background: var\(--chip-hover\)/,
    );
    expect(css).toMatch(/\.lp-switch-thumb \{[^}]*width: 20px; height: 20px; border-radius: 50%/);
    expect(css).toMatch(/\.lp-switch\[aria-checked="true"\] \.lp-switch-track \{ background: var\(--ink\)/);
    expect(css).toMatch(
      /\.lp-switch\[aria-checked="true"\] \.lp-switch-thumb \{ transform: translateX\(18px\)/,
    );
  });
});
