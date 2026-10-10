// La fenêtre (CDC 2026) : un seul menu flottant, une barre latérale et un contenu, par-dessus toute l'interface.
// La petite fenêtre (JOURNAL 2026-09-25) : la même, sans barre latérale, pour une question ou un avis.
// Sur un `<dialog>` natif : l'arrière devient inerte, le focus revient au bouton d'origine, `::backdrop` est le voile.

import type { LucideIcon } from "lucide-react";
import { X } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { useTexts } from "../locale/use-locale";
import { Button, blurAfterClick } from "./button";
import { classNames } from "./class-names";
import { DESIGN_TEXTS } from "./design-texts";
import { Grabber } from "./grabber";
import { motionMs } from "./motion";
import { ToastAnnouncement } from "./toast-announcement";
import { useSelectionGlide } from "./use-selection-glide";

export type WindowSection<Id extends string> = { id: Id; label: string; icon: LucideIcon };

// Une petite fenêtre garde sa dernière valeur non nulle pendant qu'elle se ferme : son contenu ne s'efface pas avant
// la fin de l'animation. Écrire le ref pendant le rendu (plutôt qu'un `useEffect`) évite un second rendu à chaque
// changement.
export const useShownWhileClosing = <T,>(value: T | null): T | null => {
  const lastShown = useRef<T | null>(null);
  if (value !== null) lastShown.current = value;
  return value ?? lastShown.current;
};

// Enveloppe un onglet : la cible d'une bulle d'aide (Écart §8.1, JOURNAL 2026-10-09).
type WrapTab<Id extends string> = (id: Id, tab: ReactNode) => ReactNode;

type WindowNavProps<Id extends string> = {
  sections: readonly WindowSection<Id>[];
  currentId: Id | undefined;
  onSelect: (id: Id) => void;
  wrapTab?: WrapTab<Id> | undefined;
};

// La barre latérale, ou la rangée d'onglets sur mobile : un bouton par section.
export const WindowNav = <Id extends string>({
  sections,
  currentId,
  onSelect,
  wrapTab,
}: WindowNavProps<Id>) => {
  const t = useTexts(DESIGN_TEXTS);
  const selection = useSelectionGlide<HTMLElement>();
  return (
    <nav ref={selection} className="lp-window-nav lp-selection" aria-label={t.sections}>
      <ul>
        {sections.map(({ id, label, icon: Icon }) => {
          const tab = (
            <button
              type="button"
              className={classNames("lp-btn lp-type-body", id === currentId && "is-selected")}
              aria-current={id === currentId ? "page" : undefined}
              onClick={blurAfterClick(() => onSelect(id))}
            >
              <Icon aria-hidden="true" />
              {label}
            </button>
          );
          return <li key={id}>{wrapTab ? wrapTab(id, tab) : tab}</li>;
        })}
      </ul>
    </nav>
  );
};

