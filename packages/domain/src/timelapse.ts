// Le rejeu de l'historique d'une fresque en changements de cases, pour le GIF timelapse du développeur (JOURNAL 2026-11-11).
// Le flux et les chunks gardent les coordonnées du cadre de chaque pose : une taille dynamique qui grandit à gauche ou en haut
// décale les pixels sans rien y écrire. Les piles `hist:` portent la version de chaque pixel dans le cadre d'aujourd'hui.

import type { EventCell } from "@liveplace/protocol";
import type { Result } from "@liveplace/shared";
import type { ChunkEntry } from "./chunk";
import { type CanvasCorner, type CanvasSize, cellAt, toCell, toCellKey } from "./index";
import {
  isCovered,
  type PileEntry,
  type Tombstones,
  toEntryPlacementKey,
  toFrameStateOffset,
} from "./snapshot";

export const MAX_TIMELAPSE_CHANGES = 5_000_000;

const MAX_SHIFT_SAMPLES = 64; // entrées de pile lues par pose pour trouver son décalage
const MAX_TIED_SHIFTS = 16;
const SHIFT_BASE = 1 << 17; // un décalage va de -65 535 à 65 535 : décalé de BASE, il tient dans un entier
const SHIFT_SPAN = 1 << 18;
const COLOR_RANGE = 256; // un changement : `stateOffset × 256 + colorIndex`
const APPLIED = 1; // la pose n'est pas effacée par la modération
const DECIDED = 2; // son décalage est le seul qui coïncide le plus avec les piles

// Une pile : ses entrées de la plus récente à la plus ancienne ; sa clé est une case de la grille fixe.
export type TimelapsePile = { cellKey: number; entries: readonly PileEntry[] };

// Ce que Redis dit d'une fresque, lu ensemble : son cadre (taille et coin sur la grille) et son image (`state`) à `maxVersion`, ses
// piles et sa modération.
export type TimelapseFrame = {
  size: CanvasSize;
  corner: CanvasCorner;
  state: Uint8Array;
  maxVersion: number;
  piles: readonly TimelapsePile[];
  tombstones: Tombstones;
};

// `initial` : l'image du départ ; `changes` : chaque changement effectif, `stateOffset << 8 | colorIndex`, dans l'ordre.
// La dernière image, `initial` suivie de tous les changements, est exactement `state`.
export type Timelapse = { width: number; height: number; initial: Uint8Array; changes: Uint32Array };

export type TimelapseRefusal = "too_many_changes" | "no_changes";

type PileTarget = { x: number; y: number; cellKey: number; colorIndex: number; version: number };
type Shift = { dx: number; dy: number };
const NO_SHIFT: Shift = { dx: 0, dy: 0 };

// Une case qui change à une version : `previousColorIndex` est null pour un changement venu d'une pile.
type Step = {
  version: number;
  stateOffset: number;
  colorIndex: number;
  previousColorIndex: number | null;
  isApplied: boolean;
};

// Une colonne de nombres qui grandit : cinq millions de cases tiennent en 30 Mo, là où des tableaux en prendraient quatre fois plus.
const createColumn = <Values extends Uint8Array | Uint32Array>(make: (length: number) => Values) => {
  let values = make(1024);
  let size = 0;
  return {
    push(value: number): void {
      if (size === values.length) {
        const wider = make(size * 2);
        wider.set(values);
        values = wider;
      }
      values[size++] = value;
    },
    at: (index: number): number => values[index] ?? 0,
    size: (): number => size,
  };
};

// Les entrées visibles des piles (jamais celles que la modération couvre), par version : de quoi retrouver où une pose se montre.
const indexPiles = ({ piles, tombstones, maxVersion, corner }: TimelapseFrame) => {
  const targets: PileTarget[] = [];
  const byVersion = new Map<number, PileTarget[]>();
  for (const { cellKey, entries } of piles) {
    const { x, y } = cellAt(corner, cellKey);
    for (const entry of entries) {
      if (entry.version > maxVersion || isCovered(entry, toEntryPlacementKey(entry), tombstones)) continue;
      const target = { x, y, cellKey, colorIndex: entry.colorIndex, version: entry.version };
      targets.push(target);
      const bucket = byVersion.get(entry.version);
      if (bucket) bucket.push(target);
      else byVersion.set(entry.version, [target]);
    }
  }
  return { targets, byVersion };
};

