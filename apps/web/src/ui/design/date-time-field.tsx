// Un champ de date et d'heure : un champ date et, à sa droite, un champ heure facultatif (`datetime-local` n'admet pas d'heure vide). Les
// valeurs sont « 2026-12-05 » et « 20:30 », à l'heure de l'écran ; le vide veut dire « pas de date », « pas d'heure ». Avec `onCommit`,
// chacun se valide en perdant le focus.

import { useId } from "react";

type DateTimeFieldProps = {
  label: string;
  timeLabel: string; // le nom accessible du champ heure
  date: string;
  time: string;
  onDate: (value: string) => void;
  onTime: (value: string) => void;
  isDisabled?: boolean;
  onCommit?: () => void;
};

export const DateTimeField = ({
  label,
  timeLabel,
  date,
  time,
  onDate,
  onTime,
  isDisabled = false,
  onCommit,
}: DateTimeFieldProps) => {
  const id = useId();
  return (
    <div className="lp-field">
      <label className="lp-type-body" htmlFor={id}>
        {label}
      </label>
      <div className="lp-field-pair">
        <input
          id={id}
          className="lp-input lp-input--date lp-type-body"
          type="date"
          value={date}
          disabled={isDisabled}
          autoComplete="off"
          onChange={(event) => onDate(event.target.value)}
          onBlur={onCommit}
        />
        <input
          className="lp-input lp-input--date lp-input--time lp-type-body"
          type="time"
          aria-label={timeLabel}
          value={time}
          disabled={isDisabled}
          autoComplete="off"
          onChange={(event) => onTime(event.target.value)}
          onBlur={onCommit}
        />
      </div>
    </div>
  );
};
