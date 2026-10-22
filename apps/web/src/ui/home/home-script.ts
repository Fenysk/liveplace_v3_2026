// La démo qui joue seule (Écart §9.1, JOURNAL 2026-10-22) : un doigt choisit une couleur, touche des cases, puis le bouton, par lots.
// De la logique pure : le doigt n'avance qu'au rythme que la jauge permet, jamais au-delà de ses charges.

import { DEMO_COLOR, GRASS, SUN } from "./home-art";
import {
  type DemoState,
  type LaunchedPixel,
  msUntilCharges,
  pickColor,
  sendDraft,
  touchCell,
} from "./home-demo";

export type DemoStep =
  | { kind: "pick"; colorIndex: number }
  | { kind: "touch"; cell: number }
  | { kind: "send" };

export const START_DELAY_MS = 900; // le visiteur voit d'abord le cœur
export const STEP_GAP_MS = 650; // d'un toucher au suivant
export const TAP_MS = 180; // l'onde du doigt, puis l'effet du toucher
const CHARGE_MARGIN_MS = 150; // l'écart qu'on laisse au navigateur pour rendre la main

const lot = (cells: readonly number[]): DemoStep[] => [
  ...cells.map((cell): DemoStep => ({ kind: "touch", cell })),
  { kind: "send" },
];

// Le soleil en jaune, puis l'herbe en verte : chaque lot finit par le bouton.
export const DEMO_STEPS: readonly DemoStep[] = [
  { kind: "pick", colorIndex: DEMO_COLOR.yellow },
  ...SUN.flatMap(lot),
  { kind: "pick", colorIndex: DEMO_COLOR.green },
  ...GRASS.flatMap(lot),
];

// Le délai avant un pas. Un toucher que la jauge ne paierait pas attend le pixel qui lui manque : aucun lot n'est refusé.
export const stepDelayMs = (step: DemoStep, state: DemoState, nowMs: number): number => {
  if (step.kind !== "touch") return STEP_GAP_MS;
  const wait = msUntilCharges(state.gauge, state.draft.size + 1, nowMs + STEP_GAP_MS + TAP_MS);
  return wait > 0 ? STEP_GAP_MS + wait + CHARGE_MARGIN_MS : STEP_GAP_MS;
};

export const applyStep = (
  state: DemoState,
  step: DemoStep,
  nowMs: number,
): { state: DemoState; launched: readonly LaunchedPixel[] } => {
  if (step.kind === "pick") return { state: pickColor(state, step.colorIndex), launched: [] };
  if (step.kind === "touch") return { state: touchCell(state, step.cell, nowMs), launched: [] };
  return sendDraft(state, nowMs);
};

// Mouvement réduit : la démo ne joue pas seule, et les pixels paraissent sur le stream sans voler.
export const motionPlan = (isMotionReduced: boolean): { autoplays: boolean; flies: boolean } => ({
  autoplays: !isMotionReduced,
  flies: !isMotionReduced,
});
