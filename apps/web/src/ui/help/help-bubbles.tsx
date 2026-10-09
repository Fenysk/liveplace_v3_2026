// Les bulles d'aide (Écart §8.1, JOURNAL 2026-10-08), l'une sur la cible qu'elle désigne : l'affichage seul, nourri par
// `useHelpBubbles`. Une seule est visible à la fois ; les autres attendent dans la page, invisibles, pour paraître en fondu.

import { Brush, Copy, Flag, Gift, Hourglass, MonitorPlay, Pointer } from "lucide-react";
import { useContext } from "react";
import type { Refill } from "../../state/gauge";
import { HELP_BUBBLES, type HelpBubble, isInWindow } from "../../state/help-bubbles";
import { Bubble, BubbleLine } from "../design/bubble";
import type { BubbleSide } from "../design/bubble-position";
import type { ButtonIcon } from "../design/button";
import { useMediaQuery, WINDOW_SHEET_QUERY } from "../design/use-media-query";
import { type BubbleTargetName, BubbleTargetsContext } from "./bubble-target";
import {
  draftText,
  gaugeText,
  OBS_ADDRESS_TEXT,
  OBS_TAB_TEXT,
  OBS_TEXT,
  REPORT_TEXT,
  REWARD_TEXT,
  TRACE_TEXT,
} from "./help-texts";

export type HelpTextContext = { isTouchScreen: boolean; refill: Refill | undefined };

// Les côtés d'où une bulle de la fenêtre vise sa cible (Écart §8.1, JOURNAL 2026-10-09), des constantes : la bulle suit ce qui
// change. L'onglet d'une barre latérale (PC) se vise de la gauche, sur le voile, puis de la droite, par-dessus le contenu ; celui
// d'une rangée d'onglets (la feuille), de dessous, par-dessus le contenu.
const TAB_SIDES: Record<"wide" | "sheet", readonly BubbleSide[]> = {
  wide: ["left", "right"],
  sheet: ["below", "above"],
};

type HelpBubbleSpec = {
  icon: ButtonIcon;
  target: BubbleTargetName;
  text: (context: HelpTextContext) => string;
  sides?: Record<"wide" | "sheet", readonly BubbleSide[]>; // absent : la bulle se pose où elle tient
};

// Une ligne par bulle : son icône, ce qu'elle désigne, ce qu'elle dit.
const SPECS: Record<HelpBubble, HelpBubbleSpec> = {
  "pending-report": { icon: Flag, target: "reports", text: () => REPORT_TEXT },
  "obs-settings": { icon: MonitorPlay, target: "settings", text: () => OBS_TEXT },
  "obs-tab": { icon: MonitorPlay, target: "obs-tab", text: () => OBS_TAB_TEXT, sides: TAB_SIDES },
  "obs-address": { icon: Copy, target: "obs-address", text: () => OBS_ADDRESS_TEXT },
  "first-reward": { icon: Gift, target: "claim", text: () => REWARD_TEXT },
  "empty-gauge": { icon: Hourglass, target: "gauge", text: ({ refill }) => gaugeText(refill) },
  "draft-trace": { icon: Brush, target: "trace", text: () => TRACE_TEXT },
  "first-draft": { icon: Pointer, target: "submit", text: ({ isTouchScreen }) => draftText(isTouchScreen) },
};

export const helpTargetOf = (bubble: HelpBubble): BubbleTargetName => SPECS[bubble].target;

// Le contenu d'une bulle d'aide : sur le jeu comme sur /design, le même.
export const HelpBubbleLine = ({ bubble, ...context }: HelpTextContext & { bubble: HelpBubble }) => {
  const { icon, text } = SPECS[bubble];
  return <BubbleLine icon={icon}>{text(context)}</BubbleLine>;
};

type HelpBubblesProps = HelpTextContext & { shown: HelpBubble | undefined };

export const HelpBubbles = ({ shown, ...context }: HelpBubblesProps) => {
  const targets = useContext(BubbleTargetsContext);
  const isSheet = useMediaQuery(WINDOW_SHEET_QUERY);
  if (!targets) return null;
  return HELP_BUBBLES.map((bubble) => {
    const sides = SPECS[bubble].sides?.[isSheet ? "sheet" : "wide"];
    return (
      <Bubble
        key={bubble}
        isVisible={shown === bubble}
        target={targets[helpTargetOf(bubble)]}
        isOverWindow={isInWindow(bubble)}
        {...(sides ? { sides } : {})}
      >
        <HelpBubbleLine bubble={bubble} {...context} />
      </Bubble>
    );
  });
};
