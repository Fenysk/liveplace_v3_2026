// Les quatre vignettes animées des Nouveautés, calculées d'après le temps. Rien ne s'accumule d'une image à l'autre, donc une vignette
// agrandie reprend exactement où va la petite, et l'image fixe est une image comme une autre de la boucle.

import { DRAFT_STROKES, type DraftStroke, strokePoint, strokeShown } from "./draft-strokes";
import { clamp, ease, lerp, spanIn, spanOut, tap, loopTime as wrapTime } from "./motion-math";
import {
  ARCHIVE_COMPOSITIONS,
  GROWTH_HEIGHT,
  GROWTH_PLACEMENTS,
  GROWTH_WIDTH,
  motifCells,
  type PixelCell,
} from "./pixel-motifs";
import { type Leg, mixSpots, type PointerMoment, type PointerSpot, spotAmong } from "./pointer-motion";

export const LOOP_MS = 4800;

// L'image fixe (mouvement réduit, rendu du serveur) : la fin de la boucle, quand tout est posé.
export const RESTING_MS = LOOP_MS - 1;

const loopTime = (timeMs: number, period = LOOP_MS): number => wrapTime(timeMs, period);

// La fresque qui grandit : un motif entier à chaque étape, au centre d'abord puis de plus en plus loin ; elle garde 3 cases vides
// autour des motifs et suit, en glissant. Le motif se pose rangée après rangée, de haut en bas, un instant après le début du glissement.
export { GROWTH_HEIGHT, GROWTH_WIDTH };

const MARGIN = 3;
const GROWTH_STEP_MS = 800;
const SLIDE_MS = 260;
const POSE_DELAY_MS = 120;
const POSE_MS = 280;

// Les cases de chaque motif, dans l'ordre où on les voit se poser.
const GROWTH_MOTIFS: readonly (readonly PixelCell[])[] = GROWTH_PLACEMENTS.map(({ motif, x, y }) =>
  motifCells(motif, x, y),
);

// Chaque case de chaque motif : `motif` et `order` disent quand elle se pose (`growthAt().shown`).
export type GrowthCell = {
  id: string;
  motif: number;
  order: number;
  x: number;
  y: number;
  colorIndex: number;
};

export const GROWTH_CELLS: readonly GrowthCell[] = GROWTH_MOTIFS.flatMap((cells, motif) =>
  cells.map(({ x, y, colorIndex }, order) => ({ id: `${motif}.${order}`, motif, order, x, y, colorIndex })),
);

// Les bords de la fresque, en cases : x0, y0, x1, y1. Les motifs jusqu'au k-ième, plus la marge de chaque côté.
export type Bounds = readonly [x0: number, y0: number, x1: number, y1: number];

const boundsAfter = (motifCount: number): Bounds => {
  const cells = GROWTH_MOTIFS.slice(0, motifCount).flat();
  const xs = cells.map(({ x }) => x);
  const ys = cells.map(({ y }) => y);
  return [
    Math.max(0, Math.min(...xs) - MARGIN),
    Math.max(0, Math.min(...ys) - MARGIN),
    Math.min(GROWTH_WIDTH, Math.max(...xs) + 1 + MARGIN),
    Math.min(GROWTH_HEIGHT, Math.max(...ys) + 1 + MARGIN),
  ];
};

export type GrowthMoment = {
  bounds: Bounds;
  shown: readonly number[]; // pour chaque motif, combien de ses cases sont déjà posées
};

