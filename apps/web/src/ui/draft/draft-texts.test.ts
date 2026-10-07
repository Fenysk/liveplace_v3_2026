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

  // Jauge pleine : les charges sur le maximum, et rien d'autre
  it("says the charges and that the gauge is full", () => {
    expect(fr.gaugeLabel(full)).toBe("10 / 10 charges, jauge pleine");
    expect(en.gaugeLabel(full)).toBe("10 / 10 charges, gauge full");
  });

  // En recharge : la prochaine charge et le compte à rebours, et ce qu'il resterait en posant le brouillon
  it("says the next charge with its countdown, and what is left after placing the draft", () => {
    const refilling = {
      charges: 8,
      max: 10,
      afterPlacement: 5,
      nextRefill: { charges: 1, countdown: "0:08" },
      claimable: 0,
    };

    expect(fr.gaugeLabel(refilling)).toBe("5 après la pose, 8 / 10 charges, +1 dans 0:08");
    expect(en.gaugeLabel(refilling)).toBe("5 after placing, 8 / 10 charges, +1 in 0:08");
  });

  // Une récompense à réclamer : « 1 récompense », puis au pluriel
  it("says the rewards to claim, in the singular for one", () => {
    expect(fr.gaugeLabel({ ...full, claimable: 1 })).toBe(
      "10 / 10 charges, jauge pleine, 1 récompense à réclamer",
    );
    expect(fr.gaugeLabel({ ...full, claimable: 2 })).toContain("2 récompenses à réclamer");
    expect(en.gaugeLabel({ ...full, claimable: 1 })).toBe("10 / 10 charges, gauge full, 1 reward to claim");
    expect(en.gaugeLabel({ ...full, claimable: 2 })).toContain("2 rewards to claim");
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
