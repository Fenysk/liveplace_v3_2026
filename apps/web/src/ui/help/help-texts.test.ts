import { describe, expect, it } from "vitest";
import { everyText, HELP_TEXTS } from "./help-texts";

describe("les mots des bulles d'aide (Écart §8.1, JOURNAL 2026-10-08)", () => {
  // Les textes validés par le propriétaire du produit, mot pour mot
  it("keeps the validated texts word for word", () => {
    expect(HELP_TEXTS.fr.trace).toBe("Active le tracé pour dessiner en glissant");
    expect(HELP_TEXTS.fr.reward(20)).toBe("Une récompense t'attend\u00a0: ta jauge passe à 21 pixels");
    expect(HELP_TEXTS.fr.obs).toBe("Ajoute ta fresque à OBS ici");
    expect(HELP_TEXTS.fr.report).toBe("Un dessin a été signalé");
  });

  // La récompense dit son effet par le chiffre : la jauge actuelle + 1 ; sans les chiffres du canvas, elle n'en invente pas
  it("tells where the reward takes the gauge, without inventing a figure", () => {
    expect(HELP_TEXTS.fr.reward(10)).toBe("Une récompense t'attend\u00a0: ta jauge passe à 11 pixels");
    expect(HELP_TEXTS.fr.reward(undefined)).toBe("Une récompense t'attend");
  });

  // La suite de la chaîne du streamer, mot pour mot (Écart §8.1, JOURNAL 2026-10-12)
  it("keeps the validated texts of the streamer's bubbles in the window word for word", () => {
    expect(HELP_TEXTS.fr.inviteLink).toBe("Partage aussi ce lien à tes viewers");
    expect(HELP_TEXTS.fr.theme).toBe("Donne un thème à ta fresque");
    expect(HELP_TEXTS.fr.twitchSync).toBe("Reprends tes modérateurs Twitch ici");
  });

  // Les deux bulles de qui modère, mot pour mot (Écart §8.1, JOURNAL 2026-10-12)
  it("keeps the validated texts of the moderation bubbles word for word", () => {
    expect(HELP_TEXTS.fr.moderatorWelcome).toBe("Tu modères cette fresque\u00a0: tout est ici");
    expect(HELP_TEXTS.fr.moderationActions).toBe("Efface ses dessins ou bannis ce viewer ici");
  });

  // La bulle d'Espace, à la souris, mot pour mot (Écart §8.1, JOURNAL 2026-10-14)
  it("keeps the validated text of the Space bubble word for word", () => {
    expect(HELP_TEXTS.fr.space).toBe("Maintiens Espace et glisse pour tracer");
  });

  // Les trois conseils du Dessin, mot pour mot (Écart §8.1, JOURNAL 2026-10-12)
  it("keeps the validated texts of the Draft tips word for word", () => {
    expect(HELP_TEXTS.fr.palette).toBe("Touche ta couleur pour ouvrir la palette");
    expect(HELP_TEXTS.fr).not.toHaveProperty("keysRecent");
    expect(HELP_TEXTS.fr.keys).toBe("Ctrl+Z\u00a0: annule ton dernier trait");
    expect(HELP_TEXTS.fr.eyedropper).toBe("La pipette reprend une couleur de la fresque");
  });

  // Au doigt on touche, à la souris on clique : le verbe suit l'écran
  it("says touch on a touch screen and click with a mouse", () => {
    expect(HELP_TEXTS.fr.draft(true)).toBe("Touche la fresque pour préparer ton dessin, Valider l'envoie");
    expect(HELP_TEXTS.fr.draft(false)).toBe(
      "Clique sur la fresque pour préparer ton dessin, Valider l'envoie",
    );
  });

  // Une charge toutes les 10 s : les chiffres du canvas, au singulier
  it("tells the refill of the canvas, in the singular for one pixel", () => {
    expect(HELP_TEXTS.fr.gauge({ refillMs: 10_000, refillCharges: 1 })).toBe(
      "Ta jauge se recharge toute seule\u00a0: 1 pixel toutes les 10 s",
    );
  });

  // Plusieurs charges par recharge : au pluriel, avec le nombre
  it("tells the refill in the plural when one refill gives several pixels", () => {
    expect(HELP_TEXTS.fr.gauge({ refillMs: 30_000, refillCharges: 3 })).toBe(
      "Ta jauge se recharge toute seule\u00a0: 3 pixels toutes les 30 s",
    );
  });

  // Sans les chiffres du canvas (avant le `welcome`), elle n'en invente pas
  it("invents no figure without the refill of the canvas", () => {
    expect(HELP_TEXTS.fr.gauge(undefined)).toBe("Ta jauge se recharge toute seule");
  });

  // L'intervalle se lit en secondes, minutes ou heures, avec le singulier qu'il faut
  it("reads an interval in seconds, minutes or hours", () => {
    expect(everyText(500, "fr")).toBe("toutes les 500 ms");
    expect(everyText(1000, "fr")).toBe("toutes les secondes");
    expect(everyText(10_000, "fr")).toBe("toutes les 10 s");
    expect(everyText(60_000, "fr")).toBe("toutes les minutes");
    expect(everyText(120_000, "fr")).toBe("toutes les 2 min");
    expect(everyText(90_000, "fr")).toBe("toutes les 1 min 30 s");
    expect(everyText(3_600_000, "fr")).toBe("toutes les heures");
    expect(everyText(7_200_000, "fr")).toBe("toutes les 2 h");
    expect(everyText(5_400_000, "fr")).toBe("toutes les 1 h 30 min");
  });

  // La durée garde le format de l'interface : le mot qui suit le plus grand s'écrit sur deux chiffres
  it("writes the smaller word on two digits after the larger one", () => {
    expect(everyText(65_000, "fr")).toBe("toutes les 1 min 05 s");
    expect(everyText(7_500_000, "fr")).toBe("toutes les 2 h 05 min");
    expect(everyText(65_000, "en")).toBe("every 1 min 05 s");
    expect(everyText(7_500_000, "en")).toBe("every 2 h 05 min");
  });
});

