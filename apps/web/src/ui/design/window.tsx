// La fenêtre (CDC 2026) : un seul menu flottant, une barre latérale et un contenu, par-dessus toute l'interface.
// Sur un `<dialog>` natif : l'arrière devient inerte, Échap ferme, le focus revient au bouton d'origine, `::backdrop` est le voile.

import type { LucideIcon } from "lucide-react";
import { X } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { Button, blurAfterClick } from "./button";

export type WindowSection<Id extends string> = { id: Id; label: string; icon: LucideIcon };

type WindowProps<Id extends string> = {
  isOpen: boolean;
  sections: readonly WindowSection<Id>[]; // selon le rôle, ouvertes directement sur la bonne
  sectionId: Id;
  onSelect: (id: Id) => void;
  onClose: () => void;
  children: ReactNode; // le contenu de la section ouverte
};

export const Window = <Id extends string>({
  isOpen,
  sections,
  sectionId,
  onSelect,
  onClose,
  children,
}: WindowProps<Id>) => {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (isOpen && !element.open) element.showModal();
    if (!isOpen && element.open) element.close();
  }, [isOpen]);

  const current = sections.find(({ id }) => id === sectionId) ?? sections[0];
  // Le voile ne ferme pas la fenêtre : seuls Échap et le bouton Fermer le font (le `<dialog>` émet alors `close`).
  return (
    <dialog ref={dialog} className="lp-pill lp-window" aria-labelledby="lp-window-title" onClose={onClose}>
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
