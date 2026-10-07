// Le thème que montre la page du jeu (Écart §8.1, JOURNAL 2026-10-07) : celui que le loader a rendu avec elle, puis celui
// du gateway, qui suit en direct. Sans store (rendu serveur, ou le temps d'ouvrir le WebSocket), il n'y a que le premier.

import { useCallback, useSyncExternalStore } from "react";
import type { CanvasStore } from "../../state/canvas-store";
import { toShownTheme } from "./canvas-theme";

const getServerParams = (): undefined => undefined;

export function useCanvasTheme(
  canvas: CanvasStore | undefined,
  loaded: string | undefined,
): string | undefined {
  const subscribe = useCallback(
    (listener: () => void) => (canvas ? canvas.subscribe(listener) : () => undefined),
    [canvas],
  );
  const getParams = useCallback(() => canvas?.getView().params, [canvas]);
  return toShownTheme(useSyncExternalStore(subscribe, getParams, getServerParams), loaded);
}