describe("the help bubbles in English (Écart §14, JOURNAL 2026-10-07)", () => {
  // Chaque bulle a sa phrase anglaise, directe comme la française
  it("says every bubble in English", () => {
    expect(HELP_TEXTS.en.report).toBe("A drawing was reported");
    expect(HELP_TEXTS.en.obs).toBe("Add your canvas to OBS here");
    expect(HELP_TEXTS.en.obsTab).toBe("Your OBS address is in this tab");
    expect(HELP_TEXTS.en.obsAddress).toBe("Copy this address and paste it into OBS");
    expect(HELP_TEXTS.en.reward(20)).toBe("A reward is waiting: your gauge goes up to 21 pixels");
    expect(HELP_TEXTS.en.reward(undefined)).toBe("A reward is waiting");
    expect(HELP_TEXTS.en.trace).toBe("Turn on Trace to draw by dragging");
    expect(HELP_TEXTS.en.space).toBe("Hold Space and drag to draw");
    expect(HELP_TEXTS.en.inviteLink).toBe("Share this link with your viewers too");
    expect(HELP_TEXTS.en.theme).toBe("Give your canvas a theme");
    expect(HELP_TEXTS.en.twitchSync).toBe("Import your Twitch moderators here");
    expect(HELP_TEXTS.en.moderatorWelcome).toBe("You moderate this canvas: everything is here");
    expect(HELP_TEXTS.en.moderationActions).toBe("Clear their drawings or ban this viewer here");
    expect(HELP_TEXTS.en.palette).toBe("Tap your color to open the palette");
    expect(HELP_TEXTS.en).not.toHaveProperty("keysRecent");
    expect(HELP_TEXTS.en.keys).toBe("Ctrl+Z: undo your last stroke");
    expect(HELP_TEXTS.en.eyedropper).toBe("The eyedropper picks up a color from the canvas");
  });

  // Au doigt on tape, à la souris on clique
  it("says tap on a touch screen and click with a mouse", () => {
    expect(HELP_TEXTS.en.draft(true)).toBe("Tap the canvas to prepare your drawing, then Confirm to send it");
    expect(HELP_TEXTS.en.draft(false)).toBe(
      "Click the canvas to prepare your drawing, then Confirm to send it",
    );
  });

  // Le rythme de la recharge, au singulier et au pluriel, ou rien avant les chiffres du canvas
  it("tells the refill of the gauge in English, without inventing a figure", () => {
    expect(HELP_TEXTS.en.gauge({ refillMs: 10_000, refillCharges: 1 })).toBe(
      "Your gauge refills on its own: 1 pixel every 10 s",
    );
    expect(HELP_TEXTS.en.gauge({ refillMs: 30_000, refillCharges: 3 })).toBe(
      "Your gauge refills on its own: 3 pixels every 30 s",
    );
    expect(HELP_TEXTS.en.gauge(undefined)).toBe("Your gauge refills on its own");
  });

  // L'intervalle se lit « every … », avec le nom de l'unité quand elle vaut exactement une
  it("reads an interval with every", () => {
    expect(everyText(500, "en")).toBe("every 500 ms");
    expect(everyText(1000, "en")).toBe("every second");
    expect(everyText(60_000, "en")).toBe("every minute");
    expect(everyText(3_600_000, "en")).toBe("every hour");
    expect(everyText(90_000, "en")).toBe("every 1 min 30 s");
    expect(everyText(5_400_000, "en")).toBe("every 1 h 30 min");
  });
});
