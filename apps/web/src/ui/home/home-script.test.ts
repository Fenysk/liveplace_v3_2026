import { describe, expect, it } from "vitest";
import { DEMO_COLOR, GRASS, HEART, SUN } from "./home-art";
import { initialDemo, landPixels, REFILL_MS, spendCharges } from "./home-demo";
import {
  applyStep,
  DEMO_STEPS,
  type DemoStep,
  motionPlan,
  START_DELAY_MS,
  STEP_GAP_MS,
  stepDelayMs,
  TAP_MS,
} from "./home-script";

// Ce que fait le doigt, pas à pas, sur une horloge qu'on avance : chaque pas a son délai, puis son toucher.
// `lateMs` : le navigateur rend la main un peu après l'heure dite, jamais avant.
const playAlone = (lateMs: number) => {
  let state = initialDemo();
  let nowMs = START_DELAY_MS;
  const sentAt: number[] = [];
  for (const step of DEMO_STEPS) {
    nowMs += stepDelayMs(step, state, nowMs) + lateMs + TAP_MS;
    const played = applyStep(state, step, nowMs);
    state = landPixels(played.state, played.launched);
    if (step.kind === "send") sentAt.push(nowMs);
  }
  return { state, endMs: nowMs, sentAt };
};

const kinds = (steps: readonly DemoStep[]): string => steps.map(({ kind }) => kind[0]).join("");

describe("the demo that plays alone", () => {
  // Tant qu'aucun geste du visiteur n'a eu lieu, un doigt touche des cases puis le bouton, par lots : soleil en 2 lots, herbe en 2 lots
  it("takes a color, touches the cells of a lot, then the button: the sun in two lots, the grass in two lots", () => {
    expect(kinds(DEMO_STEPS)).toBe("ptttts" + "tttts" + "ptttts" + "tttts");
    expect(DEMO_STEPS.filter(({ kind }) => kind === "send")).toHaveLength(4);
    expect(SUN).toHaveLength(2);
    expect(GRASS).toHaveLength(2);
    expect(DEMO_STEPS[0]).toEqual({ kind: "pick", colorIndex: DEMO_COLOR.yellow });
    expect(DEMO_STEPS.filter(({ kind }) => kind === "pick")).toEqual([
      { kind: "pick", colorIndex: DEMO_COLOR.yellow },
      { kind: "pick", colorIndex: DEMO_COLOR.green },
    ]);
  });

  // Chaque lot touche exactement les cases du dessin, dans l'ordre, avant son envoi
  it("touches every cell of the sun and of the grass, lot after lot", () => {
    const touched = DEMO_STEPS.flatMap((step) => (step.kind === "touch" ? [step.cell] : []));

    expect(touched).toEqual([...SUN.flat(), ...GRASS.flat()]);
  });

  // Aucun lot n'est refusé faute de charges : le doigt attend la recharge quand il le faut
  it("never has a cell refused: the finger waits for the gauge to refill", () => {
    const { state } = playAlone(0);

    expect(state.shakeCount).toBe(0);
    expect(state.draft.size).toBe(0);
    expect(state.placed.size).toBe(HEART.length + SUN.flat().length + GRASS.flat().length);
  });

  // Même quand le navigateur est en retard sur ses minuteries
  it("never has a cell refused when the browser is late on its timers", () => {
    expect(playAlone(90).state.shakeCount).toBe(0);
  });

  // À la fin, le stream montre le cœur, le soleil jaune et l'herbe verte
  it("ends with the heart, the sun and the grass on the stream canvas", () => {
    const { streamed } = playAlone(0).state;

    for (const cell of HEART) expect(streamed.get(cell)).toBe(DEMO_COLOR.red);
    for (const cell of SUN.flat()) expect(streamed.get(cell)).toBe(DEMO_COLOR.yellow);
    for (const cell of GRASS.flat()) expect(streamed.get(cell)).toBe(DEMO_COLOR.green);
  });

  // Elle ne dure pas plus d'une demi-minute, et chaque envoi tombe après la recharge dont son lot avait besoin
  it("lasts less than half a minute, and waits for the refill between lots", () => {
    const { endMs, sentAt } = playAlone(0);

    expect(endMs).toBeLessThan(30_000);
    expect(sentAt).toHaveLength(4);
    expect(sentAt.every((at, index) => index === 0 || at - (sentAt[index - 1] ?? 0) >= STEP_GAP_MS)).toBe(
      true,
    );
  });

  // Une case qui manquerait de charge repousse son toucher au prochain pixel ; une case payée suit la cadence
  it("waits for the next pixel only when the gauge cannot pay the cell", () => {
    const touch: DemoStep = { kind: "touch", cell: 5 };
    const dry = { ...initialDemo(), gauge: spendCharges(initialDemo().gauge, 10, 0) };

    expect(stepDelayMs(touch, initialDemo(), 0)).toBe(STEP_GAP_MS);
    expect(stepDelayMs(touch, dry, 0)).toBeGreaterThanOrEqual(REFILL_MS - TAP_MS);
    expect(stepDelayMs({ kind: "send" }, dry, 0)).toBe(STEP_GAP_MS);
  });
});

describe("the reduced motion", () => {
  // Si prefers-reduced-motion: reduce, la démo ne joue pas seule, et les pixels apparaissent sur la fresque du stream sans vol
  it("neither plays alone nor flies when motion is reduced", () => {
    expect(motionPlan(true)).toEqual({ autoplays: false, flies: false });
    expect(motionPlan(false)).toEqual({ autoplays: true, flies: true });
  });
});
