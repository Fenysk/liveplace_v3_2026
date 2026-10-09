import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HELP_BUBBLES, type HelpBubble } from "../../state/help-bubbles";
import { HelpBubbleLine, helpTargetOf } from "./help-bubbles";

const lineOf = (bubble: HelpBubble, isTouchScreen: boolean): string =>
  renderToStaticMarkup(
    createElement(HelpBubbleLine, { bubble, isTouchScreen, refill: { refillMs: 10_000, refillCharges: 1 } }),
  );

describe("les bulles d'aide, chacune sur sa cible (Écart §8.1, JOURNAL 2026-10-08 et 2026-10-09)", () => {
  // Chaque bulle vise son propre élément : le bouton au point des signalements, Réglages, l'onglet Vue OBS, l'adresse, le +1, la jauge, le pinceau, Valider
  it("aims each bubble at its own element", () => {
    expect(HELP_BUBBLES.map(helpTargetOf)).toEqual([
      "reports",
      "settings",
      "obs-tab",
      "obs-address",
      "claim",
      "gauge",
      "trace",
      "submit",
    ]);
  });

  // Les mots validés, posés dans une ligne de bulle avec une icône muette
  it("says the validated words of each bubble, with a silent icon", () => {
    const texts = HELP_BUBBLES.map((bubble) => lineOf(bubble, true));

    expect(texts[0]).toContain("Un pixel a été signalé");
    expect(texts[1]).toContain("Ajoute ton canvas à OBS ici");
    expect(texts[2]).toContain("Ton adresse OBS est dans cet onglet");
    expect(texts[3]).toContain("Copie cette adresse, colle-la dans OBS");
    expect(texts[4]).toContain("Une récompense t&#x27;attend : +1 sur ta jauge max");
    expect(texts[5]).toContain("Ta jauge se recharge toute seule : un pixel toutes les 10 s");
    expect(texts[6]).toContain("Active le tracé pour dessiner en glissant");
    expect(texts[7]).toContain("Touche le canvas pour préparer ton dessin, Valider l&#x27;envoie");
    for (const markup of texts) expect(markup).toContain('aria-hidden="true"');
  });

  // À la souris, la bulle du premier passage dit « Clique »
  it("says click instead of touch for the first Draft pass with a mouse", () => {
    expect(lineOf("first-draft", false)).toContain("Clique sur le canvas pour préparer ton dessin");
  });
});
