// Un curseur à crans fixes (JOURNAL 2026-09-25) : la valeur choisie à côté de son libellé, les deux bouts dessous.
// Jamais une valeur entre deux crans : c'est le cran, pas la position, qui part.

import { useId } from "react";

export type SliderStep = { value: number; label: string };

type SliderProps = {
  label: string;
  steps: readonly SliderStep[];
  value: number;
  onPick: (value: number) => void;
  isDisabled?: boolean;
};

export const Slider = ({ label, steps, value, onPick, isDisabled = false }: SliderProps) => {
  const id = useId();
  const index = Math.max(
    0,
    steps.findIndex((step) => step.value === value),
  );
  return (
    <div className="lp-slider">
      <div className="lp-slider-row lp-type-body">
        <label htmlFor={id}>{label}</label>
        <span className="lp-type-numeric">{steps[index]?.label}</span>
      </div>
      <input
        id={id}
        className="lp-range"
        type="range"
        min={0}
        max={steps.length - 1}
        step={1}
        value={index}
        aria-valuetext={steps[index]?.label}
        disabled={isDisabled}
        onChange={(event) => {
          const step = steps[Number(event.target.value)];
          if (step) onPick(step.value);
        }}
      />
      <div className="lp-slider-row lp-type-caption lp-muted" aria-hidden="true">
        <span>{steps[0]?.label}</span>
        <span>{steps.at(-1)?.label}</span>
      </div>
    </div>
  );
};