export const growthAt = (timeMs: number): GrowthMoment => {
  const local = loopTime(timeMs);
  const current = Math.min(GROWTH_MOTIFS.length - 1, Math.floor(local / GROWTH_STEP_MS));
  const sinceStart = local - current * GROWTH_STEP_MS;
  const slide = current === 0 ? 1 : ease(sinceStart / SLIDE_MS);
  const [fromX0, fromY0, fromX1, fromY1] = boundsAfter(Math.max(1, current));
  const [toX0, toY0, toX1, toY1] = boundsAfter(current + 1);
  return {
    bounds: [
      lerp(fromX0, toX0, slide),
      lerp(fromY0, toY0, slide),
      lerp(fromX1, toX1, slide),
      lerp(fromY1, toY1, slide),
    ],
    // Le dernier motif se pose rangée après rangée ; les suivants n'ont pas commencé.
    shown: GROWTH_MOTIFS.map((cells, index) => {
      if (index < current) return cells.length;
      if (index > current) return 0;
      return Math.ceil(cells.length * clamp((sinceStart - POSE_DELAY_MS) / POSE_MS));
    }),
  };
};

// Le classement : toutes les 1,6 s, un nouveau passe premier ; la ligne glisse en 200 ms, l'anneau suit la place.
export const PODIUM_SIZE = 3;
const SWAP_MS = 1600;
const PODIUM_SLIDE_MS = 200;
// PLACES[étape][avatar] : la place de l'avatar à cette étape, 0 étant la première.
const PLACES: readonly (readonly number[])[] = [
  [0, 1, 2],
  [2, 0, 1],
  [1, 2, 0],
];

const placeAt = (step: number, avatar: number): number =>
  PLACES[((step % PLACES.length) + PLACES.length) % PLACES.length]?.[avatar] ?? avatar;

export type PodiumMoment = {
  slots: readonly number[]; // la position de chaque avatar, en places, fractionnaire pendant le glissement
  ranks: readonly number[]; // la place que chaque avatar a prise : c'est elle que dit son anneau
};

export const podiumAt = (timeMs: number): PodiumMoment => {
  const local = loopTime(timeMs);
  const step = Math.floor(local / SWAP_MS);
  const slide = ease((local - step * SWAP_MS) / PODIUM_SLIDE_MS);
  const avatars = Array.from({ length: PODIUM_SIZE }, (_, avatar) => avatar);
  return {
    slots: avatars.map((avatar) => lerp(placeAt(step - 1, avatar), placeAt(step, avatar), slide)),
    ranks: avatars.map((avatar) => placeAt(step, avatar)),
  };
};

// L'archivage : une pile de trois mini-fresques parmi six, toutes différentes, qui recule. À chaque étape de 1,6 s, un arrêt d'une
// seconde, puis 0,6 s de mouvement : celle de devant passe au milieu, celle du milieu passe derrière, celle de derrière s'en va en
// fondu vers l'arrière, et une neuve entre devant en fondu, en venant de l'avant. Une fresque qui est partie ne revient qu'après trois
// étapes, quand les trois autres sont passées devant : celle de devant et celle de derrière sont toujours deux fresques différentes.
export const ARCHIVE_COUNT = ARCHIVE_COMPOSITIONS.length;
const ARCHIVE_STEP_MS = 1600;
const ARCHIVE_MOVE_MS = 600;
export const ARCHIVE_LOOP_MS = ARCHIVE_COUNT * ARCHIVE_STEP_MS;
// L'image fixe : un arrêt, la pile en place.
export const ARCHIVE_RESTING_MS = 500;

export type ArchiveCanvas = { x: number; y: number; opacity: number };

// Les places, de celle où celle de derrière sort (invisible, en haut à gauche) à celle d'où une fresque neuve entre (invisible, en bas à
// droite) : la sortie, derrière, au milieu, devant, l'entrée. Les écarts sont ceux de l'escalier, et la sortie et l'entrée le prolongent.
export const ARCHIVE_SLOTS: readonly ArchiveCanvas[] = [
  { x: -16, y: -2, opacity: 0 },
  { x: 2, y: 5, opacity: 0.55 },
  { x: 20, y: 12, opacity: 0.8 },
  { x: 38, y: 19, opacity: 1 },
  { x: 56, y: 26, opacity: 0 },
];
const SLOT_BACK_EXIT = 0;
const SLOT_ENTRY = 4;

