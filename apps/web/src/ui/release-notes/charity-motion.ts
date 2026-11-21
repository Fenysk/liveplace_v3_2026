// La vignette « Événement caritatif » : une mini-fresque, la pastille de l'événement en haut (cadre arc-en-ciel, « En cours ») et la pill
// Dessin dont la jauge n'est pas pleine. Une ligne de don s'ouvre sous la pastille avec son +50 doré ; la souris vient cliquer +50, la
// ligne se referme et la jauge monte. Tout s'efface en fondu, la boucle repart sans saut. L'image fixe : la ligne de don ouverte, sans souris.

import { click, lerp, loopTime, spanIn, spanOut } from "./motion-math";
import { type PointerMoment, type PointerSpot, pointerOpacity, spotAlong } from "./pointer-motion";

export const CHARITY_LOOP_MS = 7000;
export const CHARITY_RESTING_MS = 2000;

const PILLS_APPEAR_FROM_MS = 100;
const PILLS_APPEAR_TO_MS = 350;
const DONATION_FROM_MS = 900;
const DONATION_TO_MS = 1250;
const POINTER_APPEARS_FROM_MS = 1100;
const POINTER_APPEARS_TO_MS = 1300;
export const CLAIM_MS = 2400;
const POINTER_LEAVES_FROM_MS = 2600;
const POINTER_LEAVES_TO_MS = 2900;
const DONATION_OUT_FROM_MS = 2700;
const DONATION_OUT_TO_MS = 3100;
const GAUGE_FROM_MS = 2900;
const GAUGE_TO_MS = 3700;
const FADE_OUT_FROM_MS = 5800;
const FADE_OUT_TO_MS = 6200;

// La jauge avant le don et après : la part du tube remplie, sur une capacité de 20 dessins.
export const GAUGE_BEFORE = 0.3;
export const GAUGE_AFTER = 1;
export const GAUGE_CAPACITY = 20;

// La pastille est ancrée en haut au centre (unités de la vignette) ; le +50 est à droite de sa ligne de don (unités de pill).
const START_SPOT: PointerSpot = { ax: 84, ay: 40, bx: 0, by: 0 };
export const CLAIM_SPOT: PointerSpot = { ax: 56, ay: 8, bx: 29.7, by: 20.6 };

const WAYPOINTS = [
  { atMs: POINTER_APPEARS_FROM_MS, spot: START_SPOT },
  { atMs: CLAIM_MS - 120, spot: CLAIM_SPOT },
  { atMs: CLAIM_MS + 120, spot: CLAIM_SPOT },
];

export type CharityMoment = {
  pills: number; // la pastille et la pill Dessin, de 0 à 1
  donation: number; // la ligne de don : 0 (fermée) à 1 (ouverte)
  level: number; // la part remplie de la jauge, de 0 à 1
  count: number; // le nombre écrit dans la jauge
  pointer: PointerMoment;
  press: number; // la souris qui s'enfonce sur +50
};

export const charityAt = (timeMs: number): CharityMoment => {
  const t = loopTime(timeMs, CHARITY_LOOP_MS);
  const keep = spanOut(t, FADE_OUT_FROM_MS, FADE_OUT_TO_MS);
  // La jauge revient à son niveau d'avant pills effacées : la boucle repart sans saut visible.
  const level =
    t >= FADE_OUT_TO_MS
      ? GAUGE_BEFORE
      : lerp(GAUGE_BEFORE, GAUGE_AFTER, spanIn(t, GAUGE_FROM_MS, GAUGE_TO_MS));
  return {
    pills: spanIn(t, PILLS_APPEAR_FROM_MS, PILLS_APPEAR_TO_MS) * keep,
    donation:
      spanIn(t, DONATION_FROM_MS, DONATION_TO_MS) * spanOut(t, DONATION_OUT_FROM_MS, DONATION_OUT_TO_MS),
    level,
    count: Math.round(level * GAUGE_CAPACITY),
    pointer: {
      ...spotAlong(WAYPOINTS, t),
      opacity: pointerOpacity(
        t,
        POINTER_APPEARS_FROM_MS,
        POINTER_APPEARS_TO_MS,
        spanOut(t, POINTER_LEAVES_FROM_MS, POINTER_LEAVES_TO_MS),
      ),
    },
    press: click(t, CLAIM_MS),
  };
};
