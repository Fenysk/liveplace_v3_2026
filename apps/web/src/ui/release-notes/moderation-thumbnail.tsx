// « Modération facile » : la vraie pill Compte, en haut à droite d'une mini-fresque (le bouclier de Modération, Nouveautés, la
// photo). Un point rouge paraît sur le bouclier, un curseur vient le cliquer, la liste des signalements s'ouvre dessous. L'image fixe :
// le point rouge sur le bouclier.

import { MousePointer2, Shield, Sparkles } from "lucide-react";
import { useRef } from "react";
import { Avatar } from "../design/profile";
import { MiniCanvas } from "./mini-canvas";
import { PillTool } from "./pill-tool";
import { motifCells } from "./pixel-motifs";
import { layersOfCells } from "./thumbnail-art";
import { MODERATION_RESTING_MS, moderationAt } from "./thumbnail-motion";
import { setThumbnailVariable } from "./thumbnail-variables";
import { useVisibleLoop } from "./use-visible-loop";

const CAT_LAYERS = layersOfCells(motifCells("cat", 6, 8));
const REPORTERS = ["Kira", "Nox"] as const;
// D'où le curseur part, en unités de la vignette, par rapport au bouclier.
const CURSOR_FROM = { x: 22, y: 16 } as const;

const renderModeration = (host: HTMLElement, timeMs: number): void => {
  const { dot, cursor, approach, press, sheet } = moderationAt(timeMs);
  setThumbnailVariable(host, "--lp-release-dot", dot);
  setThumbnailVariable(host, "--lp-release-cursor", cursor);
  setThumbnailVariable(host, "--lp-release-dx", (1 - approach) * CURSOR_FROM.x);
  setThumbnailVariable(host, "--lp-release-dy", (1 - approach) * CURSOR_FROM.y);
  setThumbnailVariable(host, "--lp-release-press", press);
  setThumbnailVariable(host, "--lp-release-sheet", sheet);
};

export const ModerationThumbnail = () => {
  const host = useRef<HTMLSpanElement>(null);
  useVisibleLoop(host, renderModeration, MODERATION_RESTING_MS);
  return (
    <span ref={host} className="lp-release-scene lp-release-moderation">
      <MiniCanvas layers={CAT_LAYERS} />
      <span className="lp-pill lp-release-pill lp-release-pill--top-right">
        <span className="lp-pill-content">
          <PillTool icon={Shield} hasDot className="lp-release-shield" />
          <PillTool icon={Sparkles} />
          <Avatar displayName="Ana" />
        </span>
      </span>
      <span className="lp-pill lp-release-pill lp-release-sheet">
        <span className="lp-pill-content lp-release-sheet-content">
          {REPORTERS.map((name) => (
            <span key={name} className="lp-release-report">
              <Avatar displayName={name} />
              <span className="lp-skeleton lp-release-bar" />
            </span>
          ))}
        </span>
      </span>
      <MousePointer2 className="lp-release-cursor" aria-hidden="true" />
    </span>
  );
};
