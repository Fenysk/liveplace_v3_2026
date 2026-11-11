// Le bouton du GIF timelapse et sa fenêtre (JOURNAL 2026-11-11) : le web les montre au développeur seul (le serveur le vérifie
// aussi). Ouvrir la fenêtre lance la génération, la fermer ou réessayer l'arrête (la requête est annulée).

import { isDeveloper } from "@liveplace/domain";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { CanvasStore } from "../../state/canvas-store";
import { startTimelapse, TIMELAPSE_START, type TimelapseState } from "./timelapse-run";

// Sans store (la page ouvre sa socket après le rendu serveur), personne n'est connu : pas de bouton.
const ignoreSubscription = (): (() => void) => () => undefined;

export type Timelapse = ReturnType<typeof useTimelapse>;

export function useTimelapse(canvas: CanvasStore | undefined, canvasId: string, login: string) {
  const getUserId = () => canvas?.getView().userId;
  const userId = useSyncExternalStore(canvas?.subscribe ?? ignoreSubscription, getUserId, getUserId);
  const isShown = isDeveloper(userId);
  // `null` : la fenêtre est fermée ; sinon le numéro de la génération, que Réessayer change.
  const [run, setRun] = useState<number | null>(null);
  const [state, setState] = useState<TimelapseState>(TIMELAPSE_START);
  useEffect(() => {
    if (!isShown || run === null) return;
    setState(TIMELAPSE_START);
    return startTimelapse(canvasId, login, setState);
  }, [isShown, run, canvasId, login]);
  return {
    onOpen: isShown ? () => setRun(0) : undefined, // absent : pas de bouton
    window: {
      isOpen: isShown && run !== null,
      state,
      onClose: () => setRun(null),
      onRetry: () => setRun((current) => (current ?? 0) + 1),
    },
  };
}
