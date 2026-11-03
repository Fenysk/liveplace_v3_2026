// La vignette « Dessiner au clavier » : pas de souris. Les touches fléchées d'une petite rangée de touches s'allument une à une et la case
// visée (le contour noir et blanc du jeu) saute de case en case ; Espace s'allume et la case visée se remplit. Quatre pixels forment un
// petit sourire. Puis un temps de repos, tout s'efface en fondu, et la boucle repart. L'image fixe : les quatre pixels dessinés, la case
// visée à côté du dernier, les touches éteintes.
// Le script des touches est la seule source : la case visée et les pixels en sont déduits.

import { clamp, click, loopTime, spanIn, spanOut } from "./motion-math";

export const KEYBOARD_LOOP_MS = 8400;
export const KEYBOARD_RESTING_MS = 6600;

export type KeyName = "up" | "left" | "down" | "right" | "space";
export const KEY_NAMES: readonly KeyName[] = ["up", "left", "down", "right", "space"];

type KeyStep = { key: KeyName; atMs: number };
export type TargetCell = { x: number; y: number };

// Les touches de la vignette, dans l'ordre : de la case de départ, deux fois gauche, Espace ; droite, bas, Espace ; droite, Espace ;
// droite, haut, Espace ; deux flèches à droite, qui laissent voir le dernier pixel.
export const KEY_STEPS: readonly KeyStep[] = [
  { key: "left", atMs: 1100 },
  { key: "left", atMs: 1480 },
  { key: "space", atMs: 1900 },
  { key: "right", atMs: 2450 },
  { key: "down", atMs: 2830 },
  { key: "space", atMs: 3280 },
  { key: "right", atMs: 3730 },
  { key: "space", atMs: 4180 },
  { key: "right", atMs: 4630 },
  { key: "up", atMs: 5010 },
  { key: "space", atMs: 5430 },
  { key: "right", atMs: 5900 },
  { key: "right", atMs: 6200 },
];

// La case visée au départ, en cases du sourire (0, 0 est sa case en haut à gauche).
export const START_CELL: TargetCell = { x: 2, y: 0 };

const OUTLINE_FROM_MS = 500;
const OUTLINE_TO_MS = 760;
const FADE_OUT_FROM_MS = 7300;
const FADE_OUT_TO_MS = 7800;

const ARROW_STEPS: Readonly<Record<Exclude<KeyName, "space">, TargetCell>> = {
  up: { x: 0, y: -1 },
  left: { x: -1, y: 0 },
  down: { x: 0, y: 1 },
  right: { x: 1, y: 0 },
};

// Où est la case visée une fois les touches pressées jusqu'à l'instant `t` : chaque flèche la déplace d'une case.
const targetAt = (t: number): TargetCell =>
  KEY_STEPS.filter(({ atMs }) => atMs <= t).reduce<TargetCell>((cell, { key }) => {
    if (key === "space") return cell;
    const step = ARROW_STEPS[key];
    return { x: cell.x + step.x, y: cell.y + step.y };
  }, START_CELL);

// Les cases que les Espace remplissent, dans l'ordre : le dessin des quatre pixels.
export const PIXEL_CELLS: readonly TargetCell[] = KEY_STEPS.filter(({ key }) => key === "space").map(
  ({ atMs }) => targetAt(atMs),
);

const spaceTimes: readonly number[] = KEY_STEPS.filter(({ key }) => key === "space").map(({ atMs }) => atMs);

export type KeyboardMoment = {
  target: TargetCell; // la case visée, en cases du sourire
  outline: number; // son contour, de 0 à 1
  pixels: readonly number[]; // l'opacité de chaque pixel dessiné, de 0 à 1
  pressed: Readonly<Record<KeyName, number>>; // l'appui de chaque touche, de 0 (relevée) à 1 (au moment où on la presse)
};

const pressOf = (key: KeyName, t: number): number =>
  clamp(Math.max(0, ...KEY_STEPS.filter((step) => step.key === key).map(({ atMs }) => click(t, atMs))));

export const keyboardAt = (timeMs: number): KeyboardMoment => {
  const t = loopTime(timeMs, KEYBOARD_LOOP_MS);
  const keep = spanOut(t, FADE_OUT_FROM_MS, FADE_OUT_TO_MS);
  return {
    target: targetAt(t),
    outline: spanIn(t, OUTLINE_FROM_MS, OUTLINE_TO_MS) * keep,
    pixels: spaceTimes.map((atMs) => (t >= atMs ? keep : 0)),
    pressed: {
      up: pressOf("up", t),
      left: pressOf("left", t),
      down: pressOf("down", t),
      right: pressOf("right", t),
      space: pressOf("space", t),
    },
  };
};
