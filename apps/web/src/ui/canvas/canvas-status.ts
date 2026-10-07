// Ce que la page lit du statut du canvas ouvert (Écart §15, JOURNAL 2026-10-06) : archivé, redevenu actif,
// supprimé. Chacun ne vaut qu'une fois la connexion établie : avant le `welcome`, le store ne sait encore rien.

import { useSyncExternalStore } from "react";
import type { CanvasStore, CanvasView } from "../../state/canvas-store";

const noSubscription = () => () => undefined;

const useViewFlag = (canvas: CanvasStore | undefined, pick: (view: CanvasView) => boolean): boolean => {
  const getFlag = () => (canvas ? pick(canvas.getView()) : false);
  return useSyncExternalStore(canvas?.subscribe ?? noSubscription, getFlag, getFlag);
};

// La page du jeu, ou la vue OBS : le canvas qu'elles montrent n'est plus l'actif, il faut relire le canvas actif.
export const isCanvasArchived = ({
  status,
  isArchived,
}: Pick<CanvasView, "status" | "isArchived">): boolean => status === "live" && isArchived;

export const useIsCanvasArchived = (canvas: CanvasStore | undefined): boolean =>
  useViewFlag(canvas, isCanvasArchived);

// Une page d'archive : le canvas qu'elle montre est redevenu le canvas actif, la page est `/{login}`.
export const isCanvasReopened = ({
  status,
  isArchived,
  isDiscarded,
}: Pick<CanvasView, "status" | "isArchived" | "isDiscarded">): boolean =>
  status === "live" && !isArchived && !isDiscarded;

export const useIsCanvasReopened = (canvas: CanvasStore | undefined): boolean =>
  useViewFlag(canvas, isCanvasReopened);

export const useIsCanvasDiscarded = (canvas: CanvasStore | undefined): boolean =>
  useViewFlag(canvas, ({ isDiscarded }) => isDiscarded);
