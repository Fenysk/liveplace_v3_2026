// La vignette « App mobile » : un téléphone, son écran d'accueil et l'icône de l'appli. Un doigt (un point, pas une souris) appuie sur
// l'icône ; l'appli s'ouvre depuis l'icône jusqu'à remplir tout l'écran, sans barre de navigateur, avec les pills du jeu. Un temps de
// repos, l'appli se referme vers son icône, et la boucle repart. L'image fixe : la fresque ouverte en plein écran, sans doigt.

import { click, loopTime, spanIn, spanOut } from "./motion-math";
import { type PointerMoment, type PointerSpot, pointerOpacity, spotAlong } from "./pointer-motion";

export const INSTALL_LOOP_MS = 8400;
export const INSTALL_RESTING_MS = 4800;

const TOUCH_APPEARS_FROM_MS = 250;
const TOUCH_APPEARS_TO_MS = 400;
export const TAP_ICON_MS = 1500;
const TOUCH_LEAVES_FROM_MS = 1750;
const TOUCH_LEAVES_TO_MS = 2050;
export const OPEN_FROM_MS = 1580;
export const OPEN_TO_MS = 2280;
export const CLOSE_FROM_MS = 6900;
export const CLOSE_TO_MS = 7500;

// Où se pose le doigt, en unités de la vignette (le téléphone est centré) : l'icône est dans la grille de l'écran d'accueil.
const START_SPOT: PointerSpot = { ax: 60, ay: 61, bx: 0, by: 0 };
export const ICON_SPOT: PointerSpot = { ax: 52.2, ay: 35.9, bx: 0, by: 0 };

const WAYPOINTS = [
  { atMs: TOUCH_APPEARS_FROM_MS, spot: START_SPOT },
  { atMs: TAP_ICON_MS - 120, spot: ICON_SPOT },
];

export type InstallMoment = {
  open: number; // l'appli, de 0 (l'icône) à 1 (tout l'écran) : elle grandit depuis l'icône, et s'y referme en fin de boucle
  tap: number; // l'appui sur l'icône
  pointer: PointerMoment;
  press: number; // le doigt qui s'enfonce à l'appui
};

export const installAt = (timeMs: number): InstallMoment => {
  const t = loopTime(timeMs, INSTALL_LOOP_MS);
  const tap = click(t, TAP_ICON_MS);
  return {
    open: t < CLOSE_FROM_MS ? spanIn(t, OPEN_FROM_MS, OPEN_TO_MS) : spanOut(t, CLOSE_FROM_MS, CLOSE_TO_MS),
    tap,
    pointer: {
      ...spotAlong(WAYPOINTS, t),
      opacity: pointerOpacity(
        t,
        TOUCH_APPEARS_FROM_MS,
        TOUCH_APPEARS_TO_MS,
        spanOut(t, TOUCH_LEAVES_FROM_MS, TOUCH_LEAVES_TO_MS),
      ),
    },
    press: tap,
  };
};