const slotOf = (index: number): ArchiveCanvas => ARCHIVE_SLOTS[index] ?? { x: 0, y: 0, opacity: 0 };

export type ArchiveMoment = {
  canvases: readonly ArchiveCanvas[]; // où est chaque mini-fresque, dans l'ordre de ARCHIVE_COMPOSITIONS
  order: readonly number[]; // de l'arrière à l'avant, l'ordre dans lequel les dessiner
};

// Le rang d'une fresque à l'étape `step`, qui monte de 1 à chaque étape : 0 devant, 1 au milieu, 2 derrière, puis elle attend, invisible,
// et la dernière (ARCHIVE_COUNT - 1) est celle qui va entrer devant.
const rankAt = (canvas: number, step: number): number =>
  (((step - canvas) % ARCHIVE_COUNT) + ARCHIVE_COUNT) % ARCHIVE_COUNT;

const ENTERING_RANK = ARCHIVE_COUNT - 1;

// À l'arrêt, le rang 0 est à la place 3 (devant), le rang 1 à la 2, le rang 2 à la 1 ; celle qui va entrer attend à la place d'entrée, les
// autres à celle de sortie, hors de vue.
const restingSlot = (rank: number): number => {
  if (rank <= 2) return 3 - rank;
  return rank === ENTERING_RANK ? SLOT_ENTRY : SLOT_BACK_EXIT;
};

// Celle qui entre devant paraît pendant les premiers 40 % du mouvement, pas pendant tout le mouvement : transparente, elle laisserait voir
// l'ancienne fresque de devant à travers ses dessins ; si vite, elle la recouvre avant que le mélange se remarque.
const ENTRY_FADE_SHARE = 0.4;

// Pendant le mouvement, chaque fresque va de la place de son rang à celle du rang suivant : la dernière de la pile sort, celle qui attend entre.
const archiveCanvasAt = (canvas: number, step: number, progress: number): ArchiveCanvas => {
  const rank = rankAt(canvas, step);
  const slide = ease(progress);
  const fade = rank === ENTERING_RANK ? ease(progress / ENTRY_FADE_SHARE) : slide;
  const start = slotOf(restingSlot(rank));
  const end = slotOf(restingSlot((rank + 1) % ARCHIVE_COUNT));
  return {
    x: lerp(start.x, end.x, slide),
    y: lerp(start.y, end.y, slide),
    opacity: lerp(start.opacity, end.opacity, fade),
  };
};

// Le rang à dessiner du fond au dessus : les invisibles d'abord, puis derrière, milieu, devant, et celle qui entre tout dessus.
const depthOf = (rank: number): number => (rank === ENTERING_RANK ? -1 : rank);

export const archiveAt = (timeMs: number): ArchiveMoment => {
  const local = loopTime(timeMs, ARCHIVE_LOOP_MS);
  const step = Math.floor(local / ARCHIVE_STEP_MS);
  const progress = clamp(
    (local - step * ARCHIVE_STEP_MS - (ARCHIVE_STEP_MS - ARCHIVE_MOVE_MS)) / ARCHIVE_MOVE_MS,
  );
  const indexes = Array.from({ length: ARCHIVE_COUNT }, (_, canvas) => canvas);
  return {
    canvases: indexes.map((canvas) => archiveCanvasAt(canvas, step, progress)),
    // L'ordre ne change qu'à une étape, quand celle qui part derrière est déjà invisible.
    order: [...indexes].sort((first, second) => depthOf(rankAt(second, step)) - depthOf(rankAt(first, step))),
  };
};

