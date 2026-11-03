// La vignette « Lancement de LivePlace (bêta) » : en haut à droite, la pill Compte d'un invité avec son bouton Se connecter (violet de
// Twitch). Une souris le clique ; la pill devient celle du compte connecté. Puis trois dessins arrivent sur la fresque, l'un après
// l'autre, comme ceux de trois viewers, case après case et en fondu, comme l'arrivée des dessins des autres dans le jeu
// (ui/canvas/arrival.ts). Un temps de repos, tout s'efface en fondu, l'invité revient, et la boucle repart. L'image fixe : le compte
// connecté et les trois dessins, sans la souris.

import { arrivalDelay } from "../canvas/arrival";
import { click, ease, loopTime, spanIn, spanOut } from "./motion-math";
import { type MotifName, motifCells, type PixelCell } from "./pixel-motifs";
import { type PointerMoment, type PointerSpot, pointerOpacity, spotAlong } from "./pointer-motion";

export const LAUNCH_LOOP_MS = 8400;
export const LAUNCH_RESTING_MS = 7000;

// Le fondu d'une case qui arrive : celui du jeu (`--lp-dur-arrival`, tokens.css).
const ARRIVAL_FADE_MS = 300;

// Les dessins des trois viewers : un motif générique chacun, son coin haut gauche en unités de la vignette (une case = 3 unités), et
// l'instant où son lot commence à arriver.
type Arrival = { motif: MotifName; x: number; y: number; startMs: number };

export const ARRIVALS: readonly Arrival[] = [
  { motif: "ghost", x: 10, y: 16, startMs: 2400 },
  { motif: "cat", x: 44, y: 40, startMs: 3900 },
  { motif: "heart", x: 82, y: 42, startMs: 5400 },
];

// Les cases de chaque dessin, rangée après rangée : l'ordre du lot, donc celui où elles arrivent.
export const ARRIVAL_CELLS: readonly (readonly PixelCell[])[] = ARRIVALS.map(({ motif }) =>
  motifCells(motif, 0, 0),
);

const POINTER_APPEARS_FROM_MS = 250;
const POINTER_APPEARS_TO_MS = 400;
export const CLICK_SIGN_IN_MS = 1500;
const POINTER_LEAVES_FROM_MS = 2000;
const POINTER_LEAVES_TO_MS = 2400;
const ACCOUNT_FROM_MS = 1600;
const ACCOUNT_TO_MS = 1900;
const FADE_OUT_FROM_MS = 7300;
const FADE_OUT_TO_MS = 7800;
const GUEST_BACK_TO_MS = 8200;

// Où la pointe se pose : Se connecter est dans la pill, ancrée en haut à droite (unités de pill).
const START_SPOT: PointerSpot = { ax: 92, ay: 50, bx: 0, by: 0 };
export const SIGN_IN_SPOT: PointerSpot = { ax: 104, ay: 8, bx: -24.5, by: 7.5 };

const WAYPOINTS = [
  { atMs: POINTER_APPEARS_FROM_MS, spot: START_SPOT },
  { atMs: CLICK_SIGN_IN_MS - 120, spot: SIGN_IN_SPOT },
];

export type LaunchMoment = {
  guest: number; // la pill de l'invité, de 1 à 0 puis de 0 à 1 : elle laisse la place au compte connecté, et revient en fin de boucle
  account: number; // la pill du compte connecté
  signInTap: number; // l'appui sur Se connecter
  drawings: number; // les trois dessins ensemble, de 1 à 0 à la fin
  pointer: PointerMoment;
  press: number; // la souris qui s'enfonce au clic
};

export const launchAt = (timeMs: number): LaunchMoment => {
  const t = loopTime(timeMs, LAUNCH_LOOP_MS);
  const keep = spanOut(t, FADE_OUT_FROM_MS, FADE_OUT_TO_MS);
  const signInTap = click(t, CLICK_SIGN_IN_MS);
  return {
    guest:
      t < FADE_OUT_FROM_MS
        ? spanOut(t, ACCOUNT_FROM_MS, ACCOUNT_TO_MS)
        : spanIn(t, FADE_OUT_TO_MS, GUEST_BACK_TO_MS),
    account: spanIn(t, ACCOUNT_FROM_MS, ACCOUNT_TO_MS) * keep,
    signInTap,
    drawings: keep,
    pointer: {
      ...spotAlong(WAYPOINTS, t),
      opacity: pointerOpacity(
        t,
        POINTER_APPEARS_FROM_MS,
        POINTER_APPEARS_TO_MS,
        spanOut(t, POINTER_LEAVES_FROM_MS, POINTER_LEAVES_TO_MS),
      ),
    },
    press: signInTap,
  };
};

// L'opacité d'une case de lot : 0 tant que son tour n'est pas venu, puis son fondu. `drawing` et `cell` sont des index de ARRIVALS.
export const arrivalAt = (drawing: number, cell: number, timeMs: number): number => {
  const start = ARRIVALS[drawing]?.startMs;
  const size = ARRIVAL_CELLS[drawing]?.length;
  if (start === undefined || size === undefined) return 0;
  return ease((loopTime(timeMs, LAUNCH_LOOP_MS) - start - arrivalDelay(cell, size)) / ARRIVAL_FADE_MS);
};
