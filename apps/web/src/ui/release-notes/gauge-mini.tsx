// La jauge de la pill Dessin en petit : l'anneau du prochain pixel et le tube, aux classes du jeu (gauge.css). Le nombre se donne en
// enfants. Pleine, l'anneau est entier ; sinon il recharge, à moitié fait, et le niveau du fluide est le `--lp-level` du jeu.

import type { ReactNode } from "react";

const RING_CENTER = 18;
const RING_RADIUS = 16;
// L'anneau en cours de recharge : l'attribut `pathLength` ramène sa longueur à 1, il en reste à faire cette part.
const RECHARGE_LEFT = 0.4;

type GaugeMiniProps = { children: ReactNode; isFull?: boolean };

export const GaugeMini = ({ children, isFull = true }: GaugeMiniProps) => (
  <span className={isFull ? "lp-gauge is-full" : "lp-gauge"}>
    <span className="lp-gauge-timer">
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <circle className="lp-gauge-track" cx={RING_CENTER} cy={RING_CENTER} r={RING_RADIUS} />
        <circle
          className="lp-gauge-ring"
          cx={RING_CENTER}
          cy={RING_CENTER}
          r={RING_RADIUS}
          {...(isFull ? {} : { pathLength: 1, strokeDasharray: 1, strokeDashoffset: RECHARGE_LEFT })}
        />
      </svg>
    </span>
    <span className="lp-gauge-tube">
      <span className="lp-fluid">
        <span className="lp-fluid-charge" />
      </span>
      {children}
    </span>
  </span>
);
