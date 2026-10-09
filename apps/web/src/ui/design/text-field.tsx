// Un champ de texte (Écart §15, JOURNAL 2026-10-06) : le thème facultatif d'un canvas. Son libellé est lié au champ, et
// les raccourcis du jeu se taisent pendant qu'on y écrit (use-draft-keys.ts). Avec `onCommit`, il se valide en perdant
// le focus, ou par Entrée : un réglage sans bouton Enregistrer.

import { useId } from "react";

type TextFieldProps = {
  label: string;
  value: string;
  onInput: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  isDisabled?: boolean;
  onCommit?: () => void;
};

export const TextField = ({
  label,
  value,
  onInput,
  placeholder,
  maxLength,
  isDisabled = false,
  onCommit,
}: TextFieldProps) => {
  const id = useId();
  return (
    <div className="lp-field">
      <label className="lp-type-body" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="lp-input lp-type-body"
        type="text"
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={isDisabled}
        autoComplete="off"
        onChange={(event) => onInput(event.target.value)}
        onBlur={onCommit}
        onKeyDown={(event) => {
          // Pendant une composition (IME), Entrée choisit le mot : il ne valide pas le champ.
          if (onCommit && event.key === "Enter" && !event.nativeEvent.isComposing) event.currentTarget.blur();
        }}
      />
    </div>
  );
};
