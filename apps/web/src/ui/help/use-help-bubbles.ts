// Ce que montrent les bulles d'aide (Écart §8.1, JOURNAL 2026-10-08) : quelle bulle, à cet instant, et quand elle se clôt.
// Les stores et la pill Dessin disent ce que l'écran demande (`HelpFacts`) ; l'état pur choisit une seule bulle, la plus
// prioritaire ; `state/shown-bubble.ts` lui laisse le temps de paraître, et la précédente de s'effacer avant elle.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CanvasStore, CanvasView } from "../../state/canvas-store";
import { createDraftPan } from "../../state/draft-pan";
import type { DraftMode, DraftStore } from "../../state/draft-store";
import type { Refill } from "../../state/gauge";
import {
  bubblesEndedByCopy,
  bubblesFoundIn,
  HELP_BUBBLES,
  type HelpBubble,
  type HelpFacts,
  isClosedBy,
  isDone,
  isLingering,
  isWished,
  pickHelpBubble,
  surfaceOf,
  surfaceShown,
} from "../../state/help-bubbles";
import { createShownBubble, type ShownBubbleClock } from "../../state/shown-bubble";
import type { NavigationKind } from "../canvas/navigation-watch";
import { motionMs } from "../design/motion";
import { useAfterDelay } from "../design/use-after-delay";
import {
  COMPACT_SCREEN_QUERY,
  SIDE_COLUMN_QUERY,
  TOUCH_SCREEN_QUERY,
  useMediaQuery,
} from "../design/use-media-query";
import { seenBubbles, useSeenBubbles } from "../design/use-seen-bubble";
import { useOpenWindowCount } from "../design/window-open";
import type { DraftPillState } from "../draft/draft-pill";
import { HINT_SHOW_DELAY_MS } from "../hint/first-hint-props";
import { moderableUserId } from "../moderation/moderable-user";
import type { ModerationControls } from "../moderation/use-moderation";
import { toPillFacts } from "./help-facts";
import { placementCount } from "./tutorial";
import { useTwitchSyncMissing } from "./use-twitch-sync-missing";

const draftPan = createDraftPan();

// La scène du canvas rapporte un glissement fini : en Dessin, Tracé éteint, il a déplacé la vue au lieu de dessiner.
export const recordDraftPan = (kind: NavigationKind, draft: DraftStore): void => {
  if (kind === "pan") draftPan.record(draft.getView());
};

const getNotPanned = (): boolean => false;
const getNoPlacement = (): number => 0;

const bubbleClock: ShownBubbleClock = {
  wait: (ms, run) => {
    const timer = setTimeout(run, ms);
    return () => clearTimeout(timer);
  },
};

const getNoBubble = (): HelpBubble | undefined => undefined;

