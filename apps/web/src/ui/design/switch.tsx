// Un interrupteur : un réglage qui s'active et se désactive d'un clic, d'Espace ou d'Entrée. Un vrai `<button role="switch">`, dont
// `aria-checked` dit l'état ; son libellé d'état (« Activé » / « Désactivé »), à gauche de la piste, est donné par l'appelant, dans la
// langue de la page, et le lecteur d'écran n'entend que le nom du réglage et son état.

type SwitchProps = {
  label: string; // le nom du réglage, pour le lecteur d'écran
  isOn: boolean;
  onLabel: string; // « Activé »
  offLabel: string; // « Désactivé »
  onToggle: (isOn: boolean) => void;
  isDisabled?: boolean;
};

export const Switch = ({ label, isOn, onLabel, offLabel, onToggle, isDisabled = false }: SwitchProps) => (
  <button
    type="button"
    role="switch"
    className="lp-switch lp-type-body"
    aria-checked={isOn}
    aria-label={label}
    disabled={isDisabled}
    onClick={() => onToggle(!isOn)}
  >
    <span className="lp-switch-state" aria-hidden="true">
      {isOn ? onLabel : offLabel}
    </span>
    <span className="lp-switch-track" aria-hidden="true">
      <span className="lp-switch-thumb" />
    </span>
  </button>
);
