import { INSTANT_WINDOW_MS } from "@liveplace/domain/capacity";
import { describe, expect, it } from "vitest";
import { createDelayTally, MAX_DELAY_MS } from "./delay-tally";

// Écart §5.1 (JOURNAL 2026-10-07) : le délai de diffusion, d'une pose reçue à l'envoi de sa frame, p99 sur 5 minutes.
describe("the broadcast delay tally (JOURNAL 2026-10-07)", () => {
  const record = (tally: ReturnType<typeof createDelayTally>, delayMs: number, count: number) => {
    for (let index = 0; index < count; index++) tally.record(delayMs);
  };

  // Vaut zéro tant qu'aucune pose n'est partie : rien n'est lent
  it("is zero as long as no pose has been sent: nothing is slow", () => {
    expect(createDelayTally().getP99(0)).toBe(0);
  });

  // Prend le plus petit délai que 99 % des poses n'ont pas dépassé
  it("takes the smallest delay that 99 % of the poses did not exceed", () => {
    const fast = createDelayTally();
    record(fast, 10, 100);
    record(fast, 900, 1); // 1 pose sur 101 : au-dessus du centile
    const slow = createDelayTally();
    record(slow, 10, 98);
    record(slow, 900, 2); // 2 poses sur 100 : le centile est dans les lentes

    expect(fast.getP99(0)).toBe(10);
    expect(slow.getP99(0)).toBe(900);
  });

  // Ne garde que les 5 dernières minutes : une pose lente d'avant ne pèse plus
  it("keeps only the last 5 minutes: a slow pose from before weighs no more", () => {
    const tally = createDelayTally();
    record(tally, 800, 10);
    expect(tally.getP99(0)).toBe(800);

    record(tally, 20, 10);

    expect(tally.getP99(INSTANT_WINDOW_MS - 1)).toBe(800); // la tranche lente est celle de l'instant 0, encore dedans
    expect(tally.getP99(INSTANT_WINDOW_MS)).toBe(20); // elle est sortie, les 20 ms de l'instant d'avant restent
    expect(tally.getP99(2 * INSTANT_WINDOW_MS)).toBe(0); // puis plus rien
  });

  // La tranche en cours compte dès sa lecture, avec celles d'avant
  it("counts the slice in progress as soon as it is read, with the ones from before", () => {
    const tally = createDelayTally();
    record(tally, 100, 50);
    tally.getP99(10_000);

    record(tally, 300, 50);

    expect(tally.getP99(20_000)).toBe(300);
  });

  // Range tout délai au-delà du plafond dans le dernier compteur, et un délai négatif (horloge qui recule) à zéro
  it("puts any delay beyond the cap in the last counter, and a negative delay (a clock going back) at zero", () => {
    const late = createDelayTally();
    record(late, MAX_DELAY_MS * 10, 5);
    const early = createDelayTally();
    record(early, -50, 5);

    expect(late.getP99(0)).toBe(MAX_DELAY_MS);
    expect(early.getP99(0)).toBe(0);
  });
});
