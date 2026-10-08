// Le mode Dessin, posé sur <html> (Écart §8.1, JOURNAL 2026-10-08) : sur mobile, le CSS efface les pills Canvas et Compte et
// monte la bande Thème à leur place (pill.css). Un attribut, comme `data-panning` (canvas-scene.ts), plutôt qu'un état
// passé à trois pills qui ne se connaissent pas.

import { useEffect, useSyncExternalStore } from "react";
import type { DraftStore } from "../../state/draft-store";

export const DRAFTING_ATTRIBUTE = "data-drafting";

export function useDraftingAttribute(draft: DraftStore): void {
  const { mode } = useSyncExternalStore(draft.subscribe, draft.getView, draft.getView);
  useEffect(() => {
    const root = document.documentElement;
    root.toggleAttribute(DRAFTING_ATTRIBUTE, mode === "draft");
    return () => root.removeAttribute(DRAFTING_ATTRIBUTE);
  }, [mode]);
}
