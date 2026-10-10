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
import { useTexts } from "../locale/use-locale";
import { type BubbleTargetName, BubbleTargetsContext } from "./bubble-target";
import { HELP_TEXTS } from "./help-texts";

export type HelpTextContext = { isTouchScreen: boolean; refill: Refill | undefined };

type HelpTexts = (typeof HELP_TEXTS)["fr"];

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
  text: (t: HelpTexts, context: HelpTextContext) => string;
  sides?: Record<"wide" | "sheet", readonly BubbleSide[]>; // absent : la bulle se pose où elle tient
};

// Une ligne par bulle : son icône, ce qu'elle désigne, ce qu'elle dit.
const SPECS: Record<HelpBubble, HelpBubbleSpec> = {
  "pending-report": { icon: Flag, target: "reports", text: (t) => t.report },
  "obs-settings": { icon: MonitorPlay, target: "settings", text: (t) => t.obs },
  "obs-tab": { icon: MonitorPlay, target: "obs-tab", text: (t) => t.obsTab, sides: TAB_SIDES },
  "obs-address": { icon: Copy, target: "obs-address", text: (t) => t.obsAddress },
  "first-reward": { icon: Gift, target: "claim", text: (t) => t.reward },
  "empty-gauge": { icon: Hourglass, target: "gauge", text: (t, { refill }) => t.gauge(refill) },
  "draft-trace": { icon: Brush, target: "trace", text: (t) => t.trace },
  "first-draft": { icon: Pointer, target: "submit", text: (t, { isTouchScreen }) => t.draft(isTouchScreen) },
};

export const helpTargetOf = (bubble: HelpBubble): BubbleTargetName => SPECS[bubble].target;

// Le contenu d'une bulle d'aide : sur le jeu comme sur /design, le même.
export const HelpBubbleLine = ({ bubble, ...context }: HelpTextContext & { bubble: HelpBubble }) => {
  const t = useTexts(HELP_TEXTS);
  const { icon, text } = SPECS[bubble];
  return <BubbleLine icon={icon}>{text(t, context)}</BubbleLine>;
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
