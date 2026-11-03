// La vignette « La pipette » : une souris clique la pipette de la pill Dessin (elle s'arme, un seul clic), la souris devient l'icône
// de la pipette sur la fresque, clique un pixel rouge du chapeau du champignon, la couleur choisie devient ce rouge et la pipette se
// désarme. Puis un temps de repos, la souris part en fondu, la couleur d'avant revient, et la boucle repart. L'image fixe : la couleur prise.

import { SCENE_CELL } from "./inspection-scene";
import { CLICK_HALF_MS, click, loopTime, spanIn, spanOut } from "./motion-math";
import { type PointerMoment, type PointerSpot, pointerOpacity, spotAlong } from "./pointer-motion";

export const EYEDROPPER_LOOP_MS = 8400;
export const EYEDROPPER_RESTING_MS = 5000;

// Les trois pastilles de la pill (index de la palette) : la couleur d'avant, une autre, et le rouge du chapeau, que la pipette prend.
export const SWATCH_COLOR_INDEXES = [28, 20, 5] as const;
export const START_SWATCH = 0;
export const PICKED_SWATCH = 2;

// Le pixel que la pipette prend : une case rouge du chapeau, en cases du champignon, et où le champignon se pose (unités de la vignette).
export const PICK_MUSHROOM_AT = { x: 45, y: 17 } as const;
export const PICKED_CELL = { x: 3, y: 1 } as const;

const POINTER_APPEARS_FROM_MS = 250;
const POINTER_APPEARS_TO_MS = 400;
const CLICK_TOOL_MS = 1500;
const OVER_CANVAS_FROM_MS = 1900;
const CLICK_PIXEL_MS = 3200;
const OUTLINE_FADES_FROM_MS = 3900;
const OUTLINE_FADES_TO_MS = 4300;
const FADE_OUT_FROM_MS = 7300;
const FADE_OUT_TO_MS = 7800;

// Où la pointe se pose : le pixel est en unités de la vignette ; la pipette est dans la pill, ancrée en bas au centre (unités de pill).
const START_SPOT: PointerSpot = { ax: 94, ay: 44, bx: 0, by: 0 };
export const TOOL_SPOT: PointerSpot = { ax: 56, ay: 64, bx: 15.4, by: -10 };
const PIXEL_SPOT: PointerSpot = {
  ax: PICK_MUSHROOM_AT.x + (PICKED_CELL.x + 0.5) * SCENE_CELL,
  ay: PICK_MUSHROOM_AT.y + (PICKED_CELL.y + 0.5) * SCENE_CELL,
  bx: 0,
  by: 0,
};

const WAYPOINTS = [
  { atMs: POINTER_APPEARS_FROM_MS, spot: START_SPOT },
  { atMs: CLICK_TOOL_MS - 100, spot: TOOL_SPOT },
  { atMs: CLICK_TOOL_MS + 150, spot: TOOL_SPOT },
  { atMs: CLICK_PIXEL_MS - 150, spot: PIXEL_SPOT },
];

export type EyedropperMoment = {
  isArmed: boolean; // la pipette est armée, de son clic au clic sur le pixel
  chosen: number; // la pastille choisie : START_SWATCH, puis PICKED_SWATCH
  outline: number; // le contour du pixel pris, de 0 à 1
  toolTap: number; // l'appui sur la pipette
  isTool: boolean; // la souris est l'icône de la pipette : sur la fresque, pipette armée
  pointer: PointerMoment;
  press: number; // la souris qui s'enfonce à chaque clic
};

export const eyedropperAt = (timeMs: number): EyedropperMoment => {
  const t = loopTime(timeMs, EYEDROPPER_LOOP_MS);
  const keep = spanOut(t, FADE_OUT_FROM_MS, FADE_OUT_TO_MS);
  const toolTap = click(t, CLICK_TOOL_MS);
  const isArmed = t >= CLICK_TOOL_MS && t < CLICK_PIXEL_MS;
  const isPicked = t >= CLICK_PIXEL_MS && t < FADE_OUT_TO_MS;
  return {
    isArmed,
    chosen: isPicked ? PICKED_SWATCH : START_SWATCH,
    outline: isPicked
      ? spanIn(t, CLICK_PIXEL_MS, CLICK_PIXEL_MS + 80) *
        spanOut(t, OUTLINE_FADES_FROM_MS, OUTLINE_FADES_TO_MS)
      : 0,
    toolTap,
    isTool: t >= OVER_CANVAS_FROM_MS && t < CLICK_PIXEL_MS + CLICK_HALF_MS,
    pointer: {
      ...spotAlong(WAYPOINTS, t),
      opacity: pointerOpacity(t, POINTER_APPEARS_FROM_MS, POINTER_APPEARS_TO_MS, keep),
    },
    press: Math.max(toolTap, click(t, CLICK_PIXEL_MS)),
  };
};
