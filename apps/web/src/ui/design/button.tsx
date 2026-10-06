// Le bouton : un texte pour une décision, une icône seule pour une action secondaire (CDC 2026, Pill).

import type { ComponentType, MouseEvent } from "react";
import { classNames } from "./class-names";

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
  };

// Rendre le focus après un clic de souris : sinon Espace et Entrée recliqueraient le bouton au lieu de tracer ou de valider.
// Au clavier (`detail` à 0), le focus reste où il est.
export const blurAfterClick = (onPress: () => void) => (event: MouseEvent<HTMLButtonElement>) => {
  if (event.detail > 0) event.currentTarget.blur();
  onPress();
};

export const Button = (props: ButtonProps) => {
  const { label, title, icon: Icon, kbd, variant, isPressed, isExpanded, isDisabled } = props;
  const className = classNames(
    "lp-btn lp-type-body",
    variant && `lp-btn--${variant}`,
    !label && "lp-btn--icon",
  );
  const content = (
    <>
      {Icon && <Icon aria-hidden="true" />}
      {label && <span>{label}</span>}
      {kbd && (
        <span className="lp-kbd lp-type-kbd" aria-hidden="true">
          {kbd}
        </span>
      )}
    </>
  );
  const accessibleName = label ? undefined : title;

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
