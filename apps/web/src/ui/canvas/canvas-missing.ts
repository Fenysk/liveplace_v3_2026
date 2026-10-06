// Le gateway ne connaît pas ce canvas (`canvas_not_found`, §4.2) : la page montre la notice du canvas introuvable.
// Elle reprend d'elle-même quand un `welcome` arrive : le store oublie alors l'erreur.

import { useSyncExternalStore } from "react";
import type { CanvasStore, CanvasView } from "../../state/canvas-store";

export const isCanvasMissing = ({ lastError }: Pick<CanvasView, "lastError">): boolean =>
  lastError === "canvas_not_found";

const noSubscription = () => () => undefined;

// Avant les stores (rendu serveur, puis le temps de les ouvrir), le canvas n'est pas manquant : rien n'a répondu.
export const useIsCanvasMissing = (canvas: CanvasStore | undefined): boolean => {
  const getIsMissing = () => (canvas ? isCanvasMissing(canvas.getView()) : false);
  return useSyncExternalStore(canvas?.subscribe ?? noSubscription, getIsMissing, getIsMissing);
};
