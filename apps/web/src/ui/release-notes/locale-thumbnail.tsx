// « Hello world! » : en haut d'une mini-fresque, le choix de la langue du jeu (le `Segmented` de l'accueil et de Mon compte : Français,
// English) ; en bas, la pill Dessin en Vue (la jauge et Dessiner). Une souris choisit English : les mots de la pill passent en anglais,
// puis Français : ils reviennent (locale-motion.ts). La vignette écrit les deux langues, quelle que soit celle de la page, et un attribut
// dit laquelle se lit. L'image fixe : English choisi, la pill en anglais, sans la souris.

import { useRef } from "react";
import { classNames } from "../design/class-names";
import { enterLabel } from "../draft/draft-labels";
import { LOCALE_NAMES, LOCALES } from "../locale/locale";
import { GaugeMini } from "./gauge-mini";
import { LOCALE_RESTING_MS, localeAt } from "./locale-motion";
import { MiniCanvas } from "./mini-canvas";
import { PillButton } from "./pill-tool";
import { motifCells } from "./pixel-motifs";
import { ArtAt } from "./scene-art";
import { layersOfCells } from "./thumbnail-art";
import { Pointer, setPointer, setTaps } from "./thumbnail-pointer";
import { useVisibleLoop } from "./use-visible-loop";

const SMILEY_LAYERS = layersOfCells(motifCells("smiley", 0, 0));
const SMILEY_AT = { x: 46, y: 25 } as const;
// « 20/20 » : la jauge est pleine, son nombre répète sa capacité.
const GAUGE_TEXT = "20/20";

// Chaque image : la langue lue, l'option choisie du choix, l'appui de chaque option, la souris.
const renderLocale = (host: HTMLElement, timeMs: number): void => {
  const moment = localeAt(timeMs);
  host.dataset.locale = moment.chosen;
  host.querySelectorAll<HTMLElement>(".lp-segmented-option").forEach((option) => {
    option.classList.toggle("is-selected", option.dataset.tap === moment.chosen);
  });
  setTaps(host, moment.taps);
  setPointer(host, moment.pointer, moment.press);
};

export const LocaleThumbnail = () => {
  const host = useRef<HTMLSpanElement>(null);
  useVisibleLoop(host, renderLocale, LOCALE_RESTING_MS);
  const resting = localeAt(LOCALE_RESTING_MS);
  return (
    <span
      ref={host}
      className="lp-release-scene lp-release-text-scene lp-release-locale"
      data-locale={resting.chosen}
    >
      <MiniCanvas layers={[]}>
        <ArtAt layers={SMILEY_LAYERS} x={SMILEY_AT.x} y={SMILEY_AT.y} />
      </MiniCanvas>
      <span className="lp-pill lp-release-pill lp-release-pill--top-center">
        <span className="lp-pill-content">
          <span className="lp-segmented lp-selection">
            {LOCALES.map((locale) => (
              <span
                key={locale}
                className={classNames(
                  "lp-segmented-option lp-type-body",
                  locale === resting.chosen && "is-selected",
                )}
                data-tap={locale}
                aria-hidden="true"
              >
                {LOCALE_NAMES[locale]}
              </span>
            ))}
          </span>
        </span>
      </span>
      <span className="lp-pill lp-release-pill lp-release-pill--bottom-center">
        <span className="lp-pill-content">
          <GaugeMini>
            <span className="lp-gauge-text lp-gauge-text--charge lp-type-numeric">{GAUGE_TEXT}</span>
          </GaugeMini>
          {LOCALES.map((locale) => (
            <PillButton
              key={locale}
              label={enterLabel(0, locale)}
              variant="primary"
              className={`lp-release-in-${locale}`}
            />
          ))}
        </span>
      </span>
      <Pointer />
    </span>
  );
};
