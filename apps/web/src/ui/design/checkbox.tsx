// Une case à cocher (JOURNAL 2026-09-28) : la case native, aux couleurs de l'accent, et son libellé qui la coche aussi.

type CheckboxProps = {
  label: string;
  isChecked: boolean;
  onToggle: (isChecked: boolean) => void;
  isDisabled?: boolean;
};

export const Checkbox = ({ label, isChecked, onToggle, isDisabled = false }: CheckboxProps) => (
  <label className="lp-checkbox lp-type-body">
    <input
      type="checkbox"
      checked={isChecked}
      disabled={isDisabled}
      onChange={(event) => onToggle(event.target.checked)}
    />
    {label}
  </label>
);
