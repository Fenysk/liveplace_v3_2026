import { PALETTE } from "@liveplace/domain";
import { describe, expect, it } from "vitest";
import { DEMO_COLOR, HEART } from "./home-art";
import {
  advanceGauge,
  DEMO_PALETTE,
  type DemoState,
  GAUGE_MAX,
  initialDemo,
  landPixels,
  msUntilCharges,
  pickColor,
  REFILL_MS,
  sendDraft,
  spendCharges,
  takeOver,
  touchCell,
} from "./home-demo";

const NOW = 1_000_000;

// Une démo où `count` cases sont au brouillon, de la couleur active
const withDraft = (count: number): DemoState =>
  Array.from({ length: count }).reduce<DemoState>(
    (state, _, cell) => touchCell(state, cell, NOW),
    initialDemo(),
  );

describe("the demo palette", () => {
  // Les couleurs viennent de la palette de `domain` : le transparent en 0, puis les six de la rangée du téléphone
  it("takes its six colors from the domain palette, the transparent first", () => {
    expect(DEMO_PALETTE).toHaveLength(7);
    expect(DEMO_PALETTE[0]).toBe(PALETTE[0]);
    expect(DEMO_PALETTE.slice(1).every((color) => PALETTE.some((own) => own === color))).toBe(true);
    expect(new Set(DEMO_PALETTE).size).toBe(DEMO_PALETTE.length);
  });
});

describe("the first image of the demo", () => {
  // Au chargement, un cœur rouge est déjà dessiné, sur la fresque du téléphone et sur celle du stream
  it("draws a red heart on the phone canvas and on the stream canvas", () => {
    const { placed, streamed, draft } = initialDemo();

    expect(HEART.length).toBeGreaterThan(0);
    for (const canvas of [placed, streamed])
      expect([...canvas.keys()].sort((a, b) => a - b)).toEqual([...HEART].sort((a, b) => a - b));
    expect([...placed.values()].every((colorIndex) => colorIndex === DEMO_COLOR.red)).toBe(true);
    expect([...streamed.values()].every((colorIndex) => colorIndex === DEMO_COLOR.red)).toBe(true);
    expect(draft.size).toBe(0);
  });

  // La jauge de la démo est pleine : 10 pixels, rien à attendre
  it("starts with a full gauge of ten pixels", () => {
    expect(initialDemo().gauge).toEqual({ charges: GAUGE_MAX, refillEndsAt: null });
    expect(GAUGE_MAX).toBe(10);
  });
});

describe("touching a cell", () => {
  // Quand le visiteur touche une case, le système doit l'ajouter au brouillon avec la couleur active
  it("adds the cell to the draft with the active color", () => {
    const red = touchCell(initialDemo(), 40, NOW);
    const blue = touchCell(pickColor(red, DEMO_COLOR.blue), 41, NOW);

    expect(red.draft.get(40)).toBe(DEMO_COLOR.red);
    expect(blue.draft.get(41)).toBe(DEMO_COLOR.blue);
    expect(blue.draft.get(40)).toBe(DEMO_COLOR.red);
  });

  // Quand il retouche une case du brouillon, le système doit l'en retirer, quelle que soit la couleur active
  it("takes a touched cell out of the draft when it is touched again", () => {
    const added = touchCell(initialDemo(), 40, NOW);
    const other = pickColor(added, DEMO_COLOR.green);
    const removed = touchCell(other, 40, NOW);

    expect(removed.draft.has(40)).toBe(false);
    expect(removed.draft.size).toBe(0);
    expect(removed.shakeCount).toBe(0);
  });

  // Une case posée peut être redessinée : le brouillon la prend, la fresque garde l'ancienne couleur jusqu'à l'envoi
  it("lets a cell already placed enter the draft without touching the canvas", () => {
    const heartCell = HEART[0] ?? -1;
    const state = touchCell(pickColor(initialDemo(), DEMO_COLOR.blue), heartCell, NOW);

    expect(state.draft.get(heartCell)).toBe(DEMO_COLOR.blue);
    expect(state.placed.get(heartCell)).toBe(DEMO_COLOR.red);
  });

  // Si le brouillon atteint les charges disponibles, alors une case de plus est refusée et la jauge vibre
  it("refuses one cell more than the gauge holds, and makes the gauge shake", () => {
    const full = withDraft(GAUGE_MAX);
    const refused = touchCell(full, 99, NOW);

    expect(full.draft.size).toBe(GAUGE_MAX);
    expect(full.shakeCount).toBe(0);
    expect(refused.draft.size).toBe(GAUGE_MAX);
    expect(refused.draft.has(99)).toBe(false);
    expect(refused.shakeCount).toBe(1);
    expect(touchCell(refused, 98, NOW).shakeCount).toBe(2);
  });

  // Le retrait reste permis brouillon plein : il libère une charge
  it("still lets a full draft lose a cell", () => {
    const full = withDraft(GAUGE_MAX);

    expect(touchCell(full, 0, NOW).draft.size).toBe(GAUGE_MAX - 1);
    expect(touchCell(touchCell(full, 0, NOW), 99, NOW).draft.has(99)).toBe(true);
  });
});

