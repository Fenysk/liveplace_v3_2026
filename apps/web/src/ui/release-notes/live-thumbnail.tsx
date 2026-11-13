// « En live sur Twitch » : une mini-fresque, la pill Inspection d'un auteur et, dans son profil, le bouton Twitch du jeu (design/profile.tsx).
// Une souris clique un pixel du chat ; la pill s'ouvre ; le bouton Twitch, d'abord gris (le logo seul), passe en live : le logo violet à son rond
// et la catégorie du stream (live-motion.ts). Les deux états sont superposés, le plus large (en live) donne la largeur : la pill ne bouge pas.
// Ce ne sont que des `<span>` : jamais de lien vers Twitch, la vignette est déjà un bouton. L'image fixe : le bouton en live, sans la souris.

import { useRef } from "react";
import { TwitchGlyph, TwitchLiveGlyph } from "../design/twitch";
import { InspectionHead } from "./inspection-parts";
import { CAT_AT, CAT_LAYERS, MUSHROOM_AT, MUSHROOM_LAYERS } from "./inspection-scene";
import { LIVE_CELL, LIVE_COLOR_INDEX, LIVE_RESTING_MS, liveAt } from "./live-motion";
import { MiniCanvas } from "./mini-canvas";
import { PillTool } from "./pill-tool";
import { motifCells } from "./pixel-motifs";
import { ArtAt, CELL, CellOutline } from "./scene-art";
import { layersOfCells } from "./thumbnail-art";
import { Pointer, setPartOpacity, setPointer } from "./thumbnail-pointer";
import { setThumbnailVariable } from "./thumbnail-variables";
import { useVisibleLoop } from "./use-visible-loop";

// La catégorie que Twitch donne au stream (le bouton du jeu l'écrit telle quelle).
const CATEGORY = "Art";
const HEART_LAYERS = layersOfCells(motifCells("heart", 0, 0));
const HEART_AT = { x: 16, y: 42 } as const;

// Chaque image : le contour de la case, la pill, le bouton Twitch gris ou en live, la souris.
const renderLive = (host: HTMLElement, timeMs: number): void => {
  const moment = liveAt(timeMs);
  setPartOpacity(host, "ring", moment.ring);
  setThumbnailVariable(host, "--lp-release-pill", moment.pill);
  setThumbnailVariable(host, "--lp-release-live", moment.live);
  setPointer(host, moment.pointer, moment.press);
};

// Le bouton Twitch du profil, dans ses deux états superposés : le logo seul (hors live), et le bouton en live (le logo violet, la catégorie).
export const TwitchButtonMini = () => (
  <span className="lp-release-twitch">
    <PillTool icon={TwitchGlyph} className="lp-release-twitch-off" />
    <span className="lp-btn lp-btn--live lp-type-caption lp-release-twitch-on" aria-hidden="true">
      <TwitchLiveGlyph />
      <span className="lp-live-category">{CATEGORY}</span>
    </span>
  </span>
);

export const LiveThumbnail = () => {
  const host = useRef<HTMLSpanElement>(null);
  useVisibleLoop(host, renderLive, LIVE_RESTING_MS);
  const resting = liveAt(LIVE_RESTING_MS);
  return (
    <span ref={host} className="lp-release-scene lp-release-text-scene lp-release-live">
      <MiniCanvas layers={[]}>
        <ArtAt layers={MUSHROOM_LAYERS} x={MUSHROOM_AT.x} y={MUSHROOM_AT.y} />
        <ArtAt layers={CAT_LAYERS} x={CAT_AT.x} y={CAT_AT.y} />
        <ArtAt layers={HEART_LAYERS} x={HEART_AT.x} y={HEART_AT.y} />
        <g data-part="ring" opacity={resting.ring}>
          <CellOutline x={CAT_AT.x + LIVE_CELL.x * CELL} y={CAT_AT.y + LIVE_CELL.y * CELL} />
        </g>
      </MiniCanvas>
      <span className="lp-pill lp-release-pill lp-release-inspection lp-release-pill--center-right">
        <span className="lp-pill-content lp-col">
          <InspectionHead colorIndex={LIVE_COLOR_INDEX} twitch={<TwitchButtonMini />} />
        </span>
      </span>
      <Pointer />
    </span>
  );
};
