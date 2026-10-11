// La saturation, en tête de la section Capacité (Écart §4.3, JOURNAL 2026-10-07) : son pourcentage en grand, et sous
// « Saturation » la ressource qui la porte, et si elle est large, à surveiller ou proche.

import { type CapacityTone, TONE_CLASSES } from "./capacity-tone";
import { classNames } from "./class-names";
import { RollingNumber } from "./rolling-number";

type SaturationFigureProps = {
  percent: string; // « 62 % », déjà au format français
  tone: CapacityTone;
  caption: string; // « Redis, mémoire · à surveiller »
  note?: string | undefined; // incomplète : ce qui est sans nouvelles
};

export const SaturationFigure = ({ percent, tone, caption, note }: SaturationFigureProps) => (
  <div className="lp-saturation">
    <span className={classNames("lp-saturation-value lp-type-display", TONE_CLASSES[tone])}>
      <RollingNumber value={percent} />
    </span>
    <span className="lp-saturation-text">
      <span className="lp-type-title">Saturation</span>
      <span className="lp-type-caption lp-muted">{caption}</span>
      {note && <span className="lp-type-caption lp-warning">{note}</span>}
    </span>
  </div>
);
