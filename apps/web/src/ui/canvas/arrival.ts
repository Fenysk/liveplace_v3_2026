// L'arrivée des cases des autres joueurs : un fondu par case, décalé dans le lot, de la couleur montrée à la nouvelle.
// Pur : la scène lit `--lp-dur-arrival` et mène les images.

import { TRANSPARENT_COLOR_INDEX } from "@liveplace/domain";

// L'écart entre deux cases d'un lot, au plus ; un gros lot le resserre pour tenir en ARRIVAL_SPREAD_MS : 1,2 s au plus en tout.
export const ARRIVAL_STEP_MS = 80;
export const ARRIVAL_SPREAD_MS = 1200;
// Au-delà de ce nombre de cases en fondu ou en attente de leur tour, un lot paraît en entier d'un coup.
export const MAX_ARRIVALS = 200;

// Une couleur posée sur la case, à `alpha` : une case en fondu montre ses couleurs l'une sur l'autre, de bas en haut.
export type ColorLayer = { colorIndex: number; alpha: number };

// Le tour de la case `index` d'un lot de `size` cases, en ms après le début du lot.
export const arrivalDelay = (index: number, size: number): number =>
  index * Math.min(ARRIVAL_STEP_MS, ARRIVAL_SPREAD_MS / size);

// Ce que montre une case qui part de `base` vers `colorIndex`, à `progress` de 0 à 1. Vers le transparent, `base` s'efface ;
// sinon, la nouvelle couleur paraît par-dessus. Une case réécrite pendant son fondu repart de ces couleurs.
export const shownLayers = (
  base: readonly ColorLayer[],
  colorIndex: number,
  progress: number,
): ColorLayer[] =>
  colorIndex === TRANSPARENT_COLOR_INDEX
    ? base.map((layer) => ({ ...layer, alpha: layer.alpha * (1 - progress) }))
    : [...base, { colorIndex, alpha: progress }];

// L'avancée d'un fondu à l'instant `now` : 0 tant que son tour n'est pas venu, puis de 0 à 1 (la courbe appliquée). `startedAt`
// nul : le lot n'a pas encore eu d'image. `isDone` : le fondu est fini, la case montre l'image.
export type ArrivalClock = {
  startedAt: number | null;
  delay: number;
  duration: number;
  ease: (progress: number) => number;
};

export const arrivalProgress = ({ startedAt, delay, duration, ease }: ArrivalClock, now: number): number =>
  startedAt === null ? 0 : ease(Math.min(1, Math.max(0, (now - startedAt - delay) / duration)));

export const isArrivalDone = ({ startedAt, delay, duration }: ArrivalClock, now: number): boolean =>
  startedAt !== null && now - startedAt - delay >= duration;
