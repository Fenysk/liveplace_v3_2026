// La vignette « Dessin pendant tes lives » : une mini-fresque, la pill de profil du streamer (son bouton Twitch gris, hors live) et la pill
// Dessin dont Dessiner est grisé. Une souris appuie sur Dessiner grisé : le toast « Le dessin s'ouvre quand … est en live » paraît en haut,
// reste deux secondes et s'en va. Puis le live démarre : le bouton Twitch du profil passe en live (la teinte violette de Twitch, son rond),
// et Dessiner redevient plein. Tout s'efface en fondu, et la boucle repart sans saut. L'image fixe : hors live, Dessiner grisé, le toast
// visible, sans souris.

import { click, loopTime, spanIn, spanOut } from "./motion-math";
import { type PointerMoment, type PointerSpot, pointerOpacity, spotAlong } from "./pointer-motion";

export const LIVE_ONLY_LOOP_MS = 6000;
export const LIVE_ONLY_RESTING_MS = 2200;

const PILLS_APPEAR_FROM_MS = 100;
const PILLS_APPEAR_TO_MS = 350;
const POINTER_APPEARS_FROM_MS = 300;
const POINTER_APPEARS_TO_MS = 450;
export const PRESS_ENTER_MS = 1000;
const POINTER_LEAVES_FROM_MS = 1500;
const POINTER_LEAVES_TO_MS = 1800;
const TOAST_FROM_MS = 1060;
const TOAST_TO_MS = 1310;
const TOAST_OUT_FROM_MS = 3000;
const TOAST_OUT_TO_MS = 3250;
export const LIVE_FROM_MS = 3600;
export const LIVE_TO_MS = 3900;
const FADE_OUT_FROM_MS = 5300;
const FADE_OUT_TO_MS = 5700;

// Où la pointe se pose : Dessiner est dans la pill Dessin, ancrée en bas au centre (unités de pill).
const START_SPOT: PointerSpot = { ax: 94, ay: 56, bx: 0, by: 0 };
export const ENTER_SPOT: PointerSpot = { ax: 56, ay: 72, bx: 32.6, by: -19.8 };

const WAYPOINTS = [
  { atMs: POINTER_APPEARS_FROM_MS, spot: START_SPOT },
  { atMs: PRESS_ENTER_MS - 120, spot: ENTER_SPOT },
  { atMs: PRESS_ENTER_MS + 120, spot: ENTER_SPOT },
];

export type LiveOnlyMoment = {
  pills: number; // les pills de profil et de Dessin, de 0 à 1
  isGreyed: boolean; // Dessiner grisé : le streamer n'est pas en live
  live: number; // le bouton Twitch du profil : 0 (gris) à 1 (en live)
  toast: number; // « Le dessin s'ouvre quand … est en live »
  pointer: PointerMoment;
  press: number; // la souris qui s'enfonce sur Dessiner
};

export const liveOnlyAt = (timeMs: number): LiveOnlyMoment => {
  const t = loopTime(timeMs, LIVE_ONLY_LOOP_MS);
  const keep = spanOut(t, FADE_OUT_FROM_MS, FADE_OUT_TO_MS);
  return {
    pills: spanIn(t, PILLS_APPEAR_FROM_MS, PILLS_APPEAR_TO_MS) * keep,
    // Le retour au grisé se fait pills effacées : la boucle repart du hors live sans saut visible.
    isGreyed: t < LIVE_FROM_MS || t >= FADE_OUT_TO_MS,
    live: spanIn(t, LIVE_FROM_MS, LIVE_TO_MS) * keep,
    toast: spanIn(t, TOAST_FROM_MS, TOAST_TO_MS) * spanOut(t, TOAST_OUT_FROM_MS, TOAST_OUT_TO_MS),
    pointer: {
      ...spotAlong(WAYPOINTS, t),
      opacity: pointerOpacity(
        t,
        POINTER_APPEARS_FROM_MS,
        POINTER_APPEARS_TO_MS,
        spanOut(t, POINTER_LEAVES_FROM_MS, POINTER_LEAVES_TO_MS),
      ),
    },
    press: click(t, PRESS_ENTER_MS),
  };
};
