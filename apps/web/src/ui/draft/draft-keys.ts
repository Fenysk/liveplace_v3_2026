// Les raccourcis du CDC 2026 : ce que fait une touche, selon le mode. Pur : l'écouteur de `window` ne fait que l'appeler.
// `inspecting` : le mode Vue, pendant qu'une case est inspectée. `picking` : le Dessin, pipette armée.

import type { DraftMode } from "../../state/draft-store";

export type KeyPress = { key: string; code: string; hasModifier: boolean; isShifted: boolean };
export type KeyMode = DraftMode | "inspecting" | "picking";
export type DraftKeyCommand =
  | "enterDraftMode"
  | "submit"
  | "exitDraftMode"
  | "toggleEraser"
  | "togglePicker"
  | "startTrace"
  | "pickTarget"
  | "discardTarget"
  | "closeInspection";
// Le pas de la case visée au clavier, en cases.
export type TargetStep = { dx: number; dy: number };

// Les lettres par `key` (elles suivent la disposition, AZERTY compris), Espace par `code`.
const VIEW_KEYS: Record<string, DraftKeyCommand> = { d: "enterDraftMode", enter: "enterDraftMode" };
const DRAFT_KEYS: Record<string, DraftKeyCommand> = {
  enter: "submit",
  escape: "exitDraftMode",
  e: "toggleEraser",
  i: "togglePicker",
  backspace: "discardTarget",
  delete: "discardTarget",
};
const INSPECTING_KEYS: Record<string, DraftKeyCommand> = { ...VIEW_KEYS, escape: "closeInspection" };
const KEYS_BY_MODE = {
  view: VIEW_KEYS,
  draft: DRAFT_KEYS,
  picking: DRAFT_KEYS,
  inspecting: INSPECTING_KEYS,
} as const;
// Espace entre en Dessin comme Entrée, puis trace, ou prend la couleur de la case visée : elle ne valide jamais.
const SPACE_COMMANDS: Record<KeyMode, DraftKeyCommand | null> = {
  view: "enterDraftMode",
  inspecting: "enterDraftMode",
  draft: "startTrace",
  picking: "pickTarget",
};
// Les flèches, par `key` : la même sur toutes les dispositions. `Maj` va dix fois plus loin.
const ARROWS: Record<string, TargetStep> = {
  arrowup: { dx: 0, dy: -1 },
  arrowdown: { dx: 0, dy: 1 },
  arrowleft: { dx: -1, dy: 0 },
  arrowright: { dx: 1, dy: 0 },
};
const LONG_STEP = 10;

// Ctrl, Alt ou Cmd : la touche appartient au navigateur (Ctrl+E, Ctrl+D…).
export function keyCommand(press: KeyPress, mode: KeyMode): DraftKeyCommand | null {
  if (press.hasModifier) return null;
  if (press.code === "Space") return SPACE_COMMANDS[mode];
  return KEYS_BY_MODE[mode][press.key.toLowerCase()] ?? null;
}

// CDC 2026, la case visée au clavier : dans tous les modes, et la flèche tenue répète.
export function targetStep(press: KeyPress): TargetStep | null {
  const arrow = ARROWS[press.key.toLowerCase()];
  if (press.hasModifier || !arrow) return null;
  const length = press.isShifted ? LONG_STEP : 1;
  return { dx: arrow.dx * length, dy: arrow.dy * length };
}
