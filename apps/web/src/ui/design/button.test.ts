import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button } from "./button";

const noop = (): void => undefined;
const render = (props: { label: string; reservedLabel?: string; labelLead?: string }): string =>
  renderToStaticMarkup(createElement(Button, { onPress: noop, ...props }));

describe("le bouton qui garde la largeur de son plus long libellé (§9.6)", () => {
  // Le libellé plus court ne rétrécit pas le bouton : le plus long se réserve, invisible, à côté de lui
  it("reserves the widest label next to the shown one, without saying it twice", () => {
    const markup = render({ label: "Valider · 3", reservedLabel: "Valider · 99" });

    expect(markup).toContain('data-reserve="Valider · 99"');
    expect(markup).toContain("Valider · 3");
    expect(markup).toContain('aria-label="Valider · 3"');
  });

  // Sans réserve, le bouton est ce qu'il était : aucun habillage de plus
  it("adds nothing around the label when nothing is reserved", () => {
    expect(render({ label: "Valider" })).not.toContain("data-reserve");
  });
});

describe("le bouton inactif (JOURNAL 2026-11-12)", () => {
  const markup = (props: { isDisabled?: boolean; isInactive?: boolean }): string =>
    renderToStaticMarkup(createElement(Button, { onPress: noop, label: "Dessiner", ...props }));

  // Grisé mais pressable : aria-disabled et sa classe, jamais l\u2019attribut disabled qui retiendrait le clic
  it("is greyed but pressable: aria-disabled and its class, never the disabled attribute", () => {
    const inactive = markup({ isInactive: true });

    expect(inactive).toContain("lp-btn--inactive");
    expect(inactive).toContain('aria-disabled="true"');
    expect(inactive).not.toMatch(/ disabled/);
  });

  // Sans lui, le bouton n\u2019a ni classe ni aria-disabled ; désactivé, il garde l\u2019attribut disabled
  it("has neither class nor aria-disabled without it, and keeps disabled when disabled", () => {
    expect(markup({})).not.toContain("aria-disabled");
    expect(markup({})).not.toContain("lp-btn--inactive");
    expect(markup({ isDisabled: true })).toMatch(/ disabled/);
  });
});