// Le fond : le choix du fond de la section Fresque (transparent, noir, blanc) puis l'image, qui se pose par-dessus n'importe quel
// fond. Quatre états de 1,2 s : la sélection passe à l'option suivante, l'aperçu change en fondu court, un arrêt entre deux.
export const BACKGROUND_OPTIONS = ["transparent", "black", "white", "image"] as const;
const BACKGROUND_STATE_MS = 1200;
const BACKGROUND_FADE_MS = 300;
// L'image fixe : l'image posée sur le fond blanc, la sélection sur elle.
export const BACKGROUND_RESTING_MS = 3 * BACKGROUND_STATE_MS + 700;

// Ce que chaque état montre, en poids de 0 à 1 : le fond noir, le fond blanc, l'image. Transparent, c'est le damier seul. L'image
// se pose sur le fond que l'option d'avant avait laissé : le blanc.
type BackgroundLook = { black: number; white: number; image: number };
const BACKGROUND_LOOKS: readonly BackgroundLook[] = [
  { black: 0, white: 0, image: 0 },
  { black: 1, white: 0, image: 0 },
  { black: 0, white: 1, image: 0 },
  { black: 0, white: 1, image: 1 },
];

export type BackgroundMoment = BackgroundLook & { chosen: number }; // `chosen` : l'option que la sélection marque

const backgroundLook = (state: number): BackgroundLook =>
  BACKGROUND_LOOKS[(state + BACKGROUND_LOOKS.length) % BACKGROUND_LOOKS.length] ?? {
    black: 0,
    white: 0,
    image: 0,
  };

export const backgroundAt = (timeMs: number): BackgroundMoment => {
  const local = loopTime(timeMs);
  const state = Math.floor(local / BACKGROUND_STATE_MS);
  const fade = ease((local - state * BACKGROUND_STATE_MS) / BACKGROUND_FADE_MS);
  const before = backgroundLook(state - 1);
  const now = backgroundLook(state);
  return {
    chosen: state,
    black: lerp(before.black, now.black, fade),
    white: lerp(before.white, now.white, fade),
    image: lerp(before.image, now.image, fade),
  };
};

// Modération facile : la pill Compte, en haut à droite. Un point rouge paraît sur le bouclier, un curseur vient le cliquer, le point
// s'éteint et la liste des signalements s'ouvre dessous ; tout se referme avant la boucle suivante. L'image fixe : le point, rien d'autre.
export const MODERATION_RESTING_MS = 1300;

export type ModerationMoment = {
  dot: number; // le point rouge, de 0 à 1
  cursor: number; // l'opacité du curseur
  approach: number; // de 0 (loin du bouclier) à 1 (dessus)
  press: number; // le bouclier qui s'enfonce au clic
  sheet: number; // la liste des signalements, de 0 (fermée) à 1 (ouverte)
};

export const moderationAt = (timeMs: number): ModerationMoment => {
  const t = loopTime(timeMs);
  return {
    dot: t < 2300 ? spanIn(t, 600, 800) : spanOut(t, 2300, 2500),
    cursor: t < 4000 ? spanIn(t, 1400, 1700) : spanOut(t, 4000, 4300),
    approach: spanIn(t, 1400, 2100),
    press: tap(t, 2200, 2400),
    sheet: t < 4000 ? spanIn(t, 2400, 2700) : spanOut(t, 4000, 4300),
  };
};

// Annuler, refaire : la pill Dessin, en bas au centre d'une mini-fresque, avec ses trois pastilles de couleur et ses trois outils
// (Annuler, Refaire, Vider). Une souris trace trois traits, un champignon (le chapeau, ses points, le pied), en prenant chaque couleur ;
// elle clique Annuler : le pied part ; encore : les points partent ; elle clique Refaire : les points reviennent. Puis le brouillon
// se vide et la boucle repart. L'image fixe : les trois traits posés, Annuler dégrisé, Refaire grisé, sans la souris.
export const UNDO_LOOP_MS = 8400;
export const UNDO_RESTING_MS = 2950;

