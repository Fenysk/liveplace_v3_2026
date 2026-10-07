// La seule bulle d'interface (CDC 2026) : la taille suit le contenu, ronde et concentrique à toute taille.

import { type ReactNode, type RefObject, useEffect } from "react";
import { BOTTOM_BAR_HEIGHT } from "./bottom-bar";
import { classNames } from "./class-names";
import { THEME_BAR_HEIGHT, TOP_LEFT_WIDTH, TOP_RIGHT_WIDTH } from "./top-bar";
import { useMorph } from "./use-morph";

// Le bord où la pill flotte : haut gauche, haut centre, haut droite, centre gauche, centre droite, bas droite, bas
// centre. `toast` : en bas à gauche, là où aucune pill ne vit, et en haut au centre sur mobile, sous la pill Thème quand
// elle y est (CDC 2026, Toasts).
export type PillDock = "tl" | "tc" | "tr" | "cl" | "cr" | "br" | "bc" | "toast";

// `row` : une ligne. `stack` : des lignes empilées. `rail` : une colonne large d'un seul contrôle. `title` : des lignes de
// texte que la pill coupe plutôt que d'élargir (la pill Thème, Écart §8.1, JOURNAL 2026-10-07).
export type PillLayout = "row" | "stack" | "rail" | "title";

// Verrouillée pendant l'envoi, floutée pendant la connexion (CDC 2026, pill Dessin seulement).
export type PillState = { kind: "locked" } | { kind: "reconnecting"; label: string };

type PillProps = {
  dock?: PillDock | undefined; // absente : posée sur place, comme sur /design
  layout?: PillLayout | undefined;
  state?: PillState | undefined;
  isVisible?: boolean;
  children: ReactNode;
};

const LAYOUT_CLASSES: Record<PillLayout, { pill?: string; content?: string }> = {
  row: {},
  stack: { content: "lp-col" },
  rail: { pill: "lp-pill--v" },
  title: { pill: "lp-pill--title", content: "lp-col" },
};

// Ce qu'une pill publie sur <html> de sa taille mesurée, tant qu'elle est visible, pour que d'autres s'y posent (pill.css) :
// la barre du bas, sa hauteur ; les pills du haut, leur largeur ; la pill Thème, sa hauteur.
type PublishedSize = { variable: string; axis: "width" | "height" };

const PUBLISHED_SIZES: Partial<Record<PillDock, PublishedSize>> = {
  bc: { variable: BOTTOM_BAR_HEIGHT, axis: "height" },
  tl: { variable: TOP_LEFT_WIDTH, axis: "width" },
  tc: { variable: THEME_BAR_HEIGHT, axis: "height" },
  tr: { variable: TOP_RIGHT_WIDTH, axis: "width" },
};

// Mesurée sur le contenu, pas sur la pill, que le morphing anime. Sur mobile, l'inspection et Recentrer se posent au-dessus
// de la barre du bas, à sa hauteur du moment (pill.css).
const usePublishedSize = (
  content: RefObject<HTMLElement | null>,
  size: PublishedSize | undefined,
  isPublished: boolean,
) => {
  useEffect(() => {
    const element = content.current;
    if (!size || !isPublished || !element) return;
    const root = document.documentElement;
    const observer = new ResizeObserver(() =>
      root.style.setProperty(
        size.variable,
        `${size.axis === "width" ? element.offsetWidth : element.offsetHeight}px`,
      ),
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.style.removeProperty(size.variable);
    };
  }, [content, size, isPublished]);
};

export const Pill = ({ dock, layout = "row", state, isVisible = true, children }: PillProps) => {
  const morph = useMorph<HTMLDivElement, HTMLDivElement>();
  usePublishedSize(morph.content, dock && PUBLISHED_SIZES[dock], isVisible);
  const pill = (
    <div
      ref={morph.pill}
      className={classNames(
        "lp-pill",
        LAYOUT_CLASSES[layout].pill,
        state && `is-${state.kind}`,
        !isVisible && "is-hidden",
      )}
      inert={!isVisible}
    >
      <div
        ref={morph.content}
        className={classNames("lp-pill-content", LAYOUT_CLASSES[layout].content)}
        inert={Boolean(state)}
      >
        {children}
      </div>
      {state?.kind === "reconnecting" && (
        <div className="lp-reco lp-type-body" role="status">
          {state.label}
          {/* La seule boucle de l'interface : trois points qui apparaissent l'un après l'autre. */}
          <span className="lp-reco-wait" aria-hidden="true">
            <i>.</i>
            <i>.</i>
            <i>.</i>
          </span>
        </div>
      )}
    </div>
  );
  return dock ? (
    <div className="lp-floating" data-dock={dock}>
      {pill}
    </div>
  ) : (
    pill
  );
};

// Un trait fin entre deux groupes de contrôles, qui suit l'axe de la pill.
export const PillSeparator = () => <span className="lp-sep" aria-hidden="true" />;

// Un message seul au centre de l'écran, dans une pill : la page d'accueil, un canvas introuvable, une page à venir.
type NoticePillProps = { title: string; children?: ReactNode };

export const NoticePill = ({ title, children }: NoticePillProps) => (
  <div className="lp-notice">
    <Pill layout="stack">
      <h1 className="lp-type-title lp-prompt">{title}</h1>
      {children}
    </Pill>
  </div>
);
