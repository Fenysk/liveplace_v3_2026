// Une étiquette courte à côté d'un nom (JOURNAL 2026-09-27) : d'où vient un modérateur ou un ban.

import type { ButtonIcon } from "./button";
import { classNames } from "./class-names";

// `live` : aux teintes du live Twitch (Écart §5.1, JOURNAL 2026-10-08), pour un canvas dont le streamer l'est.
export type BadgeTone = "live";

// `title` : la phrase entière, en infobulle, quand l'étiquette l'abrège.
type BadgeProps = {
  label: string;
  icon?: ButtonIcon | undefined;
  title?: string | undefined;
  tone?: BadgeTone | undefined;
};

export const Badge = ({ label, icon: Icon, title, tone }: BadgeProps) => (
  <span className={classNames("lp-badge lp-type-caption", tone && `lp-badge--${tone}`)} title={title}>
    {Icon && <Icon aria-hidden="true" />}
    {label}
  </span>
);
