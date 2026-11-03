// « Un coup de pouce ? » : la pill Dessin (la jauge à 7/10 et Valider) en bas d'une mini-fresque, et les vraies bulles d'aide du tutoriel (la
// bulle, sa flèche, l'anneau autour de ce qu'elle désigne) : celle de Valider, puis celle de la jauge. Puis la fenêtre Mon compte,
// réduite à sa rangée Tutoriel, s'ouvre : une souris clique « Revoir le tuto », le toast confirme et la première bulle revient
// (help-motion.ts). L'image fixe : la bulle de Valider, sans la souris. Les bulles du jeu sont des `<div>` et des `<p>` : celles-ci
// sont des `<span>` aux mêmes classes (bubble.css), la vignette étant déjà un bouton.

import { RotateCcw } from "lucide-react";
import { type ReactNode, useRef } from "react";
import type { Refill } from "../../state/gauge";
import { ACCOUNT_TEXTS } from "../account/account-texts";
import { classNames } from "../design/class-names";
import { DRAFT_TEXTS } from "../draft/draft-texts";
import { helpIconOf, useHelpText } from "../help/help-bubbles";
import { useTexts } from "../locale/use-locale";
import { GaugeMini } from "./gauge-mini";
import { HELP_RESTING_MS, helpAt } from "./help-motion";
import { ToastMini, WindowVeil } from "./inspection-parts";
import { MiniCanvas } from "./mini-canvas";
import { PillButton } from "./pill-tool";
import { motifCells } from "./pixel-motifs";
import { ArtAt } from "./scene-art";
import { layersOfCells } from "./thumbnail-art";
import { Pointer, setPointer, setTaps } from "./thumbnail-pointer";
import { setThumbnailVariable } from "./thumbnail-variables";
import { useVisibleLoop } from "./use-visible-loop";

const HEART_LAYERS = layersOfCells(motifCells("heart", 0, 0));
const HEART_AT = { x: 6, y: 6 } as const;
const REFILL: Refill = { refillMs: 10_000, refillCharges: 1 };
// « 7/10 » : la jauge se recharge, le tube est à 70 % : son nombre tient dans le fluide.
const GAUGE_TEXT = "7/10";

// Chaque image : les deux bulles, la fenêtre et son voile, le toast, l'appui de Revoir le tuto, la souris.
const renderHelp = (host: HTMLElement, timeMs: number): void => {
  const moment = helpAt(timeMs);
  setThumbnailVariable(host, "--lp-release-bubble-submit", moment.submitBubble);
  setThumbnailVariable(host, "--lp-release-bubble-gauge", moment.gaugeBubble);
  setThumbnailVariable(host, "--lp-release-window", moment.window);
  setThumbnailVariable(host, "--lp-release-toast", moment.toast);
  setTaps(host, { restart: moment.restartTap });
  setPointer(host, moment.pointer, moment.press);
};

type BubbleMiniProps = { bubble: "first-draft" | "empty-gauge"; className: string; children: ReactNode };

// Une bulle posée au-dessus de ce qu'elle désigne : la pill, la ligne (l'icône et le texte), la flèche.
const BubbleMini = ({ bubble, className, children }: BubbleMiniProps) => {
  const Icon = helpIconOf(bubble);
  return (
    <span
      className={classNames("lp-bubble lp-bubble--pointing lp-release-bubble", className)}
      data-side="above"
      data-positioned=""
    >
      <span className="lp-pill lp-release-pill">
        <span className="lp-pill-content lp-col">
          <span className="lp-bubble-body">
            <span className="lp-bubble-line lp-type-caption">
              <Icon aria-hidden="true" />
              <span>{children}</span>
            </span>
          </span>
        </span>
      </span>
      <span className="lp-bubble-arrow" aria-hidden="true" />
    </span>
  );
};

export const HelpThumbnail = () => {
  const host = useRef<HTMLSpanElement>(null);
  const account = useTexts(ACCOUNT_TEXTS);
  const draft = useTexts(DRAFT_TEXTS);
  const submitText = useHelpText("first-draft", {
    isTouchScreen: false,
    refill: REFILL,
    gaugeMax: undefined,
  });
  const gaugeText = useHelpText("empty-gauge", { isTouchScreen: false, refill: REFILL, gaugeMax: undefined });
  useVisibleLoop(host, renderHelp, HELP_RESTING_MS);
  return (
    <span ref={host} className="lp-release-scene lp-release-text-scene lp-release-help">
      <MiniCanvas layers={[]}>
        <ArtAt layers={HEART_LAYERS} x={HEART_AT.x} y={HEART_AT.y} />
      </MiniCanvas>
      <span className="lp-pill lp-release-pill lp-release-pill--bottom-center">
        <span className="lp-pill-content">
          <span className="lp-bubble-target lp-release-aim lp-release-aim--gauge">
            <GaugeMini isFull={false}>
              <span className="lp-gauge-text lp-gauge-text--empty lp-type-numeric">{GAUGE_TEXT}</span>
              <span className="lp-gauge-text lp-gauge-text--charge lp-type-numeric">{GAUGE_TEXT}</span>
            </GaugeMini>
          </span>
          <span className="lp-bubble-target lp-release-aim lp-release-aim--submit">
            <PillButton label={draft.confirm} variant="primary" />
          </span>
        </span>
      </span>
      <BubbleMini bubble="first-draft" className="lp-release-bubble--submit">
        {submitText}
      </BubbleMini>
      <BubbleMini bubble="empty-gauge" className="lp-release-bubble--gauge">
        {gaugeText}
      </BubbleMini>
      <WindowVeil />
      <span className="lp-pill lp-release-pill lp-release-confirm">
        <span className="lp-pill-content">
          <span className="lp-window-row lp-type-body">
            <span>{account.tutorial}</span>
            <PillButton label={account.tutorialRestart} icon={RotateCcw} tap="restart" />
          </span>
        </span>
      </span>
      <ToastMini message={account.tutorialRestarted} />
      <Pointer />
    </span>
  );
};
