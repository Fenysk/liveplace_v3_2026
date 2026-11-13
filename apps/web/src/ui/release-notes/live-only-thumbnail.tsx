// « Dessin pendant tes lives » : une mini-fresque, la pill de profil du streamer (son avatar et son bouton Twitch, d'abord gris) au-dessus de
// la pill Dessin du jeu (la jauge et Dessiner). Hors live, Dessiner est grisé (`lp-btn--inactive`) : une souris appuie dessus, le toast du jeu
// dit quand le dessin s'ouvre. Puis le live démarre : le bouton Twitch passe en live, et Dessiner redevient plein (live-only-motion.ts).
// Ce ne sont que des `<span>` : la vignette est déjà un bouton. L'image fixe : hors live, Dessiner grisé, le toast visible, sans souris.

import { useRef } from "react";
import { classNames } from "../design/class-names";
import { Avatar } from "../design/profile";
import { enterLabel } from "../draft/draft-labels";
import { DRAFT_TEXTS } from "../draft/draft-texts";
import { useLocale, useTexts } from "../locale/use-locale";
import { GaugeMini } from "./gauge-mini";
import { AUTHOR, ToastMini } from "./inspection-parts";
import { LIVE_ONLY_RESTING_MS, liveOnlyAt } from "./live-only-motion";
import { TwitchButtonMini } from "./live-thumbnail";
import { MiniCanvas } from "./mini-canvas";
import { PillButton } from "./pill-tool";
import { motifCells } from "./pixel-motifs";
import { ArtAt } from "./scene-art";
import { layersOfCells } from "./thumbnail-art";
import { Pointer, setPointer, setTaps } from "./thumbnail-pointer";
import { setThumbnailVariable } from "./thumbnail-variables";
import { useVisibleLoop } from "./use-visible-loop";

const HEART_LAYERS = layersOfCells(motifCells("heart", 0, 0));
const HEART_AT = { x: 8, y: 24 } as const;
// « 20/20 » : la jauge est pleine, son nombre répète sa capacité.
const GAUGE_TEXT = "20/20";

// Chaque image : les pills, le bouton Twitch gris ou en live, Dessiner grisé ou plein, le toast, l'appui de Dessiner, la souris.
const renderLiveOnly = (host: HTMLElement, timeMs: number): void => {
  const moment = liveOnlyAt(timeMs);
  setThumbnailVariable(host, "--lp-release-pill", moment.pills);
  setThumbnailVariable(host, "--lp-release-live", moment.live);
  setThumbnailVariable(host, "--lp-release-toast", moment.toast);
  host.querySelector(".lp-release-enter")?.classList.toggle("lp-btn--inactive", moment.isGreyed);
  setTaps(host, { enter: moment.press });
  setPointer(host, moment.pointer, moment.press);
};

export const LiveOnlyThumbnail = () => {
  const host = useRef<HTMLSpanElement>(null);
  const locale = useLocale();
  const draft = useTexts(DRAFT_TEXTS);
  useVisibleLoop(host, renderLiveOnly, LIVE_ONLY_RESTING_MS);
  const resting = liveOnlyAt(LIVE_ONLY_RESTING_MS);
  return (
    <span ref={host} className="lp-release-scene lp-release-text-scene lp-release-liveonly">
      <MiniCanvas layers={[]}>
        <ArtAt layers={HEART_LAYERS} x={HEART_AT.x} y={HEART_AT.y} />
      </MiniCanvas>
      <span className="lp-pill lp-release-pill lp-release-profile">
        <span className="lp-pill-content">
          <span className="lp-profile">
            <span className="lp-profile-main">
              <Avatar displayName={AUTHOR} />
              <span className="lp-profile-name lp-type-body">{AUTHOR}</span>
            </span>
            <TwitchButtonMini />
          </span>
        </span>
      </span>
      <span className="lp-pill lp-release-pill lp-release-pill--bottom-center">
        <span className="lp-pill-content">
          <GaugeMini>
            <span className="lp-gauge-text lp-gauge-text--charge lp-type-numeric">{GAUGE_TEXT}</span>
          </GaugeMini>
          <PillButton
            label={enterLabel(0, locale)}
            variant="primary"
            tap="enter"
            className={classNames("lp-release-enter", resting.isGreyed && "lp-btn--inactive")}
          />
        </span>
      </span>
      <ToastMini message={draft.waitingForLive(AUTHOR)} tone="error" />
      <Pointer />
    </span>
  );
};
