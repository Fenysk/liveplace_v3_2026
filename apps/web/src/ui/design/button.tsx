// Le bouton : un texte pour une décision, une icône seule pour une action secondaire (CDC 2026, Pill).

import type { ComponentType, MouseEvent } from "react";
import { classNames } from "./class-names";
import { useLabelMorph } from "./use-label-morph";

// `twitch` : aux couleurs de Twitch, pour Se connecter seulement (SignInButton). `support` : rose clair, pour Soutenir LivePlace
// seulement (SupportButton).
export type ButtonVariant = "primary" | "danger" | "ghost" | "twitch" | "support";

// Une icône Lucide, ou le logo Twitch : le bouton la rend muette, son texte ou son titre la nomme.
export type ButtonIcon = ComponentType<{ "aria-hidden"?: "true" }>;

// Sans libellé, le bouton n'a que son icône : `title` devient son nom accessible, il est donc obligatoire.
type ButtonText = { label: string; title?: string } | { label?: never; title: string };

// Un lien (Se connecter, une chaîne Twitch) ou une action. Un lien peut prévenir de son clic : il part quand même.
type ButtonAction =
  | { href: string; download?: string; isNewTab?: boolean; onPress?: () => void } // `download` : le nom du fichier qu'il enregistre
  | { onPress: () => void; href?: never; download?: never; isNewTab?: never };

export type ButtonProps = ButtonText &
  ButtonAction & {
    icon?: ButtonIcon;
    kbd?: string; // le raccourci, écrit dans le bouton, masqué au doigt
    variant?: ButtonVariant;
    isPressed?: boolean; // un outil armé : gomme, tracé
    isExpanded?: boolean; // un contrôle qui replie ou déplie ce qu'il commande
    isDisabled?: boolean;
    isInactive?: boolean; // grisé comme désactivé, mais le clic arrive : l'appelant dit pourquoi (un toast), `aria-disabled`
    hasDot?: boolean; // quelque chose attend : le point rouge de l'avatar (profile.css), dans l'angle du bouton
    hasMorphingLabel?: boolean; // son libellé change : la largeur glisse, le texte passe en fondu (use-label-morph.ts)
    labelLead?: string; // un mot devant le libellé (« Attendre » devant « 12 s »), qui cède quand la place manque (button.css)
    reservedLabel?: string; // le plus long libellé qu'il portera : sa largeur est gardée, un libellé plus court ne le rétrécit pas
  };

// Rendre le focus après un clic de souris : sinon Espace et Entrée recliqueraient le bouton au lieu de tracer ou de valider.
// Au clavier (`detail` à 0), le focus reste où il est.
export const blurAfterClick = (onPress: () => void) => (event: MouseEvent<HTMLButtonElement>) => {
  if (event.detail > 0) event.currentTarget.blur();
  onPress();
};

// Le mot de devant est masqué sur un écran étroit : le nom accessible garde le tout.
// Le libellé réservé s'écrit en invisible à côté du vrai (button.css) : le nom accessible dit le vrai seul.
const ButtonLabel = ({
  label,
  lead,
  reserve,
}: {
  label: string;
  lead: string;
  reserve: string | undefined;
}) => {
  const text = (
    <span>
      {lead && <span className="lp-btn-lead">{lead}</span>}
      {label}
    </span>
  );
  return reserve === undefined ? (
    text
  ) : (
    <span className="lp-btn-reserve" data-reserve={reserve}>
      {text}
    </span>
  );
};

const labelParts = ({ label, labelLead = "", reservedLabel, title }: ButtonProps) => {
  const whole = label === undefined ? undefined : `${labelLead}${label}`;
  const isNamedByLabel = !labelLead && reservedLabel === undefined;
  return { lead: labelLead, whole, accessibleName: label ? (isNamedByLabel ? undefined : whole) : title };
};

const classNameOf = (
  { label, variant, hasDot, isInactive }: ButtonProps,
  hasMorphingLabel: boolean,
): string =>
  classNames(
    "lp-btn lp-type-body",
    variant && `lp-btn--${variant}`,
    !label && "lp-btn--icon",
    hasDot && "lp-btn--dot",
    isInactive && "lp-btn--inactive",
    hasMorphingLabel && "lp-btn--morph",
  );

export const Button = (props: ButtonProps) => {
  const { label, title, icon: Icon, kbd, isPressed, isExpanded, isDisabled, isInactive, hasDot } = props;
  const { lead, whole, accessibleName } = labelParts(props);
  const hasMorphingLabel = props.hasMorphingLabel ?? false;
  const morphingButton = useLabelMorph(whole, hasMorphingLabel);
  const className = classNameOf(props, hasMorphingLabel);
  const content = (
    <>
      {Icon && <Icon aria-hidden="true" />}
      {label && <ButtonLabel label={label} lead={lead} reserve={props.reservedLabel} />}
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
        download={props.download}
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
      aria-disabled={isInactive ? true : undefined}
      onClick={blurAfterClick(props.onPress)}
    >
      {content}
    </button>
  );
};
