// Les raccourcis du CDC 2026 : ce que fait une touche, selon le mode. Pur : l'écouteur de `window` ne fait que l'appeler.
// `inspecting` : le mode Vue, pendant qu'une case est inspectée. `picking` : le Dessin, pipette armée.

import type { DraftMode } from "../../state/draft-store";
import { isSwatchKey } from "../design/swatch-keys";

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

// JOURNAL 2026-10-09 : les touches 1 à 5 par `code`, pour que l'AZERTY marche sans Maj. Le pavé numérique doit taper son
// chiffre : verrouillage éteint, 1 est Fin, 3 Page suivante, et ce ne sont pas des couleurs.
const RECENT_SLOT_CODE = /^(Digit|Numpad)([1-5])$/;

// La place de la récente que la touche prend, dans l'ordre où la rangée les montre.
export function recentColorSlot(press: KeyPress): number | null {
  const [, source, digit] = RECENT_SLOT_CODE.exec(press.code) ?? [];
  if (press.hasModifier || !digit || (source === "Numpad" && press.key !== digit)) return null;
  return Number(digit) - 1;
}

export type KeyAction =
  | { kind: "moveTarget"; step: TargetStep }
  | { kind: "pickRecentColor"; slot: number }
  | { kind: "command"; command: DraftKeyCommand };

const isDrawing = (mode: KeyMode): boolean => mode === "draft" || mode === "picking";

// Ce que fait une touche, selon le mode. `isInPalette` : le focus est dans la palette, qui garde alors ses touches
// (flèches, Début, Fin, Entrée, Espace, Échap) ; E, I, Retour arrière et les chiffres continuent.
export function keyAction(press: KeyPress, mode: KeyMode, isInPalette: boolean): KeyAction | null {
  if (isInPalette && isSwatchKey(press)) return null;
  const step = targetStep(press);
  if (step) return { kind: "moveTarget", step };
  const slot = recentColorSlot(press);
  if (slot !== null && isDrawing(mode)) return { kind: "pickRecentColor", slot };
  const command = keyCommand(press, mode);
  return command ? { kind: "command", command } : null;
}

const TYPING_TAGS: readonly string[] = ["INPUT", "TEXTAREA", "SELECT"];

// Les raccourcis se taisent quand un champ de saisie a le focus (CDC 2026).
export const isTypingElement = (element: { tagName: string; isContentEditable: boolean }): boolean =>
  element.isContentEditable || TYPING_TAGS.includes(element.tagName);
