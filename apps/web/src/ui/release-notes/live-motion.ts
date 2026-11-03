// La vignette « En live sur Twitch » : une souris clique un pixel du chat sur la fresque ; la pill Inspection s'ouvre à droite sur son
// auteur, avec le bouton Twitch de son profil, d'abord gris. Puis la personne passe en live : le bouton prend la teinte violette de Twitch,
// son logo un rond, et dit la catégorie du stream. Un temps de repos, tout s'efface en fondu, et la boucle repart. L'image fixe : le bouton
// en live avec sa catégorie, la case entourée, sans souris.

import { CAT_AT, SCENE_CELL } from "./inspection-scene";
import { click, loopTime, spanIn, spanOut } from "./motion-math";
import { type PointerMoment, type PointerSpot, pointerOpacity, spotAlong } from "./pointer-motion";

export const LIVE_LOOP_MS = 8400;
export const LIVE_RESTING_MS = 5800;

const POINTER_APPEARS_FROM_MS = 250;
const POINTER_APPEARS_TO_MS = 400;
export const CLICK_CELL_MS = 1500;
const PILL_OPENS_FROM_MS = 1560;
const PILL_OPENS_TO_MS = 1840;
const POINTER_LEAVES_FROM_MS = 2100;
const POINTER_LEAVES_TO_MS = 2500;
export const LIVE_FROM_MS = 3000;
export const LIVE_TO_MS = 3300;
const FADE_OUT_FROM_MS = 7300;
const FADE_OUT_TO_MS = 7800;

// La case que la souris clique, sur le chat : une case du corps, sans rien de particulier. Elle est orange, et la pill la donne.
export const LIVE_CELL = { x: 2, y: 2 } as const;
export const LIVE_COLOR_INDEX = 8;

const START_SPOT: PointerSpot = { ax: 94, ay: 63, bx: 0, by: 0 };
export const CELL_SPOT: PointerSpot = {
  ax: CAT_AT.x + (LIVE_CELL.x + 0.5) * SCENE_CELL,
  ay: CAT_AT.y + (LIVE_CELL.y + 0.5) * SCENE_CELL,
  bx: 0,
  by: 0,
};

const WAYPOINTS = [
  { atMs: POINTER_APPEARS_FROM_MS, spot: START_SPOT },
  { atMs: CLICK_CELL_MS - 100, spot: CELL_SPOT },
];

export type LiveMoment = {
  ring: number; // le contour de la case cliquée, de 0 à 1
  pill: number; // la pill Inspection, de 0 (fermée) à 1
  live: number; // le bouton Twitch : 0 (gris, sans catégorie) à 1 (en live, avec sa catégorie)
  pointer: PointerMoment;
  press: number; // la souris qui s'enfonce au clic
};

export const liveAt = (timeMs: number): LiveMoment => {
  const t = loopTime(timeMs, LIVE_LOOP_MS);
  const keep = spanOut(t, FADE_OUT_FROM_MS, FADE_OUT_TO_MS);
  return {
    ring: spanIn(t, CLICK_CELL_MS, CLICK_CELL_MS + 120) * keep,
    pill: spanIn(t, PILL_OPENS_FROM_MS, PILL_OPENS_TO_MS) * keep,
    live:
      t < FADE_OUT_FROM_MS
        ? spanIn(t, LIVE_FROM_MS, LIVE_TO_MS)
        : spanOut(t, FADE_OUT_FROM_MS, FADE_OUT_TO_MS),
    pointer: {
      ...spotAlong(WAYPOINTS, t),
      opacity: pointerOpacity(
        t,
        POINTER_APPEARS_FROM_MS,
        POINTER_APPEARS_TO_MS,
        spanOut(t, POINTER_LEAVES_FROM_MS, POINTER_LEAVES_TO_MS),
      ),
    },
    press: click(t, CLICK_CELL_MS),
  };
};
