// La pastille (JOURNAL 2026-11-04) : un élément d'interface cité dans une phrase, tel qu'on le lit sur le vrai bouton. Plate, jamais
// cliquable ni focusable : ce n'est ni un lien ni un bouton, seulement son nom, avec l'icône et la couleur du bouton s'il en a.

import type { ButtonIcon } from "./button";
import { classNames } from "./class-names";

// `neutral` : l'encre ; `danger` : le rouge de Supprimer mon compte ; `twitch` : le violet de Twitch, teinté comme le bouton live.
export type ChipTone = "neutral" | "danger" | "twitch";

type ChipProps = { label: string; icon?: ButtonIcon | undefined; tone?: ChipTone | undefined };

export const Chip = ({ label, icon: Icon, tone = "neutral" }: ChipProps) => (
  <span className={classNames("lp-chip", tone !== "neutral" && `lp-chip--${tone}`)}>
    {Icon && <Icon aria-hidden="true" />}
    {label}
  </span>
);
