import { describe, expect, it } from "vitest";
import {
  CHARITY_LOOP_MS,
  CHARITY_RESTING_MS,
  CLAIM_MS,
  CLAIM_SPOT,
  charityAt,
  GAUGE_AFTER,
  GAUGE_BEFORE,
  GAUGE_CAPACITY,
} from "./charity-motion";

const spotOf = ({ ax, ay, bx, by }: { ax: number; ay: number; bx: number; by: number }) => [ax, ay, bx, by];

describe("Événement caritatif (vignette)", () => {
  // L'image fixe : la ligne de don ouverte, la jauge d'avant le don, sans appui
  it("rests on the open donation line with the gauge as it was before the click", () => {
    const moment = charityAt(CHARITY_RESTING_MS);

    expect(moment.pills).toBe(1);
    expect(moment.donation).toBe(1);
    expect(moment.level).toBe(GAUGE_BEFORE);
    expect(moment.count).toBe(Math.round(GAUGE_BEFORE * GAUGE_CAPACITY));
    expect(moment.press).toBe(0);
  });

  // La boucle part de rien : pills effacées, pas de ligne de don, pas de souris
  it("starts from nothing: pills faded out, no donation line, no mouse", () => {
    const moment = charityAt(0);

    expect(moment.pills).toBe(0);
    expect(moment.donation).toBe(0);
    expect(moment.pointer.opacity).toBe(0);
    expect(moment.level).toBe(GAUGE_BEFORE);
  });

  // La souris vient sur +50 et clique : le bouton s'enfonce
  it("moves the mouse onto +50 and presses it", () => {
    const moment = charityAt(CLAIM_MS);

    expect(spotOf(moment.pointer)).toEqual(spotOf(CLAIM_SPOT));
    expect(moment.pointer.opacity).toBe(1);
    expect(moment.press).toBe(1);
    expect(moment.donation).toBe(1);
    expect(charityAt(CLAIM_MS - 300).press).toBe(0);
  });

  // Après le clic, la ligne de don se referme, la souris s'en va, puis la jauge monte jusqu'au plein
  it("closes the donation line after the click, then fills the gauge", () => {
    expect(charityAt(3200).donation).toBe(0);
    expect(charityAt(2800).donation).toBeGreaterThan(0);
    expect(charityAt(2800).donation).toBeLessThan(1);
    expect(charityAt(3000).pointer.opacity).toBe(0);
    expect(charityAt(CLAIM_MS).level).toBe(GAUGE_BEFORE);
    const rising = charityAt(3300);
    expect(rising.level).toBeGreaterThan(GAUGE_BEFORE);
    expect(rising.level).toBeLessThan(GAUGE_AFTER);
    const full = charityAt(4500);
    expect(full.level).toBe(GAUGE_AFTER);
    expect(full.count).toBe(GAUGE_CAPACITY);
  });

  // Tout s'efface en fondu, la jauge revient à son niveau pills effacées, et la boucle se referme sans saut
  it("fades everything out, then closes the loop without a jump", () => {
    expect(charityAt(6000).pills).toBeGreaterThan(0);
    expect(charityAt(6000).pills).toBeLessThan(1);
    expect(charityAt(6400).pills).toBe(0);
    expect(charityAt(6400).level).toBe(GAUGE_BEFORE);
    expect(charityAt(CHARITY_LOOP_MS)).toEqual(charityAt(0));
  });
});
