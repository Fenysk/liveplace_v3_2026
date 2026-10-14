import { describe, expect, it } from "vitest";
import { DRAFT_TEXTS } from "./draft-texts";

const fr = DRAFT_TEXTS.fr;
const en = DRAFT_TEXTS.en;

const CODES = [
  "protocol_version",
  "unauthenticated",
  "forbidden",
  "rate_limited",
  "invalid_frame",
  "canvas_not_found",
  "canvas_archived",
  "server_full",
] as const;

describe("the tip of the gauge (JOURNAL 2026-09-30, Écart §14)", () => {
  const full = { charges: 10, max: 10, claimable: 0 };

  // Jauge pleine : les pixels sur le maximum, et rien d'autre
  it("says the pixels and that the gauge is full", () => {
    expect(fr.gaugeLabel(full)).toBe("10 / 10 pixels, jauge pleine");
    expect(en.gaugeLabel(full)).toBe("10 / 10 pixels, gauge full");
  });

  // En recharge : le prochain pixel et son compte à rebours, et ce qu'il resterait après le brouillon
  it("says the next pixel with its countdown, and what is left after the draft", () => {
    const refilling = {
      charges: 8,
      max: 10,
      afterPlacement: 5,
      nextRefill: { charges: 1, countdown: "12 s" },
      claimable: 0,
    };

    expect(fr.gaugeLabel(refilling)).toBe("8 / 10 pixels, 5 après ce dessin, +1 pixel dans 12 s");
    expect(en.gaugeLabel(refilling)).toBe("8 / 10 pixels, 5 after this drawing, +1 pixel in 12 s");
  });

  // Plusieurs pixels par recharge : au pluriel, avec une durée à la minute
  it("says the next pixels in the plural, with the countdown in minutes", () => {
    const refilling = {
      charges: 8,
      max: 20,
      nextRefill: { charges: 3, countdown: "1 min 05 s" },
      claimable: 1,
    };

    expect(fr.gaugeLabel(refilling)).toBe(
      "8 / 20 pixels, +3 pixels dans 1 min 05 s, 1 récompense à réclamer",
    );
    expect(en.gaugeLabel(refilling)).toBe("8 / 20 pixels, +3 pixels in 1 min 05 s, 1 reward to claim");
  });

  // Une récompense à réclamer : « 1 récompense », puis au pluriel
  it("says the rewards to claim, in the singular for one", () => {
    expect(fr.gaugeLabel({ ...full, claimable: 1 })).toBe(
      "10 / 10 pixels, jauge pleine, 1 récompense à réclamer",
    );
    expect(fr.gaugeLabel({ ...full, claimable: 2 })).toContain("2 récompenses à réclamer");
    expect(en.gaugeLabel({ ...full, claimable: 1 })).toBe("10 / 10 pixels, gauge full, 1 reward to claim");
    expect(en.gaugeLabel({ ...full, claimable: 2 })).toContain("2 rewards to claim");
  });
});

describe("the tip of Attendre (Écart §9.3, JOURNAL 2026-10-13)", () => {
  // Le bouton attend le prochain pixel : le mot « charge » ne se dit plus à l'écran
  it("says the next pixel, never a charge", () => {
    expect(fr.waitTip).toBe("Attendre le prochain pixel");
    expect(en.waitTip).toBe("Wait for the next pixel");
  });
});

describe("the refusals of the gateway (Écart §14, JOURNAL 2026-10-07)", () => {
  // Le gateway n'envoie qu'un code : chacun a sa phrase, dans chaque langue, jamais le code lui-même
  it("gives every code its own sentence in each language, and never the code itself", () => {
    for (const code of CODES) {
      expect(fr.refusal(code)).not.toContain(code);
      expect(en.refusal(code)).not.toContain(code);
    }
    expect(new Set(CODES.map((code) => fr.refusal(code))).size).toBe(CODES.length);
    expect(new Set(CODES.map((code) => en.refusal(code))).size).toBe(CODES.length);
    expect(en.refusal("rate_limited")).toBe("Too fast: try again in a moment.");
  });
});

describe("the button that leaves the Draw mode (Écart §9.3, JOURNAL 2026-10-13)", () => {
  // Il ferme le mode Dessin et garde le brouillon : sa bulle le dit, dans chaque langue
  it("tells that the draft is kept when the Draw mode closes", () => {
    expect(fr.closeTip).toBe("Fermer le mode Dessin : le brouillon est gardé");
    expect(en.closeTip).toBe("Close Draw mode: your draft is kept");
  });
});
