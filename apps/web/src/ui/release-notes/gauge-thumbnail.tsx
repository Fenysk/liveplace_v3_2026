// « Augmente ta jauge » : la pill Dessin en Vue, en bas au centre d'une mini-fresque : la jauge pleine (l'anneau, le tube et son nombre)
// et, à la place de Dessiner, le +1 doré à réclamer. Une souris clique le +1 : la jauge dit « 21/21 », son tube grossit un instant, et
// le bouton redevient « Dessiner » (gauge-motion.ts). La jauge du jeu écrit des `style` : celle-ci est faite de classes, le niveau est
// plein. L'image fixe : le +1 à côté de la jauge pleine, sans la souris.

import { useRef } from "react";
import { enterLabel } from "../draft/draft-labels";
import { useLocale } from "../locale/use-locale";
import { GaugeMini } from "./gauge-mini";
import { GAUGE_AFTER, GAUGE_BEFORE, GAUGE_RESTING_MS, gaugeAt } from "./gauge-motion";
import { MUSHROOM_LAYERS } from "./inspection-scene";
import { MiniCanvas } from "./mini-canvas";
import { PillButton } from "./pill-tool";
import { ArtAt } from "./scene-art";
import { Pointer, setPointer, setTaps } from "./thumbnail-pointer";
import { setThumbnailVariable } from "./thumbnail-variables";
import { useVisibleLoop } from "./use-visible-loop";

const MUSHROOM_AT = { x: 46, y: 8 } as const;
// « 20/20 » : la jauge est pleine, son nombre répète sa capacité.
const BEFORE_TEXT = `${GAUGE_BEFORE}/${GAUGE_BEFORE}`;
const AFTER_TEXT = `${GAUGE_AFTER}/${GAUGE_AFTER}`;

// Chaque image : l'état (dit par un attribut), le tube qui grossit, l'appui du +1, la pill qui s'efface, la souris.
const renderGauge = (host: HTMLElement, timeMs: number): void => {
  const moment = gaugeAt(timeMs);
  host.dataset.claimed = String(moment.isClaimed);
  setThumbnailVariable(host, "--lp-release-grow", moment.grow);
  setThumbnailVariable(host, "--lp-release-pill", moment.pill);
  setTaps(host, { claim: moment.claimTap });
  setPointer(host, moment.pointer, moment.press);
};

export const GaugeThumbnail = () => {
  const host = useRef<HTMLSpanElement>(null);
  const locale = useLocale();
  useVisibleLoop(host, renderGauge, GAUGE_RESTING_MS);
  const resting = gaugeAt(GAUGE_RESTING_MS);
  return (
    <span
      ref={host}
      className="lp-release-scene lp-release-text-scene lp-release-gauge"
      data-claimed={String(resting.isClaimed)}
    >
      <MiniCanvas layers={[]}>
        <ArtAt layers={MUSHROOM_LAYERS} x={MUSHROOM_AT.x} y={MUSHROOM_AT.y} />
      </MiniCanvas>
      <span className="lp-pill lp-release-pill lp-release-pill--bottom-center">
        <span className="lp-pill-content">
          <GaugeMini>
            <span className="lp-gauge-text lp-gauge-text--charge lp-type-numeric lp-release-before">
              {BEFORE_TEXT}
            </span>
            <span className="lp-gauge-text lp-gauge-text--charge lp-type-numeric lp-release-after">
              {AFTER_TEXT}
            </span>
          </GaugeMini>
          <span className="lp-release-claim-slot">
            <span
              className="lp-btn lp-claim lp-type-body lp-release-before"
              data-tap="claim"
              aria-hidden="true"
            >
              <span className="lp-type-numeric">+1</span>
            </span>
            <PillButton label={enterLabel(0, locale)} variant="primary" className="lp-release-after" />
          </span>
        </span>
      </span>
      <Pointer />
    </span>
  );
};
