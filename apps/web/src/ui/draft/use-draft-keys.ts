// Un seul écouteur du clavier, sur `window`, pour les raccourcis du CDC 2026, inspection comprise.

import { useEffect } from "react";
import type { CanvasStore } from "../../state/canvas-store";
import type { DraftStore } from "../../state/draft-store";
import type { CanvasScene } from "../canvas/canvas-scene";
import { PALETTE_SELECTOR } from "../design/swatch-keys";
import {
  type DraftKeyCommand,
  isTypingElement,
  type KeyAction,
  type KeyMode,
  keyAction,
  toKeyPress,
} from "./draft-keys";
import { submitDraft } from "./use-draft-pill";

type KeyStores = { canvas: CanvasStore; draft: DraftStore };

// L'Espace qui entre en Dessin ne trace qu'après avoir été relâchée : la case sous la souris n'est pas prise.
type SpaceState = { isEntering: boolean };

const isTyping = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && isTypingElement(target);

// Le focus est dans la palette : ses touches sont à elle (draft-keys.ts, `keyAction`).
const isInPalette = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && target.closest(PALETTE_SELECTOR) !== null;

// La fenêtre ouverte garde le clavier pour elle : Espace ou `D` n'agissent pas derrière le voile.
const isWindowOpen = (): boolean => document.querySelector("dialog[open]") !== null;

const keyModeOf = ({ canvas, draft }: KeyStores): KeyMode => {
  const { mode, isPicking } = draft.getView();
  if (mode === "draft") return isPicking ? "picking" : "draft";
  return canvas.getView().inspection ? "inspecting" : "view";
};

// `scene` : la case visée, absente tant que le canvas n'est pas monté.
const runCommand = (command: DraftKeyCommand, { canvas, draft }: KeyStores, scene?: CanvasScene): void => {
  const commands: Record<DraftKeyCommand, () => void> = {
    enterDraftMode: () => draft.enterDraftMode(),
    submit: () => submitDraft(draft),
    exitDraftMode: () => draft.exitDraftMode(),
    toggleEraser: () => draft.toggleEraser(),
    togglePicker: () => draft.togglePicker(),
    startTrace: () => draft.startTrace(),
    pickTarget: () => scene?.pickTarget(),
    discardTarget: () => scene?.discardTarget(),
    undo: () => draft.undo(),
    redo: () => draft.redo(),
    closeInspection: () => canvas.closeInspection(),
  };
  commands[command]();
};

type AimAction = Exclude<KeyAction, { kind: "command" }>;

const runAim = (action: AimAction, event: KeyboardEvent, { draft }: KeyStores, scene?: CanvasScene): void => {
  // Un chiffre tenu ne reprend pas la couleur en boucle : 1 alterne entre deux couleurs, une fois par appui.
  if (action.kind === "pickRecentColor") {
    if (!event.repeat) draft.selectRecentColor(action.slot);
    return;
  }
  // Une flèche tenue répète : la case visée file, comme un curseur de texte (CDC 2026).
  event.preventDefault();
  scene?.moveTarget(action.step.dx, action.step.dy);
};

// Une commande tenue ne se répète pas, sauf Annuler et Rétablir : elles remontent les étapes comme dans un éditeur.
const REPEATING_COMMANDS: readonly DraftKeyCommand[] = ["undo", "redo"];

const pressCommand = (
  command: DraftKeyCommand,
  event: KeyboardEvent,
  stores: KeyStores,
  space: SpaceState,
  scene?: CanvasScene,
): void => {
  // Espace ne fait jamais défiler la page, ni Ctrl+Z annuler dans le navigateur, et rien ne reclique un bouton (CDC 2026).
  event.preventDefault();
  const isRepeated = event.repeat && !REPEATING_COMMANDS.includes(command);
  if (isRepeated || (command === "startTrace" && space.isEntering)) return;
  if (command === "enterDraftMode") space.isEntering = event.code === "Space";
  runCommand(command, stores, scene);
};

const pressKey = (event: KeyboardEvent, stores: KeyStores, space: SpaceState, scene?: CanvasScene): void => {
  if (isTyping(event.target) || isWindowOpen()) return;
  const action = keyAction(toKeyPress(event), keyModeOf(stores), isInPalette(event.target));
  if (action?.kind === "command") pressCommand(action.command, event, stores, space, scene);
  else if (action) runAim(action, event, stores, scene);
  else if (event.code === "Space") event.preventDefault();
};

const releaseSpace = (stores: KeyStores, space: SpaceState): void => {
  space.isEntering = false;
  stores.draft.endTrace();
};

export function useDraftKeys(stores: KeyStores | undefined, scene?: CanvasScene): void {
  useEffect(() => {
    if (!stores) return;
    const space: SpaceState = { isEntering: false };
    const onKeyDown = (event: KeyboardEvent) => pressKey(event, stores, space, scene);
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
  }, [stores, scene]);
}
