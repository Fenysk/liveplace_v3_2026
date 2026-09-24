// Un seul écouteur du clavier, sur `window`, pour les raccourcis du CDC 2026.

import { useEffect } from "react";
import type { DraftStore } from "../../state/draft-store";
import { type DraftKeyCommand, type KeyPress, keyCommand } from "./draft-keys";
import { submitDraft } from "./draft-pill";

// Les raccourcis se taisent quand un champ de saisie a le focus (CDC 2026).
const isTyping = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

const toKeyPress = (event: KeyboardEvent): KeyPress => ({
  key: event.key,
  code: event.code,
  hasModifier: event.ctrlKey || event.metaKey || event.altKey,
});

export function useDraftKeys(draftStore: DraftStore | undefined): void {
  useEffect(() => {
    if (!draftStore) return;
    const commands: Record<DraftKeyCommand, () => void> = {
      enterDraftMode: () => draftStore.enterDraftMode(),
      submit: () => submitDraft(draftStore),
      exitDraftMode: () => draftStore.exitDraftMode(),
      toggleEraser: () => draftStore.toggleEraser(),
      startTrace: () => draftStore.startTrace(),
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      // Espace ne fait jamais défiler la page, et ne reclique pas un bouton (CDC 2026).
      if (event.code === "Space") event.preventDefault();
      const command = keyCommand(toKeyPress(event), draftStore.getView().mode);
      if (!command) return;
      event.preventDefault();
      if (!event.repeat) commands[command]();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") draftStore.endTrace();
    };
    // L'Espace relâché hors de la fenêtre n'arrive jamais : le tracé s'arrête quand elle perd le focus.
    const onBlur = () => draftStore.endTrace();

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [draftStore]);
}
