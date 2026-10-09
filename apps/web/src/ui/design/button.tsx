// Le bouton : un texte pour une décision, une icône seule pour une action secondaire (CDC 2026, Pill).

import type { ComponentType, MouseEvent } from "react";
import { classNames } from "./class-names";
import { useLabelMorph } from "./use-label-morph";

// `twitch` : aux couleurs de Twitch, pour Se connecter seulement (SignInButton).
export type ButtonVariant = "primary" | "danger" | "ghost" | "twitch";

// Une icône Lucide, ou le logo Twitch : le bouton la rend muette, son texte ou son titre la nomme.
export type ButtonIcon = ComponentType<{ "aria-hidden"?: "true" }>;

// Sans libellé, le bouton n'a que son icône : `title` devient son nom accessible, il est donc obligatoire.
type ButtonText = { label: string; title?: string } | { label?: never; title: string };

// Un lien (Se connecter, une chaîne Twitch) ou une action. Un lien peut prévenir de son clic : il part quand même.
type ButtonAction =
  | { href: string; isNewTab?: boolean; onPress?: () => void }
  | { onPress: () => void; href?: never; isNewTab?: never };

export type ButtonProps = ButtonText &
  ButtonAction & {
    icon?: ButtonIcon;
    kbd?: string; // le raccourci, écrit dans le bouton, masqué au doigt
    variant?: ButtonVariant;
    isPressed?: boolean; // un outil armé : gomme, tracé
    isExpanded?: boolean; // un contrôle qui replie ou déplie ce qu'il commande
    isDisabled?: boolean;
    hasDot?: boolean; // quelque chose attend : le point rouge de l'avatar (profile.css), dans l'angle du bouton
    hasMorphingLabel?: boolean; // son libellé change : la largeur glisse, le texte passe en fondu (use-label-morph.ts)
    labelLead?: string; // un mot devant le libellé (« Attendre » devant « 12 s »), qui cède quand la place manque (button.css)
  };

// Rendre le focus après un clic de souris : sinon Espace et Entrée recliqueraient le bouton au lieu de tracer ou de valider.
// Au clavier (`detail` à 0), le focus reste où il est.
export const blurAfterClick = (onPress: () => void) => (event: MouseEvent<HTMLButtonElement>) => {
  if (event.detail > 0) event.currentTarget.blur();
  onPress();
};

// Le mot de devant est masqué sur un écran étroit : le nom accessible garde le tout.
const ButtonLabel = ({ label, lead }: { label: string; lead: string }) => (
  <span>
    {lead && <span className="lp-btn-lead">{lead}</span>}
    {label}
  </span>
);

const labelParts = ({ label, labelLead = "", title }: ButtonProps) => {
  const whole = label === undefined ? undefined : `${labelLead}${label}`;
  return { lead: labelLead, whole, accessibleName: label ? (labelLead ? whole : undefined) : title };
};

export const Button = (props: ButtonProps) => {
  const { label, title, icon: Icon, kbd, variant, isPressed, isExpanded, isDisabled, hasDot } = props;
  const { lead, whole, accessibleName } = labelParts(props);
  const hasMorphingLabel = props.hasMorphingLabel ?? false;
  const morphingButton = useLabelMorph(whole, hasMorphingLabel);
  const className = classNames(
    "lp-btn lp-type-body",
    variant && `lp-btn--${variant}`,
    !label && "lp-btn--icon",
    hasDot && "lp-btn--dot",
    hasMorphingLabel && "lp-btn--morph",
  );
  const content = (
    <>
      {Icon && <Icon aria-hidden="true" />}
      {label && <ButtonLabel label={label} lead={lead} />}
      {kbd && (
        <span className="lp-kbd lp-type-kbd" aria-hidden="true">
          {kbd}
        </span>
      )}
      {hasDot && <span className="lp-avatar-dot" aria-hidden="true" />}
    </>
  );

  if (props.href !== undefined)
    return (
      <a
        className={className}
        href={props.href}
        title={title}
        aria-label={accessibleName}
        onClick={props.onPress}
        {...(props.isNewTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {content}
      </a>
    );
  return (
    <button
      ref={morphingButton}
      type="button"
      className={className}
      title={title}
      aria-label={accessibleName}
      aria-pressed={isPressed}
      aria-expanded={isExpanded}
      disabled={isDisabled}
      onClick={blurAfterClick(props.onPress)}
    >
      {content}
    </button>
  );
};
