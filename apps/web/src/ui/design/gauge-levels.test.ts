import { describe, expect, it } from "vitest";
import { gaugeLevels, refillProgress } from "./gauge-levels";

describe("gaugeLevels", () => {
  // Sans brouillon, l'anneau montre les charges, et les deux fluides sont au même niveau
  it("montre les charges quand rien n'est réservé", () => {
    expect(gaugeLevels(5, 10, 0)).toEqual({ count: 5, remainingLevel: 0.5, chargesLevel: 0.5 });
  });

  // En mode Dessin, l'anneau montre ce qui restera après la pose, et le fluide réservé dépasse derrière
  it("retire le brouillon du nombre et du fluide restant", () => {
    expect(gaugeLevels(8, 10, 3)).toEqual({ count: 5, remainingLevel: 0.5, chargesLevel: 0.8 });
  });

  // Si le brouillon dépasse les charges (jauge dépensée ailleurs), alors rien ne reste, jamais moins que zéro
  it("ne descend jamais sous zéro", () => {
    expect(gaugeLevels(2, 10, 6)).toEqual({ count: 0, remainingLevel: 0, chargesLevel: 0.2 });
  });

  it("donne des niveaux nuls pour une jauge sans maximum", () => {
    expect(gaugeLevels(0, 0, 0)).toEqual({ count: 0, remainingLevel: 0, chargesLevel: 0 });
  });
});

describe("refillProgress", () => {
  const refill = { endsAt: 20_000, durationMs: 10_000 };

  // L'anneau avance en continu entre deux charges
  it("avance avec le temps écoulé depuis la dernière charge", () => {
    expect(refillProgress(refill, 15_000)).toBe(0.5);
    expect(refillProgress(refill, 12_500)).toBe(0.25);
  });

  // Si l'horloge du téléphone dépasse la prochaine charge avant l'ack, alors l'anneau reste plein, sans déborder
  it("reste entre 0 et 1", () => {
    expect(refillProgress(refill, 25_000)).toBe(1);
    expect(refillProgress(refill, 5_000)).toBe(0);
  });
});
