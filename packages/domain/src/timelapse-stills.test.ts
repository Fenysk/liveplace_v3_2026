import { describe, expect, it } from "vitest";
import { planStills, timelapseSeconds } from "./timelapse-stills";

const totalCs = (stills: readonly { delayCs: number }[]): number =>
  stills.reduce((sum, still) => sum + still.delayCs, 0);

describe("the duration of a timelapse", () => {
  // Quand le nombre de changements double au-dessus de 1 000, le système doit ajouter 10 s, entre 10 s et 60 s.
  it.each([
    [1, 10],
    [1000, 10],
    [2000, 20],
    [4000, 30],
    [8000, 40],
    [32000, 60],
    [5_000_000, 60],
  ])("lasts %i changes for %i seconds", (totalChanges, seconds) => {
    expect(timelapseSeconds(totalChanges)).toBeCloseTo(seconds, 9);
  });
});

describe("the plan of stills", () => {
  // Quand C vaut 1 000, le plan doit durer 10 s : 0,5 s d'image de départ, 7 s à 20 images/s, 2,5 s d'image finale.
  it("holds the first still 0.5 s, then 20 stills a second, and the last 2.5 s more", () => {
    const plan = planStills(1000);
    if (!plan.ok) throw new Error(plan.error);
    const stills = plan.value;
    expect(stills).toHaveLength(141);
    expect(stills[0]).toEqual({ changesApplied: 0, delayCs: 50 });
    expect(stills[1]).toEqual({ changesApplied: 7, delayCs: 5 });
    expect(stills.at(-1)).toEqual({ changesApplied: 1000, delayCs: 255 });
    expect(totalCs(stills)).toBe(1000);
  });

  // Quand C vaut 2 000, 4 000 ou 32 000, le plan doit durer 20 s, 30 s ou 60 s.
  it.each([
    [2000, 2000],
    [4000, 3000],
    [32000, 6000],
  ])("lasts %i changes for %i centiseconds", (totalChanges, centiseconds) => {
    const plan = planStills(totalChanges);
    expect(plan.ok && totalCs(plan.value)).toBe(centiseconds);
  });

  // Quand deux images montrent le même nombre de changements, le système doit les fusionner et additionner leurs délais.
  it("merges consecutive stills that show the same number of changes", () => {
    const plan = planStills(3);
    if (!plan.ok) throw new Error(plan.error);
    expect(plan.value.map((still) => still.changesApplied)).toEqual([0, 1, 2, 3]);
    expect(totalCs(plan.value)).toBe(1000);
    expect(plan.value.at(-1)?.delayCs).toBeGreaterThanOrEqual(255);
  });

  // Chaque image montre l'état après round(k·C/N) changements : jamais en arrière, jamais au-delà de C.
  it("shows a growing number of changes that ends on all of them", () => {
    const plan = planStills(12_345);
    if (!plan.ok) throw new Error(plan.error);
    const counts = plan.value.map((still) => still.changesApplied);
    expect(counts).toEqual([...counts].sort((left, right) => left - right));
    expect(counts.at(-1)).toBe(12_345);
  });

  // Si rien ne change, alors le système ne doit pas faire de GIF : une erreur nommée.
  it("refuses a fresque where nothing changes", () => {
    expect(planStills(0)).toEqual({ ok: false, error: "no_changes" });
  });
});
