// Les raccourcis du CDC 2026 : ce que fait une touche, selon le mode. Pur : l'écouteur de `window` ne fait que l'appeler.
// `inspecting` : le mode Vue, pendant qu'une case est inspectée.

import type { DraftMode } from "../../state/draft-store";

export type KeyPress = { key: string; code: string; hasModifier: boolean };
export type KeyMode = DraftMode | "inspecting";
export type DraftKeyCommand =
  | "enterDraftMode"
  | "submit"
  | "exitDraftMode"
  | "toggleEraser"
  | "startTrace"
  | "closeInspection";

// Les lettres par `key` (elles suivent la disposition, AZERTY compris), Espace par `code`.
const VIEW_KEYS: Record<string, DraftKeyCommand> = { d: "enterDraftMode", enter: "enterDraftMode" };
const DRAFT_KEYS: Record<string, DraftKeyCommand> = {
  enter: "submit",
  escape: "exitDraftMode",
  e: "toggleEraser",
};
const INSPECTING_KEYS: Record<string, DraftKeyCommand> = { ...VIEW_KEYS, escape: "closeInspection" };
const KEYS_BY_MODE = { view: VIEW_KEYS, draft: DRAFT_KEYS, inspecting: INSPECTING_KEYS } as const;

// Ctrl, Alt ou Cmd : la touche appartient au navigateur (Ctrl+E, Ctrl+D…).
export function keyCommand(press: KeyPress, mode: KeyMode): DraftKeyCommand | null {
  if (press.hasModifier) return null;
  if (press.code === "Space") return mode === "draft" ? "startTrace" : null;
  return KEYS_BY_MODE[mode][press.key.toLowerCase()] ?? null;
}
