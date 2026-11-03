// La vignette « Augmente ta jauge » : le +1 doré à côté de la jauge pleine (« 20/20 »). Une souris clique le +1 ; le tube grossit un
// instant et dit « 21/21 », le bouton redevient « Dessiner ». Puis un temps de repos, la pill s'efface en fondu, le +1 revient, et la
// boucle repart. L'image fixe : le +1 à côté de la jauge pleine, sans souris.

import { CLICK_HALF_MS, click, loopTime, spanIn, spanOut, tap } from "./motion-math";
import { type PointerMoment, type PointerSpot, pointerOpacity, spotAlong } from "./pointer-motion";

export const GAUGE_LOOP_MS = 8400;
export const GAUGE_RESTING_MS = 1000;

// La jauge avant la récompense, et après : pleine dans les deux cas, d'un pixel de plus.
export const GAUGE_BEFORE = 20;
export const GAUGE_AFTER = 21;

const POINTER_APPEARS_FROM_MS = 250;
const POINTER_APPEARS_TO_MS = 400;
export const CLAIM_CLICK_MS = 2200;
const GROW_MS = 700;
const FADE_OUT_FROM_MS = 7300;
const FADE_OUT_TO_MS = 7800;
const FADE_IN_TO_MS = 8200;

// Où la pointe se pose : le +1 est dans la pill, ancrée en bas au centre (unités de pill).
const START_SPOT: PointerSpot = { ax: 92, ay: 30, bx: 0, by: 0 };
export const CLAIM_SPOT: PointerSpot = { ax: 56, ay: 64, bx: 26.5, by: -9 };

const WAYPOINTS = [
  { atMs: POINTER_APPEARS_FROM_MS, spot: START_SPOT },
  { atMs: CLAIM_CLICK_MS - 150, spot: CLAIM_SPOT },
];

export type GaugeMoment = {
  isClaimed: boolean; // la jauge dit « 21/21 » et le bouton « Dessiner »
  grow: number; // le tube grossit puis revient, de 0 à 1 à 0
  claimTap: number; // l'appui sur le +1
  pill: number; // la pill, de 1 à 0 puis de 0 à 1 : elle s'efface, change d'état, et revient
  pointer: PointerMoment;
  press: number; // la souris qui s'enfonce au clic
};

// Le fondu de la pill : elle part avant la fin de la boucle, et revient dans son état de départ (+1 à réclamer) avant le premier clic.
const pillAt = (t: number): number =>
  t < FADE_OUT_TO_MS
    ? spanOut(t, FADE_OUT_FROM_MS, FADE_OUT_TO_MS)
    : spanIn(t, FADE_OUT_TO_MS, FADE_IN_TO_MS);

export const gaugeAt = (timeMs: number): GaugeMoment => {
  const t = loopTime(timeMs, GAUGE_LOOP_MS);
  const keep = spanOut(t, FADE_OUT_FROM_MS, FADE_OUT_TO_MS);
  const claimTap = click(t, CLAIM_CLICK_MS);
  return {
    isClaimed: t >= CLAIM_CLICK_MS + CLICK_HALF_MS && t < FADE_OUT_TO_MS,
    grow: tap(t, CLAIM_CLICK_MS + CLICK_HALF_MS, CLAIM_CLICK_MS + CLICK_HALF_MS + GROW_MS),
    claimTap,
    pill: pillAt(t),
    pointer: {
      ...spotAlong(WAYPOINTS, t),
      opacity: pointerOpacity(t, POINTER_APPEARS_FROM_MS, POINTER_APPEARS_TO_MS, keep),
    },
    press: claimTap,
  };
};
