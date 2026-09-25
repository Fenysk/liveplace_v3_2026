// Un curseur à crans fixes (JOURNAL 2026-09-25) : la valeur choisie à côté de son libellé, les deux bouts dessous.
// Jamais une valeur entre deux crans : c'est le cran, pas la position, qui part, et seulement au relâchement.
// Un glissement de 10 min à 10 s ne passe donc par aucun cran intermédiaire.

import { useEffect, useId, useRef, useState } from "react";

export type SliderStep = { value: number; label: string };

type SliderProps = {
  label: string;
  steps: readonly SliderStep[];
  value: number;
  onPick: (value: number) => void; // au relâchement, ou à chaque flèche du clavier
  isDisabled?: boolean;
};

export const Slider = ({ label, steps, value, onPick, isDisabled = false }: SliderProps) => {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  // La position pendant qu'on fait glisser : affichée, pas encore envoyée.
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const index = Math.max(
    0,
    steps.findIndex((step) => step.value === value),
  );
  const shownIndex = draggedIndex ?? index;

  // L'événement natif `change` part au relâchement ; celui de React, à chaque cran franchi.
  useEffect(() => {
    const element = input.current;
    if (!element) return;
    const release = (): void => {
      setDraggedIndex(null);
      const step = steps[Number(element.value)];
      if (step && step.value !== value) onPick(step.value);
    };
    element.addEventListener("change", release);
    return () => element.removeEventListener("change", release);
  }, [steps, value, onPick]);

  return (
    <div className="lp-slider">
      <div className="lp-slider-row lp-type-body">
        <label htmlFor={id}>{label}</label>
        <span className="lp-type-numeric">{steps[shownIndex]?.label}</span>
      </div>
      <input
        ref={input}
        id={id}
        className="lp-range"
        type="range"
        min={0}
        max={steps.length - 1}
        step={1}
        value={shownIndex}
        aria-valuetext={steps[shownIndex]?.label}
        disabled={isDisabled}
        onChange={(event) => setDraggedIndex(Number(event.target.value))}
      />
      <div className="lp-slider-row lp-type-caption lp-muted" aria-hidden="true">
        <span>{steps[0]?.label}</span>
        <span>{steps.at(-1)?.label}</span>
      </div>
    </div>
  );
};
