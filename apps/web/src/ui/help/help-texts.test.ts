import { describe, expect, it } from "vitest";
import {
  draftText,
  everyText,
  gaugeText,
  OBS_TEXT,
  REPORT_TEXT,
  REWARD_TEXT,
  TRACE_TEXT,
} from "./help-texts";

describe("les mots des bulles d'aide (Écart §8.1, JOURNAL 2026-10-08)", () => {
  // Les textes validés par le propriétaire du produit, mot pour mot
  it("keeps the validated texts word for word", () => {
    expect(TRACE_TEXT).toBe("Active le tracé pour dessiner en glissant");
    expect(REWARD_TEXT).toBe("Une récompense t'attend : +1 sur ta jauge max");
    expect(OBS_TEXT).toBe("Ajoute ton canvas à OBS ici");
    expect(REPORT_TEXT).toBe("Un pixel a été signalé");
  });

  // Au doigt on touche, à la souris on clique : le verbe suit l'écran
  it("says touch on a touch screen and click with a mouse", () => {
    expect(draftText(true)).toBe("Touche le canvas pour préparer ton dessin, Valider l'envoie");
    expect(draftText(false)).toBe("Clique sur le canvas pour préparer ton dessin, Valider l'envoie");
  });

  // Une charge toutes les 10 s : les chiffres du canvas, au singulier
  it("tells the refill of the canvas, in the singular for one pixel", () => {
    expect(gaugeText({ refillMs: 10_000, refillCharges: 1 })).toBe(
      "Ta jauge se recharge toute seule : un pixel toutes les 10 s",
    );
  });

  // Plusieurs charges par recharge : au pluriel, avec le nombre
  it("tells the refill in the plural when one refill gives several pixels", () => {
    expect(gaugeText({ refillMs: 30_000, refillCharges: 3 })).toBe(
      "Ta jauge se recharge toute seule : 3 pixels toutes les 30 s",
    );
  });

  // Sans les chiffres du canvas (avant le `welcome`), elle n'en invente pas
  it("invents no figure without the refill of the canvas", () => {
    expect(gaugeText(undefined)).toBe("Ta jauge se recharge toute seule");
  });

  // L'intervalle se lit en secondes, minutes ou heures, avec le singulier qu'il faut
  it("reads an interval in seconds, minutes or hours", () => {
    expect(everyText(500)).toBe("toutes les 500 ms");
    expect(everyText(1000)).toBe("toutes les secondes");
    expect(everyText(10_000)).toBe("toutes les 10 s");
    expect(everyText(60_000)).toBe("toutes les minutes");
    expect(everyText(120_000)).toBe("toutes les 2 min");
    expect(everyText(90_000)).toBe("toutes les 1 min 30 s");
    expect(everyText(3_600_000)).toBe("toutes les heures");
    expect(everyText(7_200_000)).toBe("toutes les 2 h");
    expect(everyText(5_400_000)).toBe("toutes les 1 h 30 min");
  });
});
