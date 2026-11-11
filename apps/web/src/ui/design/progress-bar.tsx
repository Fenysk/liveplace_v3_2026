// La barre de progression (JOURNAL 2026-11-11) : un `<progress>` natif, habillé par les tokens. Sans `value`, elle ne dit pas où
// elle en est (la lecture de l'historique) ; `label` est son nom pour les lecteurs d'écran.

type ProgressBarProps = { label: string; value?: number; max?: number };

export const ProgressBar = ({ label, value, max = 1 }: ProgressBarProps) => (
  <progress
    className="lp-progress"
    aria-label={label}
    max={max}
    {...(value === undefined ? {} : { value })}
  />
);
