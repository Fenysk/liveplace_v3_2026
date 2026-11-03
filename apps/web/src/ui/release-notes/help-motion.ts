// La vignette « Un coup de pouce ? » : la pill Dessin en bas d'une mini-fresque (la jauge et Valider). Les bulles d'aide du tutoriel
// paraissent une à une, leur flèche contre ce qu'elles désignent : d'abord celle de Valider, puis celle de la jauge. Puis une fenêtre
// Mon compte, réduite à sa rangée « Tutoriel », s'ouvre sur un voile : une souris clique « Revoir le tuto », le toast confirme, la
// fenêtre se ferme et la première bulle revient, le tutoriel repart du début. La boucle se referme sur cette bulle, qui est aussi celle
// du début : le repos. L'image fixe : la bulle de Valider, sans souris.

import { click, loopTime, spanIn, spanOut } from "./motion-math";
import { type PointerMoment, type PointerSpot, pointerOpacity, spotAlong } from "./pointer-motion";

export const HELP_LOOP_MS = 9600;
export const HELP_RESTING_MS = 1200;

const SUBMIT_BUBBLE_OUT_FROM_MS = 2400;
const SUBMIT_BUBBLE_OUT_TO_MS = 2800;
const GAUGE_BUBBLE_IN_FROM_MS = 3000;
const GAUGE_BUBBLE_IN_TO_MS = 3400;
const GAUGE_BUBBLE_OUT_FROM_MS = 5000;
const GAUGE_BUBBLE_OUT_TO_MS = 5400;
const WINDOW_OPENS_FROM_MS = 5600;
const WINDOW_OPENS_TO_MS = 5900;
export const CLICK_RESTART_MS = 6500;
const TOAST_FROM_MS = 6600;
const TOAST_TO_MS = 6850;
const WINDOW_CLOSES_FROM_MS = 7100;
const WINDOW_CLOSES_TO_MS = 7400;
const TOAST_OUT_FROM_MS = 7600;
const TOAST_OUT_TO_MS = 7900;
const SUBMIT_BUBBLE_BACK_FROM_MS = 7600;
const SUBMIT_BUBBLE_BACK_TO_MS = 8000;
const POINTER_APPEARS_FROM_MS = 5000;
const POINTER_APPEARS_TO_MS = 5200;

// Où la pointe se pose : le bouton est dans la fenêtre, au centre (unités de pill).
const START_SPOT: PointerSpot = { ax: 94, ay: 56, bx: 0, by: 0 };
export const RESTART_SPOT: PointerSpot = { ax: 56, ay: 36, bx: 12.8, by: 0 };

const WAYPOINTS = [
  { atMs: POINTER_APPEARS_FROM_MS, spot: START_SPOT },
  { atMs: CLICK_RESTART_MS - 150, spot: RESTART_SPOT },
];

export type HelpMoment = {
  submitBubble: number; // la bulle de Valider, de 0 à 1 ; elle part avant la seconde et revient quand le tutoriel repart
  gaugeBubble: number; // la bulle de la jauge
  window: number; // la fenêtre Mon compte et le voile derrière
  toast: number; // « Le tuto repart du début »
  restartTap: number; // l'appui sur Revoir le tuto
  pointer: PointerMoment;
  press: number; // la souris qui s'enfonce au clic
};

export const helpAt = (timeMs: number): HelpMoment => {
  const t = loopTime(timeMs, HELP_LOOP_MS);
  const restartTap = click(t, CLICK_RESTART_MS);
  const windowAt = spanOut(t, WINDOW_CLOSES_FROM_MS, WINDOW_CLOSES_TO_MS);
  return {
    submitBubble:
      t < GAUGE_BUBBLE_IN_FROM_MS
        ? spanOut(t, SUBMIT_BUBBLE_OUT_FROM_MS, SUBMIT_BUBBLE_OUT_TO_MS)
        : spanIn(t, SUBMIT_BUBBLE_BACK_FROM_MS, SUBMIT_BUBBLE_BACK_TO_MS),
    gaugeBubble:
      spanIn(t, GAUGE_BUBBLE_IN_FROM_MS, GAUGE_BUBBLE_IN_TO_MS) *
      spanOut(t, GAUGE_BUBBLE_OUT_FROM_MS, GAUGE_BUBBLE_OUT_TO_MS),
    window: spanIn(t, WINDOW_OPENS_FROM_MS, WINDOW_OPENS_TO_MS) * windowAt,
    toast: spanIn(t, TOAST_FROM_MS, TOAST_TO_MS) * spanOut(t, TOAST_OUT_FROM_MS, TOAST_OUT_TO_MS),
    restartTap,
    pointer: {
      ...spotAlong(WAYPOINTS, t),
      opacity: pointerOpacity(t, POINTER_APPEARS_FROM_MS, POINTER_APPEARS_TO_MS, windowAt),
    },
    press: restartTap,
  };
};
