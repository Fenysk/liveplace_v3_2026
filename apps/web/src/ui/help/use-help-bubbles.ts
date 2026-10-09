// Ce que montrent les bulles d'aide (Écart §8.1, JOURNAL 2026-10-08) : quelle bulle, à cet instant, et quand elle se clôt.
// Les stores et la pill Dessin disent ce que l'écran demande (`HelpFacts`) ; l'état pur choisit une seule bulle, la plus
// prioritaire ; la page lui laisse le temps de paraître, et la précédente de s'effacer avant elle.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CanvasStore } from "../../state/canvas-store";
import { createDraftPan } from "../../state/draft-pan";
import type { DraftStore } from "../../state/draft-store";
import type { Refill } from "../../state/gauge";
import {
  bubblesFoundIn,
  HELP_BUBBLES,
  type HelpBubble,
  type HelpFacts,
  isClosedBy,
  isDone,
  isInWindow,
  isWished,
  OBS_CHAIN,
  pickHelpBubble,
} from "../../state/help-bubbles";
import type { NavigationKind } from "../canvas/navigation-watch";
import { motionMs } from "../design/motion";
import { useAfterDelay } from "../design/use-after-delay";
import { TOUCH_SCREEN_QUERY, useMediaQuery } from "../design/use-media-query";
import { seenBubbles, useSeenBubbles } from "../design/use-seen-bubble";
import { useOpenWindowCount } from "../design/window-open";
import type { DraftPillState } from "../draft/draft-pill";
import { HINT_SHOW_DELAY_MS } from "../hint/first-hint-props";
import { toPillFacts } from "./help-facts";

const draftPan = createDraftPan();

// La scène du canvas rapporte un glissement fini : en Dessin, Tracé éteint, il a déplacé la vue au lieu de dessiner.
export const recordDraftPan = (kind: NavigationKind, draft: DraftStore): void => {
  if (kind === "pan") draftPan.record(draft.getView());
};

const getNotPanned = (): boolean => false;

// La bulle voulue attend que celle qui était là ait fini son fondu : jamais deux à l'écran.
const useAfterFade = (wanted: HelpBubble | undefined): HelpBubble | undefined => {
  const [shown, setShown] = useState<HelpBubble>();
  useEffect(() => {
    if (wanted === shown) return;
    if (shown !== undefined) {
      setShown(undefined);
      return;
    }
    const timer = setTimeout(() => setShown(wanted), motionMs(document.documentElement, "--lp-dur-fade"));
    return () => clearTimeout(timer);
  }, [wanted, shown]);
  return shown;
};

// L'action suivante, au doigt, à la souris ou au clavier, clôt certaines bulles et les fait retenir comme vues.
const usePressClosing = (shown: HelpBubble | undefined): void => {
  useEffect(() => {
    if (!shown || !isClosedBy(shown, "press")) return;
    const close = (event: Event) => {
      if (!(event instanceof KeyboardEvent && event.repeat)) seenBubbles.markSeen(shown);
    };
    document.addEventListener("pointerdown", close, { capture: true });
    document.addEventListener("keydown", close, { capture: true });
    return () => {
      document.removeEventListener("pointerdown", close, { capture: true });
      document.removeEventListener("keydown", close, { capture: true });
    };
  }, [shown]);
};

// Une bulle montrée dont la condition ne tient plus, sans que quelque chose d'autre l'ait cachée : elle a servi, elle est vue.
const useDoneClosing = (shown: HelpBubble | undefined, facts: HelpFacts): void => {
  const previous = useRef<HelpBubble | undefined>(undefined);
  useEffect(() => {
    const was = previous.current;
    previous.current = shown;
    if (was && was !== shown && isDone(was, facts)) seenBubbles.markSeen(was);
  }, [shown, facts]);
};

type HelpStores = { canvas: CanvasStore; draft: DraftStore };

export type HelpBubblesView = {
  shown: HelpBubble | undefined;
  isBusy: boolean; // une bulle d'aide est montrée, attend son tour ou s'efface : le conseil de première visite lui cède la place
  isTouchScreen: boolean;
  refill: Refill | undefined; // les chiffres du canvas, pour la bulle de la jauge
  onWindowSection: (sectionId: string) => void; // la fenêtre vient de s'ouvrir sur cette section
  onObsAddressCopied: () => void; // l'adresse OBS vient d'être copiée : la chaîne OBS est finie (Écart §8.1, JOURNAL 2026-10-09)
};

// `windowSection` : la section de la fenêtre du compte ouverte, absente si elle est fermée. Ouverte, elle a ses propres bulles.
export function useHelpBubbles(
  { canvas, draft }: HelpStores,
  pillState: DraftPillState,
  windowSection: string | undefined,
): HelpBubblesView {
  const view = useSyncExternalStore(canvas.subscribe, canvas.getView, canvas.getView);
  const { mode, draft: cells } = useSyncExternalStore(draft.subscribe, draft.getView, draft.getView);
  const hasPannedInDraft = useSyncExternalStore(draftPan.subscribe, draftPan.hasPanned, getNotPanned);
  const isTouchScreen = useMediaQuery(TOUCH_SCREEN_QUERY);
  const isReady = useAfterDelay(view.width > 0, HINT_SHOW_DELAY_MS);
  const openWindows = useOpenWindowCount();
  const isSeen = useSeenBubbles(HELP_BUBBLES);
  // La fenêtre finit de s'ouvrir avant que sa bulle se pose : sa cible bouge tant qu'elle glisse.
  const [windowMotionMs] = useState(() => motionMs(document.documentElement, "--lp-dur"));
  // Seule ouverte : une petite fenêtre par-dessus la couvrirait.
  const isWindowSettled = useAfterDelay(windowSection !== undefined && openWindows === 1, windowMotionMs);

  const facts: HelpFacts = {
    ...toPillFacts(pillState),
    role: view.role,
    isTouchScreen,
    hasPannedInDraft,
    draftSize: cells.size,
    pendingReports: view.reportCount,
    windowSection,
  };
  const pending = pickHelpBubble(facts, isSeen);
  // Ni avant que le canvas se soit montré un moment, ni connexion coupée, ni inspection ou fenêtre ouverte : elle attend.
  // Les bulles de la fenêtre (Écart §8.1, JOURNAL 2026-10-09) font l'inverse : elles n'attendent que la fenêtre.
  const isLive = isReady && view.status === "live";
  const canShow =
    pending !== undefined && isInWindow(pending)
      ? isLive && isWindowSettled
      : isLive && view.inspection === null && openWindows === 0;
  const shown = useAfterFade(canShow ? pending : undefined);
  usePressClosing(shown);
  useDoneClosing(shown, facts);
  // Quitter le Dessin efface le glissement : la prochaine occasion repart de zéro.
  useEffect(() => {
    if (mode !== "draft") draftPan.clear();
  }, [mode]);

  return {
    shown,
    isBusy: pending !== undefined || shown !== undefined,
    isTouchScreen,
    refill: view.params,
    onWindowSection: (sectionId) => {
      for (const bubble of bubblesFoundIn(sectionId))
        if (isWished(bubble, facts)) seenBubbles.markSeen(bubble);
    },
    onObsAddressCopied: () => {
      for (const bubble of OBS_CHAIN) seenBubbles.markSeen(bubble);
    },
  };
}
