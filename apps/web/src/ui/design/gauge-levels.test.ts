import { describe, expect, it } from "vitest";
import { gaugeLevels, refillProgress, tiltDirection, timerText } from "./gauge-levels";

describe("gaugeLevels", () => {
  // Sans brouillon, les deux fluides sont au même niveau : les pixels sur la capacité
  it("met les deux fluides au niveau des pixels quand rien n'est réservé", () => {
    expect(gaugeLevels(5, 10, 0)).toEqual({ remainingLevel: 0.5, chargesLevel: 0.5 });
  });

  // Avec un brouillon, le fluide réservé dépasse derrière celui qui resterait après lui
  it("retire le brouillon du fluide restant, et le garde derrière", () => {
    expect(gaugeLevels(8, 10, 3)).toEqual({ remainingLevel: 0.5, chargesLevel: 0.8 });
  });

  // Si le brouillon dépasse les pixels (jauge dépensée ailleurs), alors rien ne reste, jamais moins que zéro
  it("ne descend jamais sous zéro", () => {
    expect(gaugeLevels(2, 10, 6)).toEqual({ remainingLevel: 0, chargesLevel: 0.2 });
  });

  it("donne des niveaux nuls pour une jauge sans maximum", () => {
    expect(gaugeLevels(0, 0, 0)).toEqual({ remainingLevel: 0, chargesLevel: 0 });
  });
});

describe("timerText (Écart §9.3, JOURNAL 2026-10-13)", () => {
  // Sous la minute, les secondes seules, sans unité : l'anneau n'a pas la place d'en écrire une
  it("writes the seconds alone under a minute", () => {
    expect(timerText(12)).toBe("12");
    expect(timerText(9)).toBe("9");
    expect(timerText(59)).toBe("59");
  });

  // Dès la minute, « 1:05 » : les secondes sur deux chiffres
  it("writes minutes and two-digit seconds from a minute", () => {
    expect(timerText(60)).toBe("1:00");
    expect(timerText(65)).toBe("1:05");
    expect(timerText(599)).toBe("9:59");
  });

  // Dès l'heure, heures et minutes : « 2h05 » ne se confond pas avec « 2:05 »
  it("writes hours and two-digit minutes from an hour", () => {
    expect(timerText(3600)).toBe("1h00");
    expect(timerText(7500)).toBe("2h05");
  });
});

describe("refillProgress", () => {
  const refill = { endsAt: 20_000, durationMs: 10_000, secondsLeft: 5 };

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

describe("tiltDirection", () => {
  // Le fluide s'incline dans le sens où son niveau bouge, et reste droit quand il ne bouge pas
  it("leans the way the level moves, and stays straight otherwise", () => {
    expect(tiltDirection(0.3, 0.8)).toBe(1);
    expect(tiltDirection(0.8, 0.3)).toBe(-1);
    expect(tiltDirection(0.5, 0.5)).toBe(0);
  });
});
