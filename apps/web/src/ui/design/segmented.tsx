// Un choix exclusif, aussi large que ses options (l'apparence dans Mon compte).
// De vrais boutons radio sous les étiquettes : le clavier (flèches, Tab) et les lecteurs d'écran les connaissent déjà.

import type { LucideIcon } from "lucide-react";
import { useId } from "react";
import { classNames } from "./class-names";
import { useSelectionGlide } from "./use-selection-glide";

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
  const selection = useSelectionGlide<HTMLDivElement>();
  return (
    <div ref={selection} className="lp-segmented lp-selection" role="radiogroup" aria-label={label}>
      {options.map(({ value: optionValue, label: optionLabel, icon: Icon }) => (
        <label
          key={optionValue}
          className={classNames("lp-segmented-option lp-type-body", optionValue === value && "is-selected")}
        >
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