// Le décalage qui fait coïncider le plus de cases de la pose (position et couleur) avec les entrées de pile de sa version :
// chaque paire (case de la pose, entrée de même couleur) vote pour le décalage qui les superpose.
const bestShifts = (
  bucket: readonly PileTarget[],
  cells: { start: number; end: number },
  at: { cellKey(index: number): number; colorIndex(index: number): number },
): Shift[] => {
  const votes = new Map<number, number>();
  for (const target of bucket.slice(0, MAX_SHIFT_SAMPLES)) {
    for (let index = cells.start; index < cells.end; index++) {
      if (at.colorIndex(index) !== target.colorIndex) continue;
      const { x, y } = toCell(at.cellKey(index));
      const key = (target.x - x + SHIFT_BASE) * SHIFT_SPAN + (target.y - y + SHIFT_BASE);
      votes.set(key, (votes.get(key) ?? 0) + 1);
    }
  }
  let most = 0;
  for (const count of votes.values()) most = Math.max(most, count);
  return [...votes]
    .filter(([, count]) => count === most)
    .slice(0, MAX_TIED_SHIFTS)
    .map(([key]) => ({ dx: Math.floor(key / SHIFT_SPAN) - SHIFT_BASE, dy: (key % SHIFT_SPAN) - SHIFT_BASE }));
};

// Le voisin décidé le plus proche en version, avant ou après (le premier à égalité) ; -1 : aucun.
const nearestDecided = (
  versions: readonly number[],
  isDecided: (index: number) => boolean,
): ((index: number) => number) => {
  const before: number[] = [];
  const after: number[] = [];
  let found = -1;
  for (const index of versions.keys()) {
    if (isDecided(index)) found = index;
    before[index] = found;
  }
  found = -1;
  for (const index of [...versions.keys()].reverse()) {
    if (isDecided(index)) found = index;
    after[index] = found;
  }
  return (index) => {
    const behind = before[index] ?? -1;
    const ahead = after[index] ?? -1;
    if (behind < 0 || ahead < 0) return Math.max(behind, ahead);
    const version = versions[index] ?? 0;
    return version - (versions[behind] ?? 0) <= (versions[ahead] ?? 0) - version ? behind : ahead;
  };
};

// Entre plusieurs décalages qui se valent, celui du voisin ; sinon le premier. Sans candidat : celui du voisin, ou aucun.
const pickShift = (candidates: readonly Shift[], neighbor: Shift | undefined): Shift =>
  candidates.find(({ dx, dy }) => dx === neighbor?.dx && dy === neighbor?.dy) ??
  candidates[0] ??
  neighbor ??
  NO_SHIFT;

// D-15 : la case de la pose (sa position de page d'alors), décalée vers la page d'aujourd'hui, ou `null` si elle sort du cadre.
const shiftedStateOffset = (cellKey: number, { dx, dy }: Shift, size: CanvasSize): number | null => {
  const { x, y } = toCell(cellKey);
  return toFrameStateOffset({ x: x + dx, y: y + dy }, size);
};