// La bulle voulue attend que celle qui était là ait fini son fondu : jamais deux à l'écran. Une bulle close qui reste (Écart §8.1,
// JOURNAL 2026-10-12) garde sa place le temps d'être lue ; `canLinger` le dit pour la bulle montrée.
const useShownBubble = (
  wanted: HelpBubble | undefined,
  canLinger: (shown: HelpBubble) => boolean,
): HelpBubble | undefined => {
  const [store] = useState(() =>
    createShownBubble({
      clock: bubbleClock,
      fadeMs: () => motionMs(document.documentElement, "--lp-dur-fade"),
    }),
  );
  const shown = useSyncExternalStore(store.subscribe, store.getShown, getNoBubble);
  const isHolding = shown !== undefined && canLinger(shown);
  useEffect(() => store.follow(wanted, isHolding), [store, wanted, isHolding]);
  useEffect(() => store.dispose, [store]);
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

// La pill Inspection montre les actions de modération d'une pose : en Vue, une case posée par un autre compte, à qui on peut les offrir.
const canModerateInspection = (
  inspection: CanvasView["inspection"],
  mode: DraftMode,
  moderation: ModerationControls | undefined,
): boolean =>
  mode === "view" &&
  moderation !== undefined &&
  inspection?.status === "found" &&
  moderableUserId(moderation, inspection.entry) !== undefined;

export type HelpBubblesView = {
  shown: HelpBubble | undefined;
  isBusy: boolean; // une bulle d'aide est montrée, attend son tour ou s'efface : le conseil de première visite lui cède la place
  isTouchScreen: boolean;
  refill: Refill | undefined; // les chiffres du canvas, pour la bulle de la jauge
  onWindowSection: (sectionId: string) => void; // la fenêtre vient de s'ouvrir sur cette section
  onObsLinkCopied: () => void; // le lien de Vue OBS vient d'être copié : la chaîne OBS est finie, puis le partage (JOURNAL 2026-10-09 et 2026-10-12)
  onPaletteOpened: () => void; // la feuille Dessin vient de déplier la palette complète (JOURNAL 2026-10-12)
};

// `windowSection` : la section de la fenêtre du compte ouverte, absente si elle est fermée. Ouverte, elle a ses propres bulles.
// `moderation` : absent, pas le droit de modérer ; l'inspection d'une pose a alors la sienne (Écart §8.1, JOURNAL 2026-10-12).
export function useHelpBubbles(
  { canvas, draft }: HelpStores,
  pillState: DraftPillState,
  windowSection: string | undefined,
  moderation: ModerationControls | undefined,
): HelpBubblesView {
  const view = useSyncExternalStore(canvas.subscribe, canvas.getView, canvas.getView);
  const { mode, draft: cells } = useSyncExternalStore(draft.subscribe, draft.getView, draft.getView);
  const hasPannedInDraft = useSyncExternalStore(draftPan.subscribe, draftPan.hasPanned, getNotPanned);
  const placements = useSyncExternalStore(placementCount.subscribe, placementCount.getCount, getNoPlacement);
  const isTouchScreen = useMediaQuery(TOUCH_SCREEN_QUERY);
  // Le bouton de la couleur actuelle n'existe que dans la feuille Dessin repliée : ni au grand écran, ni dans le panneau du paysage
  // (Écart §8.1, JOURNAL 2026-10-12).
  const isCompact = useMediaQuery(COMPACT_SCREEN_QUERY);
  const isSidePanel = useMediaQuery(SIDE_COLUMN_QUERY);
  const hasColorButton = isCompact && !isSidePanel;
  const isReady = useAfterDelay(view.width > 0, HINT_SHOW_DELAY_MS);
  const openWindows = useOpenWindowCount();
  const isSeen = useSeenBubbles(HELP_BUBBLES);
  const isTwitchSyncMissing = useTwitchSyncMissing(
    canvas,
    view.role === "owner" && windowSection !== undefined && !isSeen("twitch-sync"),
  );
  // La fenêtre finit de s'ouvrir avant que sa bulle se pose : sa cible bouge tant qu'elle glisse.
  const [windowMotionMs] = useState(() => motionMs(document.documentElement, "--lp-dur"));
  // Seule ouverte : une petite fenêtre par-dessus la couvrirait.
  const isWindowSettled = useAfterDelay(windowSection !== undefined && openWindows === 1, windowMotionMs);

  const facts: HelpFacts = {
    ...toPillFacts(pillState),
    role: view.role,
    isTouchScreen,
    hasPannedInDraft,
    hasColorButton,
    draftSize: cells.size,
    placementCount: placements,
    pendingReports: view.reportCount,
    windowSection,
    isThemeMissing: view.params !== undefined && view.params.theme === undefined,
    isTwitchSyncMissing,
    isInspecting: view.inspection !== null,
    canModerateInspected: canModerateInspection(view.inspection, mode, moderation),
  };
  const pending = pickHelpBubble(facts, isSeen);
  // Ni avant que le canvas se soit montré un moment, ni connexion coupée, ni fenêtre ouverte : elle attend. L'inspection ouverte
  // les fait taire, sauf la bulle des actions de modération (JOURNAL 2026-10-12) : `pickHelpBubble` ne choisit que dans la surface
  // de l'instant. Les bulles de la fenêtre (JOURNAL 2026-10-09) font l'inverse : elles n'attendent que la fenêtre.
  const isLive = isReady && view.status === "live";
  const surface = surfaceShown(facts);
  const canShow = isLive && (surface === "window" ? isWindowSettled : openWindows === 0);
  // Inspection ou fenêtre ouverte, connexion coupée : elle part aussitôt, sans rester.
  const shown = useShownBubble(
    canShow ? pending : undefined,
    (bubble) => canShow && surfaceOf(bubble) === surface && isLingering(bubble, facts, isSeen),
  );
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
    onObsLinkCopied: () => {
      for (const bubble of bubblesEndedByCopy(isSeen)) seenBubbles.markSeen(bubble);
    },
    // Ouvrir la palette pendant que sa bulle la propose, ou attend : c'est l'avoir trouvée. Ouverte avant son heure, elle n'est pas
    // consommée (rejouer le tutoriel la ramène à son moment).
    onPaletteOpened: () => {
      if (isWished("palette", facts)) seenBubbles.markSeen("palette");
    },
  };
}
