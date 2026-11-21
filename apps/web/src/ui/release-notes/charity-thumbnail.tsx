// « Événement caritatif » : une mini-fresque, la pastille de l'événement en haut (son cadre arc-en-ciel, « En cours ») et la pill Dessin dont
// la jauge n'est pas pleine. Une ligne de don s'ouvre sous le titre, avec son +50 doré : la souris le clique, la ligne se referme et la jauge
// monte (charity-motion.ts). Ce ne sont que des `<span>` : la vignette est déjà un bouton. L'image fixe : la ligne de don ouverte, sans souris.

import { Heart } from "lucide-react";
import { useRef } from "react";
import { formatAmount, formatPixels } from "../design/donation-toast-timing";
import { enterLabel } from "../draft/draft-labels";
import { useLocale, useTexts } from "../locale/use-locale";
import { CHARITY_RESTING_MS, charityAt } from "./charity-motion";
import { GaugeMini } from "./gauge-mini";
import { MiniCanvas } from "./mini-canvas";
import { PillButton } from "./pill-tool";
import { motifCells } from "./pixel-motifs";
import { RELEASE_NOTES_TEXTS } from "./release-notes-texts";
import { ArtAt } from "./scene-art";
import { layersOfCells } from "./thumbnail-art";
import { Pointer, setPointer, setTaps } from "./thumbnail-pointer";
import { setThumbnailVariable } from "./thumbnail-variables";
import { useVisibleLoop } from "./use-visible-loop";

const MUSHROOM_LAYERS = layersOfCells(motifCells("mushroom", 0, 0));
const CAT_LAYERS = layersOfCells(motifCells("cat", 0, 0));
const HEART_LAYERS = layersOfCells(motifCells("heart", 0, 0));
const MUSHROOM_AT = { x: 14, y: 40 } as const;
const CAT_AT = { x: 46, y: 34 } as const;
const HEART_AT = { x: 86, y: 44 } as const;
// Le don de la vignette : 5 €, soit 50 dessins offerts (1 € = 10 pixels).
const DONATION_CENTS = 500;
const DONATION_PIXELS = 50;

const gaugeText = (count: number): string => `${count}/20`;

// Chaque image : les pills, la ligne de don, le niveau et le nombre de la jauge, l'appui de +50, la souris.
const renderCharity = (host: HTMLElement, timeMs: number): void => {
  const moment = charityAt(timeMs);
  setThumbnailVariable(host, "--lp-release-pill", moment.pills);
  setThumbnailVariable(host, "--lp-release-donation", moment.donation);
  setThumbnailVariable(host, "--lp-release-level", moment.level);
  const text = host.querySelector(".lp-gauge-text");
  if (text) text.textContent = gaugeText(moment.count);
  setTaps(host, { claim: moment.press });
  setPointer(host, moment.pointer, moment.press);
};

export const CharityThumbnail = () => {
  const host = useRef<HTMLSpanElement>(null);
  const locale = useLocale();
  const t = useTexts(RELEASE_NOTES_TEXTS);
  useVisibleLoop(host, renderCharity, CHARITY_RESTING_MS);
  const resting = charityAt(CHARITY_RESTING_MS);
  return (
    <span ref={host} className="lp-release-scene lp-release-text-scene lp-release-charity">
      <MiniCanvas layers={[]}>
        <ArtAt layers={MUSHROOM_LAYERS} x={MUSHROOM_AT.x} y={MUSHROOM_AT.y} />
        <ArtAt layers={CAT_LAYERS} x={CAT_AT.x} y={CAT_AT.y} />
        <ArtAt layers={HEART_LAYERS} x={HEART_AT.x} y={HEART_AT.y} />
      </MiniCanvas>
      <span className="lp-pill lp-pill--title lp-pill--claim lp-release-pill lp-release-pill--top-center">
        <span className="lp-pill-content">
          <span className="lp-event-frame">
            <span className="lp-event-frame-boost" />
          </span>
          <span className="lp-event-body">
            <span className="lp-event-heading lp-type-heading">
              <span className="lp-event-title-text">{t.charityTitle}</span>
            </span>
            <span className="lp-event-line lp-type-numeric lp-muted">{t.charityLine}</span>
            <span className="lp-donation lp-release-donation lp-type-body">
              <Heart />
              <span className="lp-release-donation-text">
                {`${t.charityDonation} · ${formatAmount(DONATION_CENTS, locale)}`}
              </span>
              <span className="lp-btn lp-claim lp-type-body" data-tap="claim">
                <span className="lp-type-numeric">{`+${formatPixels(DONATION_PIXELS, locale)}`}</span>
              </span>
            </span>
          </span>
        </span>
      </span>
      <span className="lp-pill lp-release-pill lp-release-pill--bottom-center">
        <span className="lp-pill-content">
          <GaugeMini isFull={false}>
            <span className="lp-gauge-text lp-gauge-text--charge lp-type-numeric">
              {gaugeText(resting.count)}
            </span>
          </GaugeMini>
          <PillButton label={enterLabel(0, locale)} variant="primary" />
        </span>
      </span>
      <Pointer />
    </span>
  );
};
