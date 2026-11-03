// Un bouton de pill dessiné pour une vignette : les classes de Button, sans en être un (la vignette est déjà un bouton, et un bouton
// n'en contient pas d'autre). Muet pour un lecteur d'écran : la vignette porte le nom. `tap` : son nom pour l'appui que la souris lui
// donne (`setTaps`).

import type { ButtonIcon, ButtonVariant } from "../design/button";
import { classNames } from "../design/class-names";

type PillToolProps = { icon: ButtonIcon; className?: string; hasDot?: boolean; tap?: string };

export const PillTool = ({ icon: Icon, className, hasDot = false, tap }: PillToolProps) => (
  <span
    className={classNames("lp-btn lp-btn--ghost lp-btn--icon", hasDot && "lp-btn--dot", className)}
    data-tap={tap}
    aria-hidden="true"
  >
    <Icon />
    {hasDot && <span className="lp-release-dot" />}
  </span>
);

type PillButtonProps = {
  label: string;
  icon?: ButtonIcon; // une icône Lucide, ou le logo Twitch de Se connecter
  variant?: Exclude<ButtonVariant, "ghost">;
  className?: string;
  tap?: string;
};

// Un bouton avec son libellé, comme « Signaler », « Effacer » ou « Se connecter ».
export const PillButton = ({ label, icon: Icon, variant, className, tap }: PillButtonProps) => (
  <span
    className={classNames("lp-btn lp-type-body", variant && `lp-btn--${variant}`, className)}
    data-tap={tap}
    aria-hidden="true"
  >
    {Icon && <Icon />}
    {label}
  </span>
);
