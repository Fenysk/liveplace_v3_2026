// La démo de l'accueil (Écart §9.1, JOURNAL 2026-10-22) : un brouillon, une jauge de 10 pixels qui se recharge, deux fresques.
// De la logique pure : ni React ni horloge, l'instant arrive en paramètre.

import { PALETTE, TRANSPARENT_COLOR_INDEX } from "@liveplace/domain";
import { DEMO_COLOR, HEART } from "./home-art";

export const GAUGE_MAX = 10;
export const REFILL_MS = 2000;

export const DEMO_PALETTE: readonly string[] = [
  PALETTE[TRANSPARENT_COLOR_INDEX],
  PALETTE[1],
  PALETTE[5],
  PALETTE[9],
  PALETTE[20],
  PALETTE[28],
  PALETTE[42],
];

// La case (y × GRID_SIDE + x) et son index de couleur dans `DEMO_PALETTE`.
export type CellSwatches = ReadonlyMap<number, number>;

// `refillEndsAt` : l'instant du prochain pixel, `null` quand la jauge est pleine.
export type DemoGauge = { charges: number; refillEndsAt: number | null };

export type DemoState = {
  placed: CellSwatches; // la fresque du téléphone
  streamed: CellSwatches; // celle du stream : un pixel n'y paraît qu'à l'arrivée de son vol
  draft: CellSwatches;
  gauge: DemoGauge;
  colorIndex: number;
  shakeCount: number; // +1 à chaque case refusée : la jauge vibre
  hasVisitorActed: boolean; // le premier geste du visiteur arrête la démo seule
};

export type LaunchedPixel = { cell: number; colorIndex: number };

// La jauge à l'instant `nowMs` : un pixel de plus toutes les 2 s, jusqu'à la capacité.
export const advanceGauge = (gauge: DemoGauge, nowMs: number): DemoGauge => {
  if (gauge.refillEndsAt === null || nowMs < gauge.refillEndsAt) return gauge;
  const gained = 1 + Math.floor((nowMs - gauge.refillEndsAt) / REFILL_MS);
  const charges = Math.min(GAUGE_MAX, gauge.charges + gained);
  return { charges, refillEndsAt: charges === GAUGE_MAX ? null : gauge.refillEndsAt + gained * REFILL_MS };
};

// Dépenser compte d'abord ce qui a été regagné ; le prochain pixel garde son échéance, sauf jauge pleine : elle part de là.
export const spendCharges = (gauge: DemoGauge, count: number, nowMs: number): DemoGauge => {
  const current = advanceGauge(gauge, nowMs);
  return {
    charges: Math.max(0, current.charges - count),
    refillEndsAt: current.refillEndsAt ?? nowMs + REFILL_MS,
  };
};

// Les ms avant que la jauge compte `wanted` pixels : 0 si elle les a déjà.
export const msUntilCharges = (gauge: DemoGauge, wanted: number, nowMs: number): number => {
  const current = advanceGauge(gauge, nowMs);
  if (current.charges >= wanted || current.refillEndsAt === null) return 0;
  return current.refillEndsAt + (wanted - current.charges - 1) * REFILL_MS - nowMs;
};

const HEART_SWATCHES: CellSwatches = new Map(HEART.map((cell) => [cell, DEMO_COLOR.red]));

export const initialDemo = (): DemoState => ({
  placed: HEART_SWATCHES,
  streamed: HEART_SWATCHES,
  draft: new Map(),
  gauge: { charges: GAUGE_MAX, refillEndsAt: null },
  colorIndex: DEMO_COLOR.red,
  shakeCount: 0,
  hasVisitorActed: false,
});

// Toucher une case du brouillon la retire ; sinon elle y entre avec la couleur active, tant que la jauge a de quoi la payer.
export const touchCell = (state: DemoState, cell: number, nowMs: number): DemoState => {
  if (state.draft.has(cell)) {
    const draft = new Map(state.draft);
    draft.delete(cell);
    return { ...state, draft };
  }
  if (state.draft.size >= advanceGauge(state.gauge, nowMs).charges)
    return { ...state, shakeCount: state.shakeCount + 1 };
  return { ...state, draft: new Map(state.draft).set(cell, state.colorIndex) };
};

export const pickColor = (state: DemoState, colorIndex: number): DemoState => ({ ...state, colorIndex });

// Le brouillon se pose sur la fresque du téléphone et part, dans l'ordre où ses cases ont été touchées.
export const sendDraft = (
  state: DemoState,
  nowMs: number,
): { state: DemoState; launched: readonly LaunchedPixel[] } => {
  if (state.draft.size === 0) return { state, launched: [] };
  return {
    state: {
      ...state,
      placed: new Map([...state.placed, ...state.draft]),
      draft: new Map(),
      gauge: spendCharges(state.gauge, state.draft.size, nowMs),
    },
    launched: [...state.draft].map(([cell, colorIndex]) => ({ cell, colorIndex })),
  };
};

// Des pixels arrivés sur la fresque du stream.
export const landPixels = (state: DemoState, pixels: readonly LaunchedPixel[]): DemoState => ({
  ...state,
  streamed: new Map([
    ...state.streamed,
    ...pixels.map(({ cell, colorIndex }) => [cell, colorIndex] as const),
  ]),
});

// Le premier geste du visiteur : la démo s'arrête pour de bon, l'écran reste tel quel.
export const takeOver = (state: DemoState): DemoState =>
  state.hasVisitorActed ? state : { ...state, hasVisitorActed: true };
