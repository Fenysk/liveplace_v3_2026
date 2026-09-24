// La fenêtre (CDC 2026) : un seul menu flottant, une barre latérale et un contenu, par-dessus toute l'interface.
// Sur un `<dialog>` natif : l'arrière devient inerte, le focus revient au bouton d'origine, `::backdrop` est le voile.

import type { LucideIcon } from "lucide-react";
import { X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button, blurAfterClick } from "./button";
import { classNames } from "./class-names";
import { Grabber } from "./grabber";
import { motionMs } from "./motion";

export type WindowSection<Id extends string> = { id: Id; label: string; icon: LucideIcon };

type WindowProps<Id extends string> = {
  isOpen: boolean;
  sections: readonly WindowSection<Id>[]; // selon le rôle, ouvertes directement sur la bonne
  sectionId: Id;
  onSelect: (id: Id) => void;
  onClose: () => void;
  children: ReactNode; // le contenu de la section ouverte
};

// Ouvrir : `showModal()`, l'état fermé calculé une fois, puis `is-open`, pour que la transition parte de lui.
// Fermer : retirer `is-open`, laisser la transition finir, puis `close()`. Sans CSS `display` ni `overlay` animés :
// tous les navigateurs ne les ont pas encore (la maquette fait de même).
const useWindowMotion = (isOpen: boolean) => {
  const dialog = useRef<HTMLDialogElement>(null);
  const [isShown, setIsShown] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (isOpen) {
      if (!element.open) element.showModal();
      element.getBoundingClientRect();
      setIsShown(true);
      return;
    }
    setIsShown(false);
    if (!element.open) return;
    const timer = setTimeout(() => element.close(), motionMs(element, "--lp-dur"));
    return () => clearTimeout(timer);
  }, [isOpen]);
  return { dialog, isShown };
};

const doNothing = (): void => undefined;

export const Window = <Id extends string>({
  isOpen,
  sections,
  sectionId,
  onSelect,
  onClose,
  children,
}: WindowProps<Id>) => {
  const { dialog, isShown } = useWindowMotion(isOpen);
  const current = sections.find(({ id }) => id === sectionId) ?? sections[0];
  // Le voile ne ferme pas la fenêtre : seuls Échap et le bouton Fermer le font, en passant par l'animation.
  return (
    <dialog
      ref={dialog}
      className={classNames("lp-pill lp-window", isShown && "is-open")}
      aria-labelledby="lp-window-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
    >
      {/* Sur mobile, la fenêtre est une feuille : la glisser vers le bas la ferme. */}
      <div className="lp-window-grabber">
        <Grabber label="Fermer" onUp={doNothing} onDown={onClose} onTap={doNothing} />
      </div>
      <nav className="lp-window-nav" aria-label="Sections">
        <ul>
          {sections.map(({ id, label, icon: Icon }) => (
            <li key={id}>
              <button
                type="button"
                className="lp-btn lp-type-body"
                aria-current={id === current?.id ? "page" : undefined}
                onClick={blurAfterClick(() => onSelect(id))}
              >
                <Icon aria-hidden="true" />
                {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <section className="lp-window-main">
        <header className="lp-window-head">
          <h2 id="lp-window-title" className="lp-type-heading">
            {current?.label}
          </h2>
          <Button icon={X} variant="ghost" title="Fermer (Échap)" onPress={onClose} />
        </header>
        <div className="lp-window-body">{children}</div>
      </section>
    </dialog>
  );
};

// Une ligne de la fenêtre : un libellé à gauche, sa valeur ou son contrôle à droite.
type WindowRowProps = { label: ReactNode; children: ReactNode };

export const WindowRow = ({ label, children }: WindowRowProps) => (
  <div className="lp-window-row lp-type-body">
    <span>{label}</span>
    {children}
  </div>
);
