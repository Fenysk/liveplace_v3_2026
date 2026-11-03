// L'animation d'une vignette : elle tourne à l'écran, et reste sur son image fixe avec `prefers-reduced-motion: reduce`.

import { type RefObject, useContext, useEffect } from "react";
import { useMediaQuery } from "../design/use-media-query";
import { delayedTime, ThumbnailDelayContext } from "./thumbnail-delay";
import { startVisibleLoop } from "./visible-loop";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

// `render` est une fonction du module, pas une fermeture du rendu : l'effet ne repart que si l'élément, le réglage ou le retard change.
// Le retard (thumbnail-delay.ts) ne touche pas l'image fixe : en mouvement réduit, aucune vignette n'est décalée.
export const useVisibleLoop = <Target extends Element>(
  target: RefObject<Target | null>,
  render: (element: Target, timeMs: number) => void,
  restingMs: number,
): void => {
  const isMotionReduced = useMediaQuery(REDUCED_MOTION_QUERY);
  const delayMs = useContext(ThumbnailDelayContext);
  useEffect(() => {
    const element = target.current;
    if (!element) return;
    if (isMotionReduced) {
      render(element, restingMs);
      return;
    }
    return startVisibleLoop(element, (timeMs) => render(element, delayedTime(timeMs, delayMs)));
  }, [target, render, restingMs, isMotionReduced, delayMs]);
};
