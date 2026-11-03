// La vignette « Un thème pour la fresque » : la fenêtre Fresque, réduite à son champ Thème, s'ouvre sur un voile. Une souris clique le
// champ, le thème s'écrit lettre par lettre ; puis elle clique à côté : le champ perd le focus, c'est ce qui l'enregistre (il n'a pas de
// bouton), et le toast le confirme. La fenêtre se ferme : la pill Thème paraît en haut de la fresque, comme pour tous les viewers. Un temps
// de repos, elle s'efface, et la boucle repart. L'image fixe : la pill Thème en haut, sans fenêtre ni souris.

import { clamp, click, loopTime, spanIn, spanOut } from "./motion-math";
import { type PointerMoment, type PointerSpot, pointerOpacity, spotAlong } from "./pointer-motion";

export const THEME_LOOP_MS = 9000;
export const THEME_RESTING_MS = 6200;

const WINDOW_OPENS_FROM_MS = 300;
const WINDOW_OPENS_TO_MS = 600;
const POINTER_APPEARS_FROM_MS = 450;
const POINTER_APPEARS_TO_MS = 600;
export const CLICK_FIELD_MS = 1200;
export const TYPING_FROM_MS = 1500;
export const TYPING_TO_MS = 2700;
const POINTER_LEAVES_AT_MS = 2800;
export const CLICK_AWAY_MS = 3400;
const TOAST_FROM_MS = 3480;
const TOAST_TO_MS = 3730;
const POINTER_FADES_FROM_MS = 3700;
const POINTER_FADES_TO_MS = 4000;
const WINDOW_CLOSES_FROM_MS = 4000;
const WINDOW_CLOSES_TO_MS = 4300;
const PILL_APPEARS_FROM_MS = 4400;
const PILL_APPEARS_TO_MS = 4700;
const TOAST_OUT_FROM_MS = 4700;
const TOAST_OUT_TO_MS = 5000;
const PILL_FADES_FROM_MS = 8100;
const PILL_FADES_TO_MS = 8500;
const CARET_BLINK_MS = 450;

// Où la pointe se pose : la fenêtre est au centre de la vignette (unités de pill). Le champ, côté droit, hors du texte écrit ; la phrase
// d'aide dessous, qui n'est ni le libellé (cliquer un libellé donne le focus au champ) ni un bouton.
const START_SPOT: PointerSpot = { ax: 96, ay: 62, bx: 0, by: 0 };
export const FIELD_SPOT: PointerSpot = { ax: 56, ay: 36, bx: 14, by: -3 };
export const AWAY_SPOT: PointerSpot = { ax: 56, ay: 36, bx: 8, by: 10.5 };

const WAYPOINTS = [
  { atMs: POINTER_APPEARS_FROM_MS, spot: START_SPOT },
  { atMs: CLICK_FIELD_MS - 120, spot: FIELD_SPOT },
  { atMs: POINTER_LEAVES_AT_MS, spot: FIELD_SPOT },
  { atMs: CLICK_AWAY_MS - 120, spot: AWAY_SPOT },
  { atMs: CLICK_AWAY_MS + 120, spot: AWAY_SPOT },
];

export type ThemeMoment = {
  window: number; // la fenêtre et le voile derrière, de 0 à 1
  typed: number; // la part du thème déjà écrite dans le champ, de 0 à 1
  isFocused: boolean; // le champ a le focus : de la souris qui le clique à celle qui clique à côté
  caret: number; // le curseur d'écriture : 1 pendant l'écriture, il clignote sinon
  toast: number; // « Thème enregistré »
  pill: number; // la pill Thème en haut de la fresque
  pointer: PointerMoment;
  press: number; // la souris qui s'enfonce à chaque clic
};

const isTypingAt = (t: number): boolean => t >= TYPING_FROM_MS && t <= TYPING_TO_MS;

const caretAt = (t: number, isFocused: boolean): number => {
  if (!isFocused) return 0;
  return isTypingAt(t) || Math.floor((t - CLICK_FIELD_MS) / CARET_BLINK_MS) % 2 === 0 ? 1 : 0;
};

export const themeAt = (timeMs: number): ThemeMoment => {
  const t = loopTime(timeMs, THEME_LOOP_MS);
  const isFocused = t >= CLICK_FIELD_MS && t < CLICK_AWAY_MS;
  return {
    window:
      spanIn(t, WINDOW_OPENS_FROM_MS, WINDOW_OPENS_TO_MS) *
      spanOut(t, WINDOW_CLOSES_FROM_MS, WINDOW_CLOSES_TO_MS),
    typed: clamp((t - TYPING_FROM_MS) / (TYPING_TO_MS - TYPING_FROM_MS)),
    isFocused,
    caret: caretAt(t, isFocused),
    toast: spanIn(t, TOAST_FROM_MS, TOAST_TO_MS) * spanOut(t, TOAST_OUT_FROM_MS, TOAST_OUT_TO_MS),
    pill:
      spanIn(t, PILL_APPEARS_FROM_MS, PILL_APPEARS_TO_MS) * spanOut(t, PILL_FADES_FROM_MS, PILL_FADES_TO_MS),
    pointer: {
      ...spotAlong(WAYPOINTS, t),
      opacity: pointerOpacity(
        t,
        POINTER_APPEARS_FROM_MS,
        POINTER_APPEARS_TO_MS,
        spanOut(t, POINTER_FADES_FROM_MS, POINTER_FADES_TO_MS),
      ),
    },
    press: Math.max(click(t, CLICK_FIELD_MS), click(t, CLICK_AWAY_MS)),
  };
};
