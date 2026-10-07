// Un choix exclusif, une option par ligne, avec sa phrase d'aide (Écart §15, JOURNAL 2026-10-06) : les jauges des
// viewers quand le canvas change. Aucune option n'est présélectionnée : `value` à `null`, rien n'est coché.
// De vrais boutons radio sous les lignes : le clavier (flèches, Tab) et les lecteurs d'écran les connaissent déjà.

import { useId } from "react";

export type ChoiceOption<Value extends string> = { value: Value; label: string; note?: string };

type ChoiceListProps<Value extends string> = {
  label: string;
  options: readonly ChoiceOption<Value>[];
  value: Value | null;
  onSelect: (value: Value) => void;
  isDisabled?: boolean;
};

export const ChoiceList = <Value extends string>({
  label,
  options,
  value,
  onSelect,
  isDisabled = false,
}: ChoiceListProps<Value>) => {
  const name = useId();
  return (
    <fieldset className="lp-choices" disabled={isDisabled}>
      <legend className="lp-type-body">{label}</legend>
      {options.map(({ value: optionValue, label: optionLabel, note }) => (
        <label key={optionValue} className="lp-choice">
          <input
            type="radio"
            name={name}
            value={optionValue}
            checked={optionValue === value}
            onChange={() => onSelect(optionValue)}
          />
          <span className="lp-choice-text">
            <span className="lp-type-body">{optionLabel}</span>
            {note && <span className="lp-type-caption lp-muted">{note}</span>}
          </span>
        </label>
      ))}
    </fieldset>
  );
};
