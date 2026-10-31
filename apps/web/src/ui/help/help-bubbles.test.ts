import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HELP_BUBBLES, type HelpBubble } from "../../state/help-bubbles";
import { HelpBubbleLine, helpTargetOf } from "./help-bubbles";

const lineOf = (bubble: HelpBubble, isTouchScreen: boolean): string =>
  renderToStaticMarkup(
    createElement(HelpBubbleLine, {
      bubble,
      isTouchScreen,
      refill: { refillMs: 10_000, refillCharges: 1 },
      gaugeMax: 20,
    }),
  );

describe("les bulles d'aide, chacune sur sa cible (Écart §8.1, JOURNAL 2026-10-08 et 2026-10-09)", () => {
  // Chaque bulle vise son propre élément : le bouton au point des signalements, Réglages, l'onglet Vue OBS, l'adresse, le +1, le bouton Modération,
  // Effacer ses dessins, la jauge, le pinceau, Valider, la couleur actuelle, rien (les touches : au-dessus de la barre du bas), la pipette ;
  // le même bouton que l'adresse OBS pour le partage, le champ du thème et l'onglet Modération pour la suite de la chaîne du streamer
  it("aims each bubble at its own element", () => {
    expect(HELP_BUBBLES.map(helpTargetOf)).toEqual([
      "reports",
      "settings",
      "obs-tab",
      "obs-address",
      "obs-address",
      "theme",
      "moderation-tab",
      "claim",
      "reports",
      "clear",
      "gauge",
      "trace",
      undefined,
      "submit",
      "palette",
      undefined,
      "eyedropper",
    ]);
  });

  // Les mots validés, posés dans une ligne de bulle avec une icône muette
  it("says the validated words of each bubble, with a silent icon", () => {
    const text = (bubble: HelpBubble): string => lineOf(bubble, true);

    expect(text("pending-report")).toContain("Un dessin a été signalé");
    expect(text("obs-settings")).toContain("Ajoute ta fresque à OBS ici");
    expect(text("obs-tab")).toContain("Ton adresse OBS est dans cet onglet");
    expect(text("obs-address")).toContain("Copie cette adresse, colle-la dans OBS");
    expect(text("invite-link")).toContain("Partage aussi ce lien à tes viewers");
    expect(text("theme")).toContain("Donne un thème à ta fresque");
    expect(text("twitch-sync")).toContain("Reprends tes modérateurs Twitch ici");
    expect(text("first-reward")).toContain("Une récompense t&#x27;attend\u00a0: ta jauge passe à 21 pixels");
    expect(text("moderator-welcome")).toContain("Tu modères cette fresque\u00a0: tout est ici");
    expect(text("moderation-actions")).toContain("Efface ses dessins ou bannis ce viewer ici");
    expect(text("empty-gauge")).toContain("Ta jauge se recharge toute seule\u00a0: 1 pixel toutes les 10 s");
    expect(text("draft-trace")).toContain("Active le tracé pour dessiner en glissant");
    expect(text("draft-space")).toContain("Maintiens Espace et glisse pour tracer");
    expect(text("first-draft")).toContain(
      "Touche la fresque pour préparer ton dessin, Valider l&#x27;envoie",
    );
    expect(text("palette")).toContain("Touche ta couleur pour ouvrir la palette");
    expect(text("keys")).not.toContain("1 à 5");
    expect(text("keys")).toContain("Ctrl+Z\u00a0: annule ton dernier trait");
    expect(text("eyedropper")).toContain("La pipette reprend une couleur de la fresque");
    for (const bubble of HELP_BUBBLES) expect(text(bubble)).toContain('aria-hidden="true"');
  });

  // À la souris, la bulle du premier passage dit « Clique »
  it("says click instead of touch for the first Draft pass with a mouse", () => {
    expect(lineOf("first-draft", false)).toContain("Clique sur la fresque pour préparer ton dessin");
  });
});

describe("les lignes d'une bulle d'aide (Écart §8.1, JOURNAL 2026-10-12)", () => {
  // Une seule ligne par bulle, chacune avec son icône : celle de Ctrl+Z n'a plus que lui (Alexis a retiré « 1 à 5 »)
  it("holds exactly one line per bubble, each with its own icon, the Ctrl+Z one included", () => {
    const linesOf = (bubble: HelpBubble): number =>
      lineOf(bubble, false).match(/lp-bubble-line/g)?.length ?? 0;

    expect(linesOf("keys")).toBe(1);
    expect(lineOf("keys", false).match(/<svg/g)).toHaveLength(1);
    expect(HELP_BUBBLES.map(linesOf)).toEqual(HELP_BUBBLES.map(() => 1));
  });

  // Les touches et Espace n'ont pas de cible : un geste du clavier n'a pas de bouton, la bulle se pose au-dessus de la barre du bas,
  // comme le conseil de première visite
  it("gives the keys and Space no target: they sit above the bottom bar", () => {
    expect(helpTargetOf("keys")).toBeUndefined();
    expect(helpTargetOf("draft-space")).toBeUndefined();
    for (const bubble of HELP_BUBBLES.filter((other) => other !== "keys" && other !== "draft-space"))
      expect(helpTargetOf(bubble)).toBeDefined();
  });
});
