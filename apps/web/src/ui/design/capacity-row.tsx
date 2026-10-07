// Les ressources de la section Capacité (Écart §4.3, JOURNAL 2026-10-07), en lignes simples comme celles des autres sections
// de la fenêtre (le motif de `WindowRow`), rangées par maillon : le nom et une légende à gauche, la valeur et son plafond, une
// fine barre du taux, puis le taux en couleur. Sans nouvelles ou non mesurée, la ligne le dit à la place de la valeur.

import type { ReactNode } from "react";
import { type CapacityTone, TONE_CLASSES } from "./capacity-tone";
import { classNames } from "./class-names";

// La barre est un `<meter>` natif : sa largeur n'est jamais un `style` que la CSP de production bloquerait dans le HTML du serveur.
export type CapacityRowState =
  | { kind: "measured"; value: string; percent: number; rate: string; tone: Exclude<CapacityTone, "neutral"> }
  | { kind: "withoutNews" }
  | { kind: "unmeasured" };

type CapacityRowProps = {
  name: string;
  note?: string | undefined; // « projection fin octobre », « plein le 15/10 »
  state: CapacityRowState;
};

const MISSING_TEXTS = { withoutNews: "sans nouvelles", unmeasured: "non mesuré" } as const;

export const CapacityRow = ({ name, note, state }: CapacityRowProps) => (
  <li
    className={classNames(
      "lp-window-row lp-capacity-row lp-type-body",
      state.kind === "measured" && `is-${state.tone}`,
    )}
  >
    <span className="lp-capacity-name">
      <span>{name}</span>
      {note && <span className="lp-type-caption lp-muted">{note}</span>}
    </span>
    {state.kind === "measured" ? (
      <>
        <span className="lp-capacity-value">{state.value}</span>
        <meter
          className="lp-capacity-meter"
          min={0}
          max={100}
          value={Math.min(100, state.percent)}
          aria-hidden="true"
        />
        <span className={classNames("lp-capacity-rate lp-type-title", TONE_CLASSES[state.tone])}>
          {state.rate}
        </span>
      </>
    ) : (
      <span
        className={classNames(
          "lp-capacity-missing",
          state.kind === "withoutNews" ? "lp-warning" : "lp-muted",
        )}
      >
        {MISSING_TEXTS[state.kind]}
      </span>
    )}
  </li>
);

type CapacityLinkRowsProps = {
  title: string; // le maillon : Redis, Gateway, Web, VPS, Convex
  detail?: string | undefined; // Convex : ses déploiements et son plan
  children: ReactNode; // des `CapacityRow`
};

export const CapacityLinkRows = ({ title, detail, children }: CapacityLinkRowsProps) => (
  <section className="lp-capacity-link">
    <h3 className="lp-capacity-link-head lp-type-caption">
      <span>{title}</span>
      {detail && <span className="lp-muted"> · {detail}</span>}
    </h3>
    <ul className="lp-capacity-rows">{children}</ul>
  </section>
);
