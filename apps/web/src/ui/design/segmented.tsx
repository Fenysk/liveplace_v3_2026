// Un choix exclusif, aussi large que ses options (le thème dans Préférences).
// De vrais boutons radio sous les étiquettes : le clavier (flèches, Tab) et les lecteurs d'écran les connaissent déjà.

import type { LucideIcon } from "lucide-react";
import { useId } from "react";

export type SegmentedOption<Value extends string> = { value: Value; label: string; icon?: LucideIcon };

type SegmentedProps<Value extends string> = {
  label: string;
  options: readonly SegmentedOption<Value>[];
  value: Value;
  onSelect: (value: Value) => void;
};

export const Segmented = <Value extends string>({
  label,
  options,
  value,
  onSelect,
}: SegmentedProps<Value>) => {
  const name = useId();
  return (
    <div className="lp-segmented" role="radiogroup" aria-label={label}>
      {options.map(({ value: optionValue, label: optionLabel, icon: Icon }) => (
        <label key={optionValue} className="lp-segmented-option lp-type-body">
          <input
            type="radio"
            name={name}
            value={optionValue}
            checked={optionValue === value}
            onChange={() => onSelect(optionValue)}
          />
          {Icon && <Icon aria-hidden="true" />}
          {optionLabel}
        </label>
      ))}
    </div>
  );
};
