// La section Événement Streamlabs Charity de Menu > Fresque (CDC 2026, Mode événement), pour le streamer : un interrupteur à droite du
// titre, l'état dessous, puis le titre, la page de dons (facultative), le début et la fin (facultative), chacun avec une heure facultative. Chaque champ s'enregistre en perdant le focus.
// L'affichage seul, nourri par `useCharityEvent`.

import { CHARITY_TITLE_MAX_LENGTH } from "@liveplace/domain/charity-event";
import { Checkbox } from "../design/checkbox";
import { DateTimeField } from "../design/date-time-field";
import { Switch } from "../design/switch";
import { TextField } from "../design/text-field";
import { useTexts } from "../locale/use-locale";
import { CHARITY_TEXTS } from "./charity-texts";

// Les champs du formulaire : le titre et l'adresse tels qu'écrits, puis pour chaque borne le texte d'un champ date et d'un champ heure.
export type CharityFields = {
  title: string;
  address: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
};

export type CharitySectionProps = {
  isEnabled: boolean;
  isEventOnly: boolean;
  statusLine: { text: string; isDanger: boolean };
  fields: CharityFields;
  failure: { text: string } | null;
  onInput: (field: keyof CharityFields, value: string) => void;
  onCommit: () => void;
  onToggle: (isEnabled: boolean) => void;
  onToggleEventOnly: (isEventOnly: boolean) => void;
};

export const CharitySection = ({
  isEnabled,
  isEventOnly,
  statusLine,
  fields,
  failure,
  onInput,
  onCommit,
  onToggle,
  onToggleEventOnly,
}: CharitySectionProps) => {
  const t = useTexts(CHARITY_TEXTS);
  return (
    <>
      <div className="lp-window-row">
        <h3 className="lp-type-title lp-window-subhead">{t.title}</h3>
        <Switch label={t.title} isOn={isEnabled} onLabel={t.on} offLabel={t.off} onToggle={onToggle} />
      </div>
      <p className={`lp-type-caption ${statusLine.isDanger ? "lp-danger" : "lp-muted"}`}>{statusLine.text}</p>
      <div className="lp-setting">
        <TextField
          label={t.eventTitle}
          value={fields.title}
          maxLength={CHARITY_TITLE_MAX_LENGTH}
          onInput={(value) => onInput("title", value)}
          onCommit={onCommit}
        />
      </div>
      <div className="lp-setting">
        <TextField
          label={t.address}
          value={fields.address}
          onInput={(value) => onInput("address", value)}
          onCommit={onCommit}
        />
      </div>
      <div className="lp-setting">
        <DateTimeField
          label={t.startsAt}
          timeLabel={t.startTime}
          date={fields.startDate}
          time={fields.startTime}
          onDate={(value) => onInput("startDate", value)}
          onTime={(value) => onInput("startTime", value)}
          onCommit={onCommit}
        />
        <DateTimeField
          label={t.endsAt}
          timeLabel={t.endTime}
          date={fields.endDate}
          time={fields.endTime}
          onDate={(value) => onInput("endDate", value)}
          onTime={(value) => onInput("endTime", value)}
          onCommit={onCommit}
        />
        <p className="lp-type-caption lp-muted">{t.timeNote}</p>
      </div>
      <div className="lp-setting">
        <Checkbox label={t.eventOnly} isChecked={isEventOnly} onToggle={onToggleEventOnly} />
        <p className="lp-type-caption lp-muted">{t.eventOnlyNote}</p>
      </div>
      {failure && <p className="lp-type-caption lp-danger">{failure.text}</p>}
    </>
  );
};