const STROKE_STARTS_MS = [400, 1300, 2200] as const;
const STROKE_MS = 700;
const FIRST_UNDO_MS = 3800;
const SECOND_UNDO_MS = 4700;
const REDO_MS = 5600;
const CLEAR_FROM_MS = 7600;
const CLEAR_TO_MS = 8000;
const STROKE_FADE_MS = 150;
const TAP_HALF_MS = 80;
const POINTER_FADE_IN_FROM_MS = 250;

// Où la pointe de la souris se pose (pointer-motion.ts) : la pill est ancrée en bas au centre, et ses boutons ne se déplacent pas : leur
// place est un écart par rapport à ce point d'ancrage.
export type UndoPointer = PointerMoment;

const PILL_ANCHOR = { ax: 56, ay: 64 } as const;
const UNDO_BUTTON: PointerSpot = { ...PILL_ANCHOR, bx: 1, by: -10 };
const REDO_BUTTON: PointerSpot = { ...PILL_ANCHOR, bx: 17, by: -10 };

const spotOnStroke = (stroke: DraftStroke, progress: number): PointerSpot => {
  const { x, y } = strokePoint(stroke, progress);
  return { ax: x, ay: y, bx: 0, by: 0 };
};

// Le trajet de la souris, en tronçons qui se suivent.

const EMPTY_STROKE: DraftStroke = { name: "cap", colorIndex: 0, cells: [] };
const firstStroke = DRAFT_STROKES[0] ?? EMPTY_STROKE;
const lastStroke = DRAFT_STROKES.at(-1) ?? EMPTY_STROKE;
const LAST_STROKE_END_MS = (STROKE_STARTS_MS.at(-1) ?? 0) + STROKE_MS;
const TO_UNDO_FROM_MS = LAST_STROKE_END_MS + 200;
const TO_UNDO_UNTIL_MS = FIRST_UNDO_MS - 100;
const TO_REDO_FROM_MS = SECOND_UNDO_MS + 250;
const TO_REDO_UNTIL_MS = SECOND_UNDO_MS + 700;

// Un tronçon par trait, puis un entre deux traits, en ligne droite de la fin de l'un au début de l'autre.
const strokeLegs: Leg[] = DRAFT_STROKES.flatMap((stroke, index): Leg[] => {
  const start = STROKE_STARTS_MS[index] ?? 0;
  const next = DRAFT_STROKES[index + 1];
  const nextStart = STROKE_STARTS_MS[index + 1];
  const sweep: Leg = {
    fromMs: start,
    untilMs: start + STROKE_MS,
    spotAt: (progress) => spotOnStroke(stroke, progress),
  };
  if (!next || nextStart === undefined) return [sweep];
  const travel: Leg = {
    fromMs: start + STROKE_MS,
    untilMs: nextStart,
    spotAt: (progress) => mixSpots(spotOnStroke(stroke, 1), spotOnStroke(next, 0), progress),
  };
  return [sweep, travel];
});

const POINTER_LEGS: readonly Leg[] = [
  // Avant le premier trait, elle attend à son début.
  { fromMs: 0, untilMs: STROKE_STARTS_MS[0], spotAt: () => spotOnStroke(firstStroke, 0) },
  ...strokeLegs,
  // Le dernier trait fini, elle y reste un instant, puis va à Annuler, y reste pour ses deux clics, et va à Refaire.
  {
    fromMs: LAST_STROKE_END_MS,
    untilMs: TO_UNDO_FROM_MS,
    spotAt: () => spotOnStroke(lastStroke, 1),
  },
  {
    fromMs: TO_UNDO_FROM_MS,
    untilMs: TO_UNDO_UNTIL_MS,
    spotAt: (progress) => mixSpots(spotOnStroke(lastStroke, 1), UNDO_BUTTON, ease(progress)),
  },
  { fromMs: TO_UNDO_UNTIL_MS, untilMs: TO_REDO_FROM_MS, spotAt: () => UNDO_BUTTON },
  {
    fromMs: TO_REDO_FROM_MS,
    untilMs: TO_REDO_UNTIL_MS,
    spotAt: (progress) => mixSpots(UNDO_BUTTON, REDO_BUTTON, ease(progress)),
  },
  { fromMs: TO_REDO_UNTIL_MS, untilMs: Number.POSITIVE_INFINITY, spotAt: () => REDO_BUTTON },
];

