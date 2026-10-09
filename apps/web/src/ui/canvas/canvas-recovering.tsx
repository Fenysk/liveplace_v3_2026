// Redis a perdu ce canvas et le remet en place (`canvas_recovering`, Écart §4.2, JOURNAL 2026-10-08) : la page dit son attente à
// la place du canvas, pour tous, et reprend d'elle-même quand un `welcome` arrive : le store oublie alors l'erreur.
// `lp-game` : caché en vue OBS, aucun texte sur le stream.

import { useSyncExternalStore } from "react";
import type { CanvasStore, CanvasView } from "../../state/canvas-store";
import { NoticePill } from "../design/pill";
import { useTexts } from "../locale/use-locale";
import { CANVAS_TEXTS } from "./canvas-texts";

export const isCanvasRecovering = ({ lastError }: Pick<CanvasView, "lastError">): boolean =>
  lastError === "canvas_recovering";

const noSubscription = () => () => undefined;

// Avant les stores (rendu serveur, puis le temps de les ouvrir), le canvas n'est pas en récupération : rien n'a répondu.
export const useIsCanvasRecovering = (canvas: CanvasStore | undefined): boolean => {
  const getIsRecovering = () => (canvas ? isCanvasRecovering(canvas.getView()) : false);
  return useSyncExternalStore(canvas?.subscribe ?? noSubscription, getIsRecovering, getIsRecovering);
};

export const CanvasRecovering = () => (
  <main className="lp-game">
    <NoticePill title={useTexts(CANVAS_TEXTS).recovering} />
  </main>
);
