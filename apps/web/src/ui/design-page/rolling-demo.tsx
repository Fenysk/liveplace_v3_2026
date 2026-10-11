// Les chiffres qui défilent, à manipuler : les vrais composants, et de quoi faire monter ou descendre leur nombre.

import { Button } from "../design/button";
import { RollingNumber } from "../design/rolling-number";
import { SaturationFigure } from "../design/saturation-figure";
import { StatTile, StatTiles } from "../design/stat-tile";
import { formatCount, formatDuration } from "../developer/activity-labels";
import { formatRate } from "../developer/capacity-labels";
import { WithValue } from "./entry-layout";

// Le sens du nombre fait celui des chiffres : un pas négatif les fait descendre.
const Steps = ({ by, onStep }: { by: readonly number[]; onStep: (by: number) => void }) => (
  <div className="lp-row">
    {by.map((step) => (
      <Button key={step} label={`${step < 0 ? "−" : "+"}${Math.abs(step)}`} onPress={() => onStep(step)} />
    ))}
  </div>
);

const ONE_AND_MORE = [-1, 1, 250];
const PERCENT_STEPS = [-1, 1, 10];

export const RollingTileDemo = () => (
  <WithValue initial={1234}>
    {(pixels, setPixels) => (
      <div className="lp-setting">
        <StatTiles>
          <StatTile label="Pixels de la dernière minute" value={formatCount(pixels)} />
        </StatTiles>
        <Steps by={ONE_AND_MORE} onStep={(by) => setPixels(Math.max(0, pixels + by))} />
      </div>
    )}
  </WithValue>
);

export const RollingPercentDemo = () => (
  <WithValue initial={62}>
    {(percent, setPercent) => (
      <div className="lp-setting">
        <SaturationFigure percent={formatRate(percent)} tone="neutral" caption="Redis, mémoire" />
        <Steps by={PERCENT_STEPS} onStep={(by) => setPercent(Math.min(100, Math.max(0, percent + by)))} />
      </div>
    )}
  </WithValue>
);

// Un nombre seul, au milieu d'un texte : les mots ne bougent pas, seuls les chiffres de la durée défilent.
export const RollingDurationDemo = () => (
  <WithValue initial={269}>
    {(minutes, setMinutes) => (
      <div className="lp-setting">
        <span className="lp-type-body">
          Connecté depuis <RollingNumber value={formatDuration(minutes)} />
        </span>
        <Steps by={ONE_AND_MORE} onStep={(by) => setMinutes(Math.max(0, minutes + by))} />
      </div>
    )}
  </WithValue>
);