const pointerSpotAt = (t: number): PointerSpot => spotAmong(POINTER_LEGS, t, UNDO_BUTTON);

// Un trait part au clic d'Annuler qui l'atteint et, s'il revient, au clic de Refaire. Le premier trait ne bouge jamais.
type StrokeFate = { leavesMs?: number; returnsMs?: number };
const STROKE_FATES: readonly StrokeFate[] = [
  {},
  { leavesMs: SECOND_UNDO_MS, returnsMs: REDO_MS },
  { leavesMs: FIRST_UNDO_MS },
];

const strokeOpacity = ({ leavesMs, returnsMs }: StrokeFate, t: number): number => {
  if (leavesMs === undefined) return 1;
  if (returnsMs !== undefined && t >= returnsMs) return spanIn(t, returnsMs, returnsMs + STROKE_FADE_MS);
  return spanOut(t, leavesMs, leavesMs + STROKE_FADE_MS);
};

// Combien de ces instants sont déjà passés.
const passed = (t: number, momentsMs: readonly number[]): number =>
  momentsMs.filter((momentMs) => t >= momentMs).length;

export type UndoMoment = {
  shown: readonly number[]; // pour chaque trait, combien de ses cases la souris a déjà posées
  opacity: readonly number[]; // l'opacité de chaque trait : 0 une fois annulé, de nouveau 1 une fois refait
  armed: number; // la pastille de couleur choisie : celle du trait en cours ou du dernier trait
  canUndo: boolean; // Annuler dégrisé : il reste un trait à annuler
  canRedo: boolean; // Refaire dégrisé : un trait annulé attend
  canDiscard: boolean; // Vider dégrisé : le brouillon n'est pas vide
  undoTap: number; // le bouton qui s'enfonce et s'éclaire au clic, de 0 à 1
  redoTap: number;
  pointer: UndoPointer;
};

export const undoAt = (timeMs: number): UndoMoment => {
  const t = loopTime(timeMs, UNDO_LOOP_MS);
  const isCleared = t >= CLEAR_FROM_MS;
  const finished = passed(
    t,
    STROKE_STARTS_MS.map((start) => start + STROKE_MS),
  );
  const undone = passed(t, [FIRST_UNDO_MS, SECOND_UNDO_MS]) - passed(t, [REDO_MS]);
  const placedStrokes = isCleared ? 0 : finished - undone;
  const keep = 1 - spanIn(t, CLEAR_FROM_MS, CLEAR_TO_MS);
  return {
    shown: DRAFT_STROKES.map((stroke, index) =>
      strokeShown(stroke, (t - (STROKE_STARTS_MS[index] ?? 0)) / STROKE_MS),
    ),
    opacity: STROKE_FATES.map((fate) => strokeOpacity(fate, t) * keep),
    armed: Math.max(0, passed(t, STROKE_STARTS_MS) - 1),
    canUndo: placedStrokes > 0,
    canRedo: !isCleared && undone > 0,
    canDiscard: placedStrokes > 0,
    undoTap: Math.max(
      tap(t, FIRST_UNDO_MS - TAP_HALF_MS, FIRST_UNDO_MS + TAP_HALF_MS),
      tap(t, SECOND_UNDO_MS - TAP_HALF_MS, SECOND_UNDO_MS + TAP_HALF_MS),
    ),
    redoTap: tap(t, REDO_MS - TAP_HALF_MS, REDO_MS + TAP_HALF_MS),
    pointer: {
      ...pointerSpotAt(t),
      opacity: spanIn(t, POINTER_FADE_IN_FROM_MS, STROKE_STARTS_MS[0]) * keep,
    },
  };
};
