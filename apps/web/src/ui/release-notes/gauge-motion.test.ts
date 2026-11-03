import { describe, expect, it } from "vitest";
import { CLAIM_CLICK_MS, CLAIM_SPOT, GAUGE_LOOP_MS, GAUGE_RESTING_MS, gaugeAt } from "./gauge-motion";

describe("Augmente ta jauge (vignette)", () => {
  // L'image fixe : le +1 à côté de la jauge pleine, sans rien d'enfoncé ni de grossi
  it("rests on the +1 next to the full gauge, before the claim", () => {
    const moment = gaugeAt(GAUGE_RESTING_MS);

    expect(moment.isClaimed).toBe(false);
    expect(moment.grow).toBe(0);
    expect(moment.claimTap).toBe(0);
    expect(moment.pill).toBe(1);
  });

  // La souris est sur le +1 au clic, qui l'enfonce ; la récompense n'est réclamée qu'après le clic
  it("puts the tip on the +1 at the click, and claims the reward right after it", () => {
    const onClaim = gaugeAt(CLAIM_CLICK_MS);

    expect([onClaim.pointer.ax, onClaim.pointer.ay, onClaim.pointer.bx, onClaim.pointer.by]).toEqual([
      CLAIM_SPOT.ax,
      CLAIM_SPOT.ay,
      CLAIM_SPOT.bx,
      CLAIM_SPOT.by,
    ]);
    expect(onClaim.claimTap).toBe(1);
    expect(onClaim.press).toBe(1);
    expect(gaugeAt(CLAIM_CLICK_MS - 100).isClaimed).toBe(false);
    expect(gaugeAt(CLAIM_CLICK_MS + 100).isClaimed).toBe(true);
  });

  // Le tube grossit un instant après la récompense, puis revient à sa taille
  it("grows the tube for an instant after the claim, then brings it back", () => {
    expect(gaugeAt(CLAIM_CLICK_MS).grow).toBe(0);
    expect(gaugeAt(CLAIM_CLICK_MS + 80 + 350).grow).toBe(1);
    expect(gaugeAt(CLAIM_CLICK_MS + 80 + 700).grow).toBe(0);
    expect(gaugeAt(5000).grow).toBe(0);
  });

  // La pill s'efface, redevient celle du départ pendant qu'elle est invisible, et revient avant le clic suivant
  it("fades the pill out, resets it while invisible, and brings it back before the next click", () => {
    expect(gaugeAt(5000).isClaimed).toBe(true);
    expect(gaugeAt(7550).pill).toBeGreaterThan(0);
    expect(gaugeAt(7550).pill).toBeLessThan(1);
    expect(gaugeAt(7800).pill).toBe(0);
    expect(gaugeAt(7800).isClaimed).toBe(false);
    expect(gaugeAt(8300).pill).toBe(1);
    expect(gaugeAt(GAUGE_LOOP_MS + 1000)).toEqual(gaugeAt(1000));
  });

  // La souris paraît avant son clic et part avec la pill
  it("shows the mouse before the click and fades it out with the pill", () => {
    expect(gaugeAt(0).pointer.opacity).toBe(0);
    expect(gaugeAt(1500).pointer.opacity).toBe(1);
    expect(gaugeAt(7550).pointer.opacity).toBeLessThan(1);
    expect(gaugeAt(7900).pointer.opacity).toBe(0);
  });
});
