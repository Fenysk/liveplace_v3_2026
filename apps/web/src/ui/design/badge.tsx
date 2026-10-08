// Une étiquette courte à côté d'un nom (JOURNAL 2026-09-27) : d'où vient un modérateur ou un ban.

import type { ButtonIcon } from "./button";

// `title` : la phrase entière, en infobulle, quand l'étiquette l'abrège.
type BadgeProps = { label: string; icon?: ButtonIcon | undefined; title?: string | undefined };

export const Badge = ({ label, icon: Icon, title }: BadgeProps) => (
  <span className="lp-badge lp-type-caption" title={title}>
    {Icon && <Icon aria-hidden="true" />}
    {label}
  </span>
);