// Les événements retenus, en colonnes, avec le décalage de chacun.
const createEventLog = (size: CanvasSize) => {
  const positions = createColumn((length) => new Uint32Array(length));
  const colorIndexes = createColumn((length) => new Uint8Array(length));
  const previousColorIndexes = createColumn((length) => new Uint8Array(length));
  const versions: number[] = [];
  const starts: number[] = [];
  const flags: number[] = [];
  const shifts: Shift[] = [];
  const tied = new Map<number, Shift[]>();
  const isFlagged = (index: number, flag: number): boolean => ((flags[index] ?? 0) & flag) !== 0;
  const endOf = (index: number): number => starts[index + 1] ?? positions.size();

  return {
    cellCount: (): number => positions.size(),

    append(version: number, isApplied: boolean, cells: readonly EventCell[]): number {
      starts.push(positions.size());
      for (const cell of cells) {
        positions.push(toCellKey(cell.x, cell.y));
        colorIndexes.push(cell.colorIndex);
        previousColorIndexes.push(cell.previousColorIndex);
      }
      versions.push(version);
      flags.push(isApplied ? APPLIED : 0);
      shifts.push(NO_SHIFT);
      return versions.length - 1;
    },

    // Où les entrées de pile de sa version disent que la pose se montre aujourd'hui.
    findShifts(index: number, bucket: readonly PileTarget[]): void {
      const range = { start: starts[index] ?? 0, end: endOf(index) };
      const found = bestShifts(bucket, range, { cellKey: positions.at, colorIndex: colorIndexes.at });
      shifts[index] = found[0] ?? NO_SHIFT;
      if (found.length === 1) flags[index] = (flags[index] ?? 0) | DECIDED;
      if (found.length > 1) tied.set(index, found);
    },

    // Une pose sans entrée connue, ou à égalité, et un retrait prennent le décalage de la pose décidée la plus proche en version.
    resolveShifts(): void {
      const nearest = nearestDecided(versions, (index) => isFlagged(index, DECIDED));
      for (const index of versions.keys())
        if (!isFlagged(index, DECIDED))
          shifts[index] = pickShift(tied.get(index) ?? [], shifts[nearest(index)]);
    },

    *steps(): Generator<Step> {
      for (const [index, version] of versions.entries()) {
        const shift = shifts[index] ?? NO_SHIFT;
        const isApplied = isFlagged(index, APPLIED);
        for (let at = starts[index] ?? 0; at < endOf(index); at++) {
          const stateOffset = shiftedStateOffset(positions.at(at), shift, size);
          const [colorIndex, previousColorIndex] = [colorIndexes.at(at), previousColorIndexes.at(at)];
          if (stateOffset !== null) yield { version, stateOffset, colorIndex, previousColorIndex, isApplied };
        }
      }
    },
  };
};

// Les entrées de pile qu'aucun événement connu ne porte (une fresque récupérée) deviennent des changements à leur version.
const listPileChanges = (
  targets: readonly PileTarget[],
  knownVersions: ReadonlySet<number>,
  { size, corner }: Pick<TimelapseFrame, "size" | "corner">,
): Step[] =>
  targets
    .filter(({ version }) => !knownVersions.has(version))
    .flatMap(({ cellKey, colorIndex, version }): Step[] => {
      const stateOffset = toFrameStateOffset(cellAt(corner, cellKey), size);
      return stateOffset === null
        ? []
        : [{ version, stateOffset, colorIndex, previousColorIndex: null, isApplied: true }];
    })
    .sort((left, right) => left.version - right.version || left.stateOffset - right.stateOffset);

function* mergeSteps(events: Iterable<Step>, pileChanges: readonly Step[]): Generator<Step> {
  let next = 0;
  for (const step of events) {
    for (let pile = pileChanges[next]; pile && pile.version < step.version; pile = pileChanges[++next])
      yield pile;
    yield step;
  }
  yield* pileChanges.slice(next);
}

// Une case sans événement garde sa couleur d'aujourd'hui ; sinon son départ est le `previousColorIndex` de son premier événement,
// effacé compris, ou le transparent quand seule une pile la raconte.
const startingImage = (state: Uint8Array, steps: Iterable<Step>): Uint8Array => {
  const initial = state.slice();
  const touched = new Uint8Array(state.length);
  for (const { stateOffset, previousColorIndex } of steps) {
    if (touched[stateOffset]) continue;
    touched[stateOffset] = 1;
    initial[stateOffset] = previousColorIndex ?? 0;
  }
  return initial;
};

