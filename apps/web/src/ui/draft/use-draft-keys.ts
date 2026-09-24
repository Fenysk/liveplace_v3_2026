// Un seul écouteur du clavier, sur `window`, pour les raccourcis du CDC 2026, inspection comprise.

import { useEffect } from "react";
import type { CanvasStore } from "../../state/canvas-store";
import type { DraftStore } from "../../state/draft-store";
import { type DraftKeyCommand, type KeyMode, type KeyPress, keyCommand } from "./draft-keys";
import { submitDraft } from "./use-draft-pill";

type KeyStores = { canvas: CanvasStore; draft: DraftStore };

// L'Espace qui entre en Dessin ne trace qu'après avoir été relâchée : la case sous la souris n'est pas prise.
type SpaceState = { isEntering: boolean };

// Les raccourcis se taisent quand un champ de saisie a le focus (CDC 2026).
const isTyping = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

// La fenêtre ouverte garde le clavier pour elle : Espace ou `D` n'agissent pas derrière le voile.
const isWindowOpen = (): boolean => document.querySelector("dialog[open]") !== null;

const toKeyPress = (event: KeyboardEvent): KeyPress => ({
  key: event.key,
  code: event.code,
  hasModifier: event.ctrlKey || event.metaKey || event.altKey,
});

const keyModeOf = ({ canvas, draft }: KeyStores): KeyMode => {
  const { mode, isSignInPrompted } = draft.getView();
  if (isSignInPrompted) return "signInPrompt";
  return mode === "view" && canvas.getView().inspection ? "inspecting" : mode;
};

const runCommand = (command: DraftKeyCommand, { canvas, draft }: KeyStores): void => {
  const commands: Record<DraftKeyCommand, () => void> = {
    enterDraftMode: () => draft.enterDraftMode(),
    submit: () => submitDraft(draft),
    exitDraftMode: () => draft.exitDraftMode(),
    toggleEraser: () => draft.toggleEraser(),
    startTrace: () => draft.startTrace(),
    closeInspection: () => canvas.closeInspection(),
  };
  commands[command]();
};

const pressKey = (event: KeyboardEvent, stores: KeyStores, space: SpaceState): void => {
  if (isTyping(event.target) || isWindowOpen()) return;
  const command = keyCommand(toKeyPress(event), keyModeOf(stores));
  // Espace ne fait jamais défiler la page, et ne reclique pas un bouton (CDC 2026).
  if (command || event.code === "Space") event.preventDefault();
  if (!command || event.repeat || (command === "startTrace" && space.isEntering)) return;
  if (command === "enterDraftMode") space.isEntering = event.code === "Space";
  runCommand(command, stores);
};

const releaseSpace = (stores: KeyStores, space: SpaceState): void => {
  space.isEntering = false;
  stores.draft.endTrace();
};

export function useDraftKeys(stores: KeyStores | undefined): void {
  useEffect(() => {
    if (!stores) return;
    const space: SpaceState = { isEntering: false };
    const onKeyDown = (event: KeyboardEvent) => pressKey(event, stores, space);
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") releaseSpace(stores, space);
    };
    // L'Espace relâché hors de la fenêtre n'arrive jamais : le tracé s'arrête quand elle perd le focus.
    const onBlur = () => releaseSpace(stores, space);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [stores]);
}
