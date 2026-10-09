// Ce que montre le conseil de première visite (Écart §8.1, JOURNAL 2026-10-08) : l'état des gestes, retenu par appareil,
// et ce que la page en cache. Un déplacement ou un zoom arrive de la scène du canvas (`recordFirstHintStep`) ;
// une inspection se lit ici, dans le store du canvas.

import { useEffect, useState, useSyncExternalStore } from "react";
import type { CanvasStore } from "../../state/canvas-store";
import type { DraftStore } from "../../state/draft-store";
import { createFirstHint, type FirstHintView, type HintStep } from "../../state/first-hint";
import { useAfterDelay } from "../design/use-after-delay";
import { TOUCH_SCREEN_QUERY } from "../design/use-media-query";
import { seenBubbles } from "../design/use-seen-bubble";
import type { FirstHintProps } from "./first-hint";
import { HINT_CLOSE_BEAT_MS, HINT_SHOW_DELAY_MS, isHintBeating, toFirstHintProps } from "./first-hint-props";

const firstHint = createFirstHint({
  seen: seenBubbles,
  getStorage: () => window.localStorage,
  isTouchScreen: () => window.matchMedia(TOUCH_SCREEN_QUERY).matches,
});

export const recordFirstHintStep: (step: HintStep) => void = firstHint.record;

const getServerView = (): FirstHintView => ({ status: "off" });

// Vrai une fois le battement écoulé, pour de bon ; coupé avant (Dessin, inspection), il repart de zéro au retour
// (Écart §8.1, JOURNAL 2026-10-09).
const useHintSettled = (isBeating: boolean): boolean => {
  const [isSettled, setIsSettled] = useState(false);
  useEffect(() => {
    if (!isBeating || isSettled) return;
    const timer = setTimeout(() => setIsSettled(true), HINT_CLOSE_BEAT_MS);
    return () => clearTimeout(timer);
  }, [isBeating, isSettled]);
  return isSettled;
};

type FirstHintStores = { canvas: CanvasStore; draft: DraftStore };

export function useFirstHintProps(
  { canvas, draft }: FirstHintStores,
  isYielding: boolean,
): FirstHintProps | undefined {
  const view = useSyncExternalStore(firstHint.subscribe, firstHint.getView, getServerView);
  const { width, inspection } = useSyncExternalStore(canvas.subscribe, canvas.getView, canvas.getView);
  const { mode } = useSyncExternalStore(draft.subscribe, draft.getView, draft.getView);
  const isReady = useAfterDelay(width > 0, HINT_SHOW_DELAY_MS);
  // Une case inspectée, qu'elle ait un auteur ou non : le geste est fait.
  const hasInspected = inspection !== null && inspection.status !== "loading";
  useEffect(() => {
    if (hasInspected) firstHint.record("inspect");
  }, [hasInspected]);
  const aside = { isReady, isDrafting: mode === "draft", isInspecting: inspection !== null, isYielding };
  const isSettled = useHintSettled(isHintBeating(view, aside));
  return toFirstHintProps(view, { ...aside, isSettled });
}
