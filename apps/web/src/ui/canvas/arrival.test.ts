import { describe, expect, it } from "vitest";
import {
  ARRIVAL_SPREAD_MS,
  ARRIVAL_STEP_MS,
  type ArrivalClock,
  arrivalDelay,
  arrivalProgress,
  isArrivalDone,
  MAX_ARRIVALS,
  shownLayers,
} from "./arrival";

describe("arrivalDelay (les cases d'un lot l'une après l'autre)", () => {
  // Les valeurs validées : 80 ms d'écart, 1,2 s pour un lot entier, 200 cases en fondu au plus
  it("keeps the validated values: 80 ms apart, 1.2 s for a whole lot, 200 cells at most", () => {
    expect(ARRIVAL_STEP_MS).toBe(80);
    expect(ARRIVAL_SPREAD_MS).toBe(1200);
    expect(MAX_ARRIVALS).toBe(200);
  });

  // La première case part tout de suite, les suivantes à i × 80 ms : un petit lot de 10 cases met 720 ms
  it("starts the first cell at once and the next ones 80 ms apart in a small lot", () => {
    expect([0, 1, 2, 9].map((index) => arrivalDelay(index, 10))).toEqual([0, 80, 160, 720]);
  });

  // Un lot de 15 cases est le dernier à tenir à 80 ms : 14 × 80 = 1120 ms
  it("still spaces 15 cells 80 ms apart", () => {
    expect(arrivalDelay(14, 15)).toBe(1120);
  });

  // Un gros lot resserre l'écart pour tenir en 1,2 s : sa dernière case part avant la fin des 1,2 s
  it("tightens the gap of a big lot so the whole lot starts within 1.2 s", () => {
    for (const size of [16, 32, 64, 100]) {
      expect(arrivalDelay(size - 1, size)).toBeLessThan(ARRIVAL_SPREAD_MS);
      expect(arrivalDelay(1, size)).toBeCloseTo(ARRIVAL_SPREAD_MS / size);
    }
  });
});

describe("shownLayers (ce que montre une case en fondu)", () => {
  const RED = { colorIndex: 5, alpha: 1 };

  // Vers une couleur, l'ancienne reste dessous et la nouvelle paraît dessus, à l'avancée du fondu
  it("fades the new color in over the old one", () => {
    expect(shownLayers([RED], 28, 0.25)).toEqual([RED, { colorIndex: 28, alpha: 0.25 }]);
  });

  // Vers le transparent, c'est l'ancienne qui s'efface, jusqu'à rien
  it("fades the old color out toward transparent", () => {
    expect(shownLayers([RED], 0, 0.25)).toEqual([{ colorIndex: 5, alpha: 0.75 }]);
    expect(shownLayers([RED], 0, 1)).toEqual([{ colorIndex: 5, alpha: 0 }]);
  });

  // Une case réécrite pendant son fondu repart de ce qu'elle montrait : ses couleurs superposées, sans saut
  it("lets a rewritten cell start again from the layers it was showing", () => {
    const showing = shownLayers([RED], 28, 0.4);

    expect(shownLayers(showing, 36, 0.5)).toEqual([
      RED,
      { colorIndex: 28, alpha: 0.4 },
      { colorIndex: 36, alpha: 0.5 },
    ]);
  });
});

describe("arrivalProgress (l'avancée d'un fondu)", () => {
  const linear = (progress: number) => progress;
  const clock = (overrides: Partial<ArrivalClock> = {}): ArrivalClock => ({
    startedAt: 1000,
    delay: 200,
    duration: 300,
    ease: linear,
    ...overrides,
  });

  // Tant que le tour n'est pas venu, la case montre encore son ancienne couleur : l'avancée est 0, et le fondu n'est pas fini
  it("holds at 0 until the cell's turn, and is not done", () => {
    expect(arrivalProgress(clock(), 1100)).toBe(0);
    expect(isArrivalDone(clock(), 1100)).toBe(false);
  });

  // Puis elle va de 0 à 1 sur la durée, par la courbe
  it("goes from 0 to 1 over the duration, through the curve", () => {
    expect(arrivalProgress(clock(), 1350)).toBeCloseTo(0.5);
    expect(arrivalProgress(clock({ ease: (p) => p * p }), 1350)).toBeCloseTo(0.25);
  });

  // Au bout de son délai et de sa durée, il est fini
  it("is done once its delay and its duration have passed", () => {
    expect(isArrivalDone(clock(), 1499)).toBe(false);
    expect(isArrivalDone(clock(), 1500)).toBe(true);
    expect(arrivalProgress(clock(), 2000)).toBe(1);
  });

  // Sans première image (`startedAt` nul), rien n'a commencé
  it("has not started before its first frame", () => {
    expect(arrivalProgress(clock({ startedAt: null }), 5000)).toBe(0);
    expect(isArrivalDone(clock({ startedAt: null }), 5000)).toBe(false);
  });
});