type WindowProps<Id extends string> = {
  isOpen: boolean;
  sections: readonly WindowSection<Id>[]; // selon le rôle, ouvertes directement sur la bonne
  sectionId: Id;
  onSelect: (id: Id) => void;
  onClose: () => void;
  isLarge?: boolean; // sur PC, jusqu'à 1 100 px de large et 90 % de la hauteur (JOURNAL 2026-10-07) ; mobile : la feuille
  wrapTab?: WrapTab<Id>;
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
      // `showModal()` donne le focus au premier contrôle, la poignée sur mobile : Safari y dessine l'anneau après un
      // toucher. La fenêtre le prend elle-même ; au clavier, Tab mène ensuite aux contrôles.
      element.focus({ preventScroll: true });
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

type WindowShellProps = {
  isOpen: boolean;
  onClose: () => void;
  titleId: string;
  isSmall?: boolean;
  isLarge?: boolean;
  isLocked?: boolean;
  children: ReactNode;
};

// Le voile ne ferme pas la fenêtre : seuls Échap et le bouton Fermer le font, en passant par l'animation.
const WindowShell = ({
  isOpen,
  onClose,
  titleId,
  isSmall = false,
  isLarge = false,
  isLocked = false,
  children,
}: WindowShellProps) => {
  const { dialog, isShown } = useWindowMotion(isOpen);
  const t = useTexts(DESIGN_TEXTS);
  return (
    <dialog
      ref={dialog}
      className={classNames(
        "lp-pill lp-window",
        isSmall && "lp-window--small",
        isLarge && "lp-window--large",
        isLocked && "is-locked",
        isShown && "is-open",
      )}
      tabIndex={-1}
      aria-labelledby={titleId}
      // React fait remonter `cancel` et `close` d'une petite fenêtre ouverte dedans (la taille du canvas) :
      // seuls les siens la ferment.
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        onClose();
      }}
      onClose={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {/* Sur mobile, la fenêtre est une feuille : la glisser vers le bas la ferme. */}
      <div className="lp-window-grabber">
        <Grabber label={t.close} onUp={doNothing} onDown={onClose} onTap={doNothing} />
      </div>
      {children}
      {/* La page est inerte sous une fenêtre modale, sa région de toast avec : la fenêtre redit le toast dans la sienne. */}
      <ToastAnnouncement />
    </dialog>
  );
};

type WindowHeadProps = { titleId: string; title: ReactNode; onClose: () => void };

const WindowHead = ({ titleId, title, onClose }: WindowHeadProps) => {
  const t = useTexts(DESIGN_TEXTS);
  return (
    <header className="lp-window-head">
      <h2 id={titleId} className="lp-type-heading">
        {title}
      </h2>
      <Button icon={X} variant="ghost" title={t.closeTip} onPress={onClose} />
    </header>
  );
};

export const Window = <Id extends string>({
  isOpen,
  sections,
  sectionId,
  onSelect,
  onClose,
  isLarge = false,
  wrapTab,
  children,
}: WindowProps<Id>) => {
  // Un identifiant par fenêtre : une petite fenêtre peut exister à côté (JOURNAL 2026-09-25).
  const titleId = useId();
  const current = sections.find(({ id }) => id === sectionId) ?? sections[0];
  return (
    <WindowShell isOpen={isOpen} onClose={onClose} titleId={titleId} isLarge={isLarge}>
      <WindowNav sections={sections} currentId={current?.id} onSelect={onSelect} wrapTab={wrapTab} />
      <section className="lp-window-main">
        <WindowHead titleId={titleId} title={current?.label} onClose={onClose} />
        <div className="lp-window-body">{children}</div>
      </section>
    </WindowShell>
  );
};

type SmallWindowProps = {
  isOpen: boolean;
  title: string;
  onClose: () => void; // Échap, Fermer, ou la poignée sur mobile
  isLocked?: boolean; // pendant l'action qu'elle a confirmée : grisée, et rien ne la ferme
  actions: ReactNode; // en bas, à droite
  children: ReactNode;
};

export const SmallWindow = ({
  isOpen,
  title,
  onClose,
  isLocked = false,
  actions,
  children,
}: SmallWindowProps) => {
  const titleId = useId();
  const close = isLocked ? doNothing : onClose;
  return (
    <WindowShell isOpen={isOpen} onClose={close} titleId={titleId} isSmall isLocked={isLocked}>
      <section className="lp-window-main">
        <WindowHead titleId={titleId} title={title} onClose={close} />
        <div className="lp-window-body">{children}</div>
        <footer className="lp-window-actions">{actions}</footer>
      </section>
    </WindowShell>
  );
};

// Une ligne de la fenêtre : un libellé à gauche, sa valeur ou son contrôle à droite.
// `hasProfile` : le libellé est un profil, dont le nom se coupe plutôt que de pousser les actions.
type WindowRowProps = { label: ReactNode; hasProfile?: boolean; children: ReactNode };

export const WindowRow = ({ label, hasProfile = false, children }: WindowRowProps) => (
  <div className={classNames("lp-window-row lp-type-body", hasProfile && "lp-window-row--profile")}>
    <span>{label}</span>
    {children}
  </div>
);
