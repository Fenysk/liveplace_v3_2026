// La vignette « Le format de la fresque » : le sélecteur de format de la fenêtre Fresque en petit (1:1, 16:9, 9:16, 4:3, 3:4) et, au-dessus,
// le cadre de la fresque avec un motif dedans. Une souris choisit 1:1, puis 16:9, puis 9:16 : le cadre glisse vers chaque forme. Le
// format de départ est le dernier, 9:16 : la boucle se referme sans saut. L'image fixe : 16:9 choisi, sans souris.

import type { CanvasFormat } from "@liveplace/domain";
import { CLICK_HALF_MS, click, lerp, loopTime, spanIn, spanOut } from "./motion-math";
import { type PointerMoment, type PointerSpot, pointerOpacity, spotAlong } from "./pointer-motion";

export const FORMAT_LOOP_MS = 8400;
export const FORMAT_RESTING_MS = 4500;

export type ShownFormat = Extract<CanvasFormat, "1:1" | "16:9" | "9:16">;
export type FrameSize = { width: number; height: number };

// Le cadre de chaque format, en unités de la vignette : les proportions sont celles du format, le centre est toujours le même.
export const FRAME_SIZES: Readonly<Record<ShownFormat, FrameSize>> = {
  "1:1": { width: 36, height: 36 },
  "16:9": { width: 64, height: 36 },
  "9:16": { width: 22.5, height: 40 },
};
export const FRAME_CENTER = { x: 56, y: 26 } as const;

export const START_FORMAT: ShownFormat = "9:16";

// Les choix de la souris, dans l'ordre, et l'instant de chaque clic.
export const CHOICES: readonly { format: ShownFormat; clickMs: number }[] = [
  { format: "1:1", clickMs: 1600 },
  { format: "16:9", clickMs: 3400 },
  { format: "9:16", clickMs: 5200 },
];

const GLIDE_MS = 380;
const POINTER_APPEARS_FROM_MS = 250;
const POINTER_APPEARS_TO_MS = 400;
const FADE_OUT_FROM_MS = 7300;
const FADE_OUT_TO_MS = 7800;

// Où la pointe se pose : le sélecteur est dans la pill, ancrée en bas au centre (unités de pill).
const START_SPOT: PointerSpot = { ax: 92, ay: 36, bx: 0, by: 0 };
export const OPTION_SPOTS: Readonly<Record<ShownFormat, PointerSpot>> = {
  "1:1": { ax: 56, ay: 64, bx: -31.5, by: -8 },
  "16:9": { ax: 56, ay: 64, bx: -15.8, by: -8 },
  "9:16": { ax: 56, ay: 64, bx: 1.5, by: -8 },
};

const WAYPOINTS = [
  { atMs: POINTER_APPEARS_FROM_MS, spot: START_SPOT },
  ...CHOICES.flatMap(({ format, clickMs }) => [
    { atMs: clickMs - 120, spot: OPTION_SPOTS[format] },
    { atMs: clickMs + 120, spot: OPTION_SPOTS[format] },
  ]),
];

export type FormatMoment = {
  chosen: ShownFormat; // l'option choisie du sélecteur
  frame: FrameSize; // le cadre de la fresque, qui glisse de la forme d'avant à celle du format choisi
  taps: Readonly<Record<ShownFormat, number>>; // l'appui sur chaque option, de 0 à 1
  pointer: PointerMoment;
  press: number; // la souris qui s'enfonce à chaque clic
};

// Le dernier choix déjà fait à l'instant `t` (après son clic), avec le format d'avant.
const lastChoiceAt = (t: number) => {
  const index = CHOICES.findLastIndex(({ clickMs }) => t >= clickMs + CLICK_HALF_MS);
  const current = CHOICES[index];
  return { current, before: CHOICES[index - 1]?.format ?? START_FORMAT };
};

const frameAt = (t: number): FrameSize => {
  const { current, before } = lastChoiceAt(t);
  if (!current) return FRAME_SIZES[START_FORMAT];
  const from = FRAME_SIZES[before];
  const to = FRAME_SIZES[current.format];
  const progress = spanIn(t, current.clickMs + CLICK_HALF_MS, current.clickMs + CLICK_HALF_MS + GLIDE_MS);
  return { width: lerp(from.width, to.width, progress), height: lerp(from.height, to.height, progress) };
};

const tapOf = (format: ShownFormat, t: number): number =>
  Math.max(
    0,
    ...CHOICES.filter((choice) => choice.format === format).map(({ clickMs }) => click(t, clickMs)),
  );

export const formatAt = (timeMs: number): FormatMoment => {
  const t = loopTime(timeMs, FORMAT_LOOP_MS);
  const keep = spanOut(t, FADE_OUT_FROM_MS, FADE_OUT_TO_MS);
  const taps = { "1:1": tapOf("1:1", t), "16:9": tapOf("16:9", t), "9:16": tapOf("9:16", t) };
  return {
    chosen: lastChoiceAt(t).current?.format ?? START_FORMAT,
    frame: frameAt(t),
    taps,
    pointer: {
      ...spotAlong(WAYPOINTS, t),
      opacity: pointerOpacity(t, POINTER_APPEARS_FROM_MS, POINTER_APPEARS_TO_MS, keep),
    },
    press: Math.max(...Object.values(taps)),
  };
};
