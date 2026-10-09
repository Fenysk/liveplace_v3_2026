import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BubbleTarget, type BubbleTargets, BubbleTargetsContext } from "./bubble-target";

// Les enfants passent par un objet : `createElement` les veut dans les props, et le lint refuse `children:` écrit à la main.
const content = { children: createElement("em", null, "Valider") };
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

describe("la cible d'une bulle (Écart §8.1, JOURNAL 2026-10-08)", () => {
  // Hors de la page de jeu (/design, la connexion), l'élément reste seul : aucun `<span>` de plus
  it("leaves the element alone outside the game page", () => {
    expect(renderToStaticMarkup(createElement(BubbleTarget, { name: "submit", ...content }))).toBe(
      "<em>Valider</em>",
    );
  });

  // Dans la page de jeu, un `<span>` l'enveloppe, que la bulle peut viser
  it("wraps the element in a span the bubble can aim at, in the game page", () => {
    const markup = renderToStaticMarkup(
      createElement(
        BubbleTargetsContext,
        { value: refs },
        createElement(BubbleTarget, { name: "submit", ...content }),
      ),
    );

    expect(markup).toBe('<span class="lp-bubble-target"><em>Valider</em></span>');
  });
});
