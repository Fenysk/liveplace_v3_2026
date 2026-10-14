// La synchro Twitch jamais faite (Écart §8.1, JOURNAL 2026-10-12) : le gateway ne la dit qu'avec la liste des modérateurs, que seule
// la section Modération demande. La page la demande une fois à chaque ouverture de la fenêtre, quand `isAsked` (le streamer, la bulle
// pas encore vue) ; sans réponse, ou après un échec, il n'y a rien à dire.

import { useEffect, useState } from "react";
import type { CanvasStore } from "../../state/canvas-store";
import { isTwitchSyncNever } from "../../state/help-bubbles";

export function useTwitchSyncMissing(canvas: CanvasStore, isAsked: boolean): boolean {
  const [isMissing, setIsMissing] = useState(false);
  useEffect(() => {
    if (!isAsked) return;
    let isCurrent = true;
    void canvas.listModerators().then((result) => {
      if (isCurrent) setIsMissing(isTwitchSyncNever(result));
    });
    return () => {
      isCurrent = false;
    };
  }, [canvas, isAsked]);
  return isMissing;
}
