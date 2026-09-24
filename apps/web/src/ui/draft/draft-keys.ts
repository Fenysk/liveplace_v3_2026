// Les raccourcis du CDC 2026 : ce que fait une touche, selon le mode. Pur : l'écouteur de `window` ne fait que l'appeler.

import type { DraftMode } from "../../state/draft-store";

export type KeyPress = { key: string; code: string; hasModifier: boolean };
export type DraftKeyCommand = "enterDraftMode" | "submit" | "exitDraftMode" | "toggleEraser" | "startTrace";

// Les lettres par `key` (elles suivent la disposition, AZERTY compris), Espace par `code`.
const VIEW_KEYS: Record<string, DraftKeyCommand> = { d: "enterDraftMode", enter: "enterDraftMode" };
const DRAFT_KEYS: Record<string, DraftKeyCommand> = {
  enter: "submit",
  escape: "exitDraftMode",
  e: "toggleEraser",
};

// Ctrl, Alt ou Cmd : la touche appartient au navigateur (Ctrl+E, Ctrl+D…).
export function keyCommand(press: KeyPress, mode: DraftMode): DraftKeyCommand | null {
  if (press.hasModifier) return null;
  if (press.code === "Space") return mode === "draft" ? "startTrace" : null;
  return (mode === "draft" ? DRAFT_KEYS : VIEW_KEYS)[press.key.toLowerCase()] ?? null;
}
