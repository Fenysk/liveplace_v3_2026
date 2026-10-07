// Le gabarit d'une entrée de /design : son en-tête, des blocs, et dans chaque bloc une ligne par état.

import { MapPin } from "lucide-react";
import { Children, type ReactNode, useState } from "react";
import { Badge } from "../design/badge";
import { Button } from "../design/button";
import { DESIGN_CHAPTERS, DESIGN_ENTRIES, type EntrySlug } from "./design-entries";

type EntryProps = {
  slug: EntrySlug;
  components?: readonly string[]; // les composants montrés, sans les chevrons
  file: string;
  note?: string;
  where?: string; // la place sur l'écran de jeu, quand la note en dit une
  children: ReactNode;
};

export const Entry = ({ slug, components = [], file, note, where, children }: EntryProps) => {
  const entry = DESIGN_ENTRIES.find((candidate) => candidate.slug === slug);
  const chapter = DESIGN_CHAPTERS.find(({ id }) => id === entry?.chapterId);
  const code = [components.map((name) => `<${name}>`).join(" "), file].filter(Boolean).join(" · ");
  return (
    <article className="design-entry">
      <header className="design-entry-head">
        <p className="design-crumb lp-type-caption lp-muted">{chapter?.title}</p>
        <h1 className="design-entry-title lp-type-heading">{entry?.title}</h1>
        <p className="design-code lp-type-caption lp-muted">{code}</p>
        {note && <p className="design-note lp-type-body">{note}</p>}
        {where && (
          <p className="design-where lp-type-caption">
            <MapPin aria-hidden="true" />
            {where}
          </p>
        )}
      </header>
      {children}
    </article>
  );
};

// Ce que disent toutes les petites fenêtres : la note de chacune de leurs entrées.
export const DIALOG_NOTE = "Échap ou Annuler les ferment ; verrouillées pendant l'action.";

// Le nombre d'états d'un bloc, compté sur ses lignes. Un bloc de mesures ou de couleurs n'en montre pas.
const stateCount = (count: number): string => `${count} ${count > 1 ? "états" : "état"}`;

type StateBlockProps = { title: string; note?: string | undefined; hasCount?: boolean; children: ReactNode };

export const Block = ({ title, note, hasCount = true, children }: StateBlockProps) => (
  <section className="design-block">
    <h2 className="design-block-title lp-type-heading">
      {title}
      {hasCount && (
        <span className="lp-type-caption lp-muted">{stateCount(Children.toArray(children).length)}</span>
      )}
    </h2>
    {note && <p className="design-block-note lp-type-caption lp-muted">{note}</p>}
    <div className="design-states">{children}</div>
  </section>
);

type StateRowProps = { name: string; detail?: string | undefined; isDemo?: boolean; children: ReactNode };

// Le nom court de l'état et son détail à gauche, l'exemple sur le vide à droite.
export const StateRow = ({ name, detail, isDemo = false, children }: StateRowProps) => (
  <div className="design-state">
    <div className="design-state-label">
      <p className="design-state-name lp-type-title">
        {name}
        {isDemo && <Badge label="À manipuler" />}
      </p>
      {detail && <p className="lp-type-caption lp-muted">{detail}</p>}
    </div>
    <div className="design-stage">{children}</div>
  </div>
);

// Des lignes sous filet, sur le fond de la page : les fondations n'ont pas de scène.
export const Lines = ({ children }: { children: ReactNode }) => (
  <div className="design-lines">{children}</div>
);

// Le message seul occupe tout l'écran dans le jeu : ici, sa taille à lui.
export const InNotice = ({ children }: { children: ReactNode }) => (
  <div className="design-in-notice">{children}</div>
);

// L'endroit où le composant vit dans le jeu : le contenu d'une fenêtre, d'une petite fenêtre, ou la largeur d'un
// téléphone. Une fenêtre est une pill : son contenu a sa surface, jamais le vide.
export const InWindow = ({ children }: { children: ReactNode }) => (
  <div className="lp-pill design-in-window">{children}</div>
);

export const InSmallWindow = ({ children }: { children: ReactNode }) => (
  <div className="lp-pill design-in-small-window">{children}</div>
);

// La grande fenêtre (celle du développeur) : assez large pour mettre deux colonnes côte à côte.
export const InLargeWindow = ({ children }: { children: ReactNode }) => (
  <div className="lp-pill design-in-large-window">{children}</div>
);

// Un téléphone, moins ses marges. `isWindow` : le contenu d'une fenêtre, tel que `@media (max-width: 640px)` le met en page.
export const InPhone = ({ isWindow = false, children }: { isWindow?: boolean; children: ReactNode }) => (
  <div className={isWindow ? "lp-pill design-in-phone design-in-phone--window" : "design-in-phone"}>
    {children}
  </div>
);

// L'heure de la page : les exemples datent d'« il y a trois heures » par rapport à elle, et elle ne bouge pas.
export const useNowMs = (): number => useState(() => Date.now())[0];

// Une valeur que l'exemple change lui-même : le composant est contrôlé, comme dans le jeu.
export const WithValue = <Value,>({
  initial,
  children,
}: {
  initial: Value;
  children: (value: Value, setValue: (value: Value) => void) => ReactNode;
}) => {
  const [value, setValue] = useState(initial);
  return children(value, setValue);
};

type WindowOpening = { isOpen: boolean; close: () => void };

type OpenWindowProps = {
  label?: string;
  onOpen?: () => void;
  children: (opening: WindowOpening) => ReactNode;
};

// Le bouton secondaire qui ouvre la fenêtre de la ligne, puis la fenêtre elle-même.
export const OpenWindow = ({ label = "Ouvrir la fenêtre", onOpen, children }: OpenWindowProps) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <Button
        label={label}
        onPress={() => {
          onOpen?.();
          setIsOpen(true);
        }}
      />
      {children({ isOpen, close: () => setIsOpen(false) })}
    </>
  );
};
