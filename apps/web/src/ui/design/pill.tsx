// La seule bulle d'interface (CDC 2026) : la taille suit le contenu, ronde et concentrique à toute taille.

import type { ReactNode } from "react";
import { classNames } from "./class-names";

// Le bord où la pill flotte : haut gauche, haut droite, centre droite, bas droite, bas centre.
export type PillDock = "tl" | "tr" | "cr" | "br" | "bc";

// `row` : une ligne. `stack` : des lignes empilées. `rail` : une colonne large d'un seul contrôle.
export type PillLayout = "row" | "stack" | "rail";

// Verrouillée pendant l'envoi, floutée pendant la connexion (CDC 2026, pill Dessin seulement).
export type PillState = { kind: "locked" } | { kind: "reconnecting"; label: string };

type PillProps = {
  dock?: PillDock; // absente : posée sur place, comme sur /design
  layout?: PillLayout;
  state?: PillState;
  isVisible?: boolean;
  children: ReactNode;
};

const LAYOUT_CLASSES: Record<PillLayout, { pill?: string; content?: string }> = {
  row: {},
  stack: { content: "lp-col" },
  rail: { pill: "lp-pill--v" },
};

export const Pill = ({ dock, layout = "row", state, isVisible = true, children }: PillProps) => {
  const pill = (
    <div
      className={classNames(
        "lp-pill",
        LAYOUT_CLASSES[layout].pill,
        state && `is-${state.kind}`,
        !isVisible && "is-hidden",
      )}
      inert={!isVisible}
    >
      <div className={classNames("lp-pill-content", LAYOUT_CLASSES[layout].content)} inert={Boolean(state)}>
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
