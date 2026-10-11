// Une case à cocher (JOURNAL 2026-09-28) : une vraie case, aux couleurs de l'accent, dont la coche paraît en fondu, et son libellé qui la coche aussi.

import { Check } from "lucide-react";

type CheckboxProps = {
  label: string;
  isChecked: boolean;
  onToggle: (isChecked: boolean) => void;
  isDisabled?: boolean;
};

export const Checkbox = ({ label, isChecked, onToggle, isDisabled = false }: CheckboxProps) => (
  <label className="lp-checkbox lp-type-body">
    <span className="lp-checkbox-box">
      <input
        type="checkbox"
        checked={isChecked}
        disabled={isDisabled}
        onChange={(event) => onToggle(event.target.checked)}
      />
      <Check className="lp-checkbox-tick" aria-hidden="true" />
    </span>
    {label}
  </label>
);