describe("the gauge", () => {
  const spent = spendCharges({ charges: GAUGE_MAX, refillEndsAt: null }, 4, NOW);

  // Tant que la jauge n'est pas pleine, elle regagne 1 charge toutes les 2 s
  it("gains one charge every 2 seconds while it is not full", () => {
    expect(REFILL_MS).toBe(2000);
    expect(spent).toEqual({ charges: 6, refillEndsAt: NOW + REFILL_MS });
    expect(advanceGauge(spent, NOW + REFILL_MS - 1).charges).toBe(6);
    expect(advanceGauge(spent, NOW + REFILL_MS).charges).toBe(7);
    expect(advanceGauge(spent, NOW + 3 * REFILL_MS + 10).charges).toBe(9);
  });

  // Jusqu'à 10, sa capacité : ensuite rien ne court plus
  it("stops at ten, and then has nothing left to wait for", () => {
    expect(advanceGauge(spent, NOW + 4 * REFILL_MS)).toEqual({ charges: GAUGE_MAX, refillEndsAt: null });
    expect(advanceGauge(spent, NOW + 100 * REFILL_MS)).toEqual({ charges: GAUGE_MAX, refillEndsAt: null });
  });

  // Dépenser garde le prochain pixel là où il était : la recharge ne repart pas à zéro
  it("keeps the next pixel on its own clock when more is spent", () => {
    const again = spendCharges(spent, 2, NOW + 1500);

    expect(again).toEqual({ charges: 4, refillEndsAt: NOW + REFILL_MS });
  });

  // Une dépense compte d'abord ce que la jauge a regagné entre-temps
  it("counts what was regained before it spends", () => {
    const later = spendCharges(spent, 1, NOW + REFILL_MS);

    expect(later.charges).toBe(6);
  });

  // La durée à attendre pour avoir assez de charges : 0 quand elles y sont déjà
  it("tells how long to wait until the gauge holds enough", () => {
    expect(msUntilCharges(spent, 6, NOW)).toBe(0);
    expect(msUntilCharges(spent, 7, NOW)).toBe(REFILL_MS);
    expect(msUntilCharges(spent, 9, NOW + 500)).toBe(3 * REFILL_MS - 500);
    expect(msUntilCharges(spent, 7, NOW + REFILL_MS)).toBe(0);
  });
});

describe("sending the draft", () => {
  // Quand le visiteur touche « Dessiner · n », chaque case du brouillon part, dans l'ordre où elle a été touchée
  it("launches every cell of the draft in the order they were touched, with its color", () => {
    const first = touchCell(initialDemo(), 40, NOW);
    const second = touchCell(pickColor(first, DEMO_COLOR.yellow), 5, NOW);
    const { launched } = sendDraft(second, NOW);

    expect(launched).toEqual([
      { cell: 40, colorIndex: DEMO_COLOR.red },
      { cell: 5, colorIndex: DEMO_COLOR.yellow },
    ]);
  });

  // Les charges baissent de n, et le brouillon se vide
  it("spends n charges and empties the draft", () => {
    const { state } = sendDraft(withDraft(3), NOW);

    expect(state.draft.size).toBe(0);
    expect(state.gauge).toEqual({ charges: GAUGE_MAX - 3, refillEndsAt: NOW + REFILL_MS });
  });

  // La fresque du téléphone prend les cases tout de suite ; celle du stream, seulement à l'arrivée de chaque vol
  it("paints the phone canvas at once and the stream canvas only when each pixel lands", () => {
    const sent = sendDraft(withDraft(2), NOW);

    expect(sent.state.placed.get(0)).toBe(DEMO_COLOR.red);
    expect(sent.state.placed.get(1)).toBe(DEMO_COLOR.red);
    expect(sent.state.streamed.has(0)).toBe(false);

    const landed = landPixels(sent.state, sent.launched.slice(0, 1));

    expect(landed.streamed.get(0)).toBe(DEMO_COLOR.red);
    expect(landed.streamed.has(1)).toBe(false);
    expect(landPixels(landed, sent.launched).streamed.get(1)).toBe(DEMO_COLOR.red);
  });

  // Sans brouillon, rien ne part et rien ne se dépense
  it("sends nothing without a draft", () => {
    const { state, launched } = sendDraft(initialDemo(), NOW);

    expect(launched).toEqual([]);
    expect(state.gauge).toEqual({ charges: GAUGE_MAX, refillEndsAt: null });
  });
});

describe("the first gesture of the visitor", () => {
  // Au premier geste du visiteur, la démo s'arrête pour de bon et le brouillon qu'elle laissait part ; le reste de l'écran reste : fresques, couleur, jauge
  it("stops the demo for good, drops the draft it left and leaves everything else on screen", () => {
    const building = pickColor(withDraft(3), DEMO_COLOR.green);
    const taken = takeOver(building);

    expect(building.hasVisitorActed).toBe(false);
    expect(taken.hasVisitorActed).toBe(true);
    expect(taken.draft.size).toBe(0);
    expect({ ...taken, hasVisitorActed: false, draft: building.draft }).toEqual(building);
  });

  // « Dessiner · n » ne compte que les cases du visiteur : sa première case fait 1, quel que soit le brouillon de la démo
  it("counts only the cells the visitor touched, whatever the demo had drafted", () => {
    const touched = touchCell(takeOver(withDraft(4)), 40, NOW);

    expect([...touched.draft.keys()]).toEqual([40]);
  });

  // Les gestes suivants n'y changent rien : la démo ne repart pas, et le brouillon du visiteur reste
  it("never starts the demo again, nor drops what the visitor drafted", () => {
    const taken = takeOver(initialDemo());
    const drafting = touchCell(taken, 7, NOW);

    expect(takeOver(drafting).hasVisitorActed).toBe(true);
    expect(takeOver(drafting)).toBe(drafting);
    expect(takeOver(taken)).toBe(taken);
  });
});