// Les changements effectifs des poses non effacées, puis la correction : la dernière image est `state`.
const collectChanges = (
  initial: Uint8Array,
  steps: Iterable<Step>,
  state: Uint8Array,
  maxChanges: number,
) => {
  const shown = initial.slice();
  const changes = createColumn((length) => new Uint32Array(length));
  const show = (stateOffset: number, colorIndex: number): void => {
    if (shown[stateOffset] === colorIndex) return;
    shown[stateOffset] = colorIndex;
    if (changes.size() <= maxChanges) changes.push(stateOffset * COLOR_RANGE + colorIndex);
  };
  for (const { stateOffset, colorIndex, isApplied } of steps) if (isApplied) show(stateOffset, colorIndex);
  for (const [stateOffset, colorIndex] of state.entries()) show(stateOffset, colorIndex);
  return changes;
};

const isPoseCovered = (
  {
    version,
    placementId,
    authorId,
    occurredAt,
  }: { version: number; placementId: string | null; authorId: string | null; occurredAt: number },
  tombstones: Tombstones,
): boolean => {
  const pose: PileEntry = {
    authorId: authorId ?? "",
    colorIndex: 0,
    placedAt: occurredAt,
    version,
    ...(placementId === null ? {} : { placementId }),
  };
  return isCovered(pose, toEntryPlacementKey(pose), tombstones);
};

// Ce que le constructeur retient d'un événement à l'autre.
type Intake = {
  frame: TimelapseFrame;
  maxChanges: number;
  piled: ReturnType<typeof indexPiles>;
  log: ReturnType<typeof createEventLog>;
  knownVersions: Set<number>;
  lastVersion: number;
  isTooBig: boolean;
};

// `hide` et `unhide` ne concernent que la vue OBS, un `ban` n'a aucune case.
const hasCellsToReplay = ({ kind, cells }: ChunkEntry[2]): boolean =>
  (kind === "place" || kind === "clear") && cells.length > 0;

// Un événement dans l'ordre des versions : une pose se place par les piles, un retrait attend ses voisines.
function admit(intake: Intake, [version, placementId, event]: ChunkEntry): void {
  const { frame, log, piled, knownVersions } = intake;
  if (intake.isTooBig || version <= intake.lastVersion || version > frame.maxVersion) return;
  intake.lastVersion = version;
  if (!hasCellsToReplay(event)) return;
  intake.isTooBig = log.cellCount() + event.cells.length > intake.maxChanges;
  if (intake.isTooBig) return;
  const isPlace = event.kind === "place";
  if (isPlace) knownVersions.add(version);
  const isApplied = !isPlace || !isPoseCovered({ ...event, placementId }, frame.tombstones);
  const index = log.append(version, isApplied, event.cells);
  const bucket = isPlace && isApplied ? piled.byVersion.get(version) : undefined;
  if (bucket) log.findShifts(index, bucket);
}

function conclude(intake: Intake): Result<Timelapse, TimelapseRefusal> {
  const { frame, log, piled, knownVersions, maxChanges } = intake;
  if (intake.isTooBig) return { ok: false, error: "too_many_changes" };
  log.resolveShifts();
  const pileChanges = listPileChanges(piled.targets, knownVersions, frame);
  const steps = () => mergeSteps(log.steps(), pileChanges);
  const initial = startingImage(frame.state, steps());
  const changes = collectChanges(initial, steps(), frame.state, maxChanges);
  if (changes.size() > maxChanges) return { ok: false, error: "too_many_changes" };
  if (changes.size() === 0) return { ok: false, error: "no_changes" };
  const { width, height } = frame.size;
  const list = Uint32Array.from({ length: changes.size() }, (_, index) => changes.at(index));
  return { ok: true, value: { width, height, initial, changes: list } };
}

export function createTimelapseBuilder(frame: TimelapseFrame, maxChanges = MAX_TIMELAPSE_CHANGES) {
  const intake: Intake = {
    frame,
    maxChanges,
    piled: indexPiles(frame),
    log: createEventLog(frame.size),
    knownVersions: new Set(),
    lastVersion: 0,
    isTooBig: false,
  };
  return {
    add: (entry: ChunkEntry): void => admit(intake, entry),
    finish: (): Result<Timelapse, TimelapseRefusal> => conclude(intake),
    lastVersion: (): number => intake.lastVersion,
    // L'historique dépasse la limite : lire la suite ne sert plus à rien.
    isFull: (): boolean => intake.isTooBig,
  };
}
