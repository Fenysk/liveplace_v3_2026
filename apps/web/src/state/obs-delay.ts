// Le délai de la vue OBS (§9.5, D-08) : ce que le stream montre, et ce qui attend son heure. Le serveur n'en sait rien.
// L'heure d'affichage d'une case (`showAt`) se calcule au moment de vider la file, avec le délai du moment :
// le streamer peut le changer à chaud (JOURNAL 2026-09-25).

import { type Timestamp, toStateOffset } from "@liveplace/domain";
import type { BroadcastCell, CellsFrame, StreamCell } from "@liveplace/protocol";
import type { ArrivedPixel } from "./canvas-store";

// Une case qui attend : sa couleur, sa date de pose, et la version qui l'a mise là.
type WaitingCell = { offset: number; colorIndex: number; placedAt: Timestamp; version: number };

// `shown` est modifiée sur place : 65 536 octets recopiés à chaque frame, ce serait pour rien.
export type ObsQueue = { width: number; shown: Uint8Array; waiting: WaitingCell[] };

export function createObsQueue(width: number, shown: Uint8Array): ObsQueue {
  return { width, shown, waiting: [] };
}

const showAt = (cell: Pick<WaitingCell, "placedAt">, delayMs: number): Timestamp => cell.placedAt + delayMs;

const offsetOf = (queue: ObsQueue, cell: BroadcastCell): number => toStateOffset(cell.x, cell.y, queue.width);

// §9.5 : la case telle que le stream la voit, quand une pose cachée est en jeu.
const streamOf = (cell: BroadcastCell): StreamCell => cell.obs ?? cell;

const toWaiting = (cell: BroadcastCell, offset: number): WaitingCell => {
  const { colorIndex, placedAt } = streamOf(cell);
  return { offset, colorIndex, placedAt, version: cell.version };
};

// Règle 2 : une modération est immédiate, et annule tout ce qui attendait sur sa case. Le pixel revenu paraît tout
// de suite si son propre délai est écoulé ; sinon la case reste vide jusqu'à son heure, car ce qui était montré est
// peut-être justement ce qu'on retire. Un signalement (`hide`) et Rétablir (`unhide`) suivent la même règle.
const clearCell = (
  queue: ObsQueue,
  cell: BroadcastCell,
  offset: number,
  nowMs: Timestamp,
  delayMs: number,
) => {
  queue.waiting = queue.waiting.filter((waiting) => waiting.offset !== offset);
  const shown = streamOf(cell);
  const isShownNow = shown.colorIndex === 0 || showAt(shown, delayMs) <= nowMs;
  queue.shown[offset] = isShownNow ? shown.colorIndex : 0;
  if (!isShownNow) queue.waiting.push(toWaiting(cell, offset));
};

// Règles 1 et 2, pour le flux live comme pour le resync : une pose attend son heure, le reste est immédiat.
// §5.3 : une case d'avant une nouvelle taille peut tomber hors du cadre.
const isInside = (queue: ObsQueue, cell: BroadcastCell): boolean =>
  cell.x < queue.width && offsetOf(queue, cell) < queue.shown.length;

export function queueCells(queue: ObsQueue, frame: CellsFrame, nowMs: Timestamp, delayMs: number): void {
  for (const cell of frame.cells) {
    if (!isInside(queue, cell)) continue;
    const offset = offsetOf(queue, cell);
    if (cell.kind === "place") queue.waiting.push(toWaiting(cell, offset));
    else clearCell(queue, cell, offset, nowMs, delayMs);
  }
}

// Règle 3 : le snapshot montre l'état réel. On revient à l'état d'avant la fenêtre, du plus récent au plus ancien, puis
// on rejoue ses cases par les règles 1 et 2 : comme si la page n'avait jamais été rechargée.
export function queueRecent(queue: ObsQueue, recent: CellsFrame, nowMs: Timestamp, delayMs: number): void {
  for (const cell of [...recent.cells].reverse())
    if (isInside(queue, cell)) queue.shown[offsetOf(queue, cell)] = streamOf(cell).previousColorIndex;
  queueCells(queue, recent, nowMs, delayMs);
}

// Ce qui est dû paraît, dans l'ordre de pose : sur une case, la dernière pose l'emporte. Rend ce qui change l'image du stream,
// un lot par version (la pose d'un joueur), avec la couleur que chaque case montrait : la vue OBS les anime comme le jeu.
// Une modération est immédiate (règle 2) : elle n'y passe jamais.
export function showDueCells(queue: ObsQueue, nowMs: Timestamp, delayMs: number): ArrivedPixel[][] {
  const due = queue.waiting.filter((waiting) => showAt(waiting, delayMs) <= nowMs);
  if (due.length === 0) return [];
  queue.waiting = queue.waiting.filter((waiting) => showAt(waiting, delayMs) > nowMs);
  due.sort((left, right) => left.placedAt - right.placedAt || left.version - right.version);
  const lots = new Map<number, ArrivedPixel[]>();
  for (const { offset, colorIndex, version } of due) {
    const previousColorIndex = queue.shown[offset] ?? 0;
    queue.shown[offset] = colorIndex;
    if (previousColorIndex === colorIndex) continue;
    const lot = lots.get(version) ?? [];
    lot.push({
      x: offset % queue.width,
      y: Math.floor(offset / queue.width),
      colorIndex,
      previousColorIndex,
    });
    lots.set(version, lot);
  }
  return [...lots.values()];
}

// L'heure de la prochaine case à paraître : un seul minuteur pour toute la file.
export function nextShowAt(queue: ObsQueue, delayMs: number): Timestamp | null {
  // Une boucle, pas `Math.min(...)` : avec 10 min de délai sur un canvas animé, la file déborderait la pile.
  let first: WaitingCell | null = null;
  for (const waiting of queue.waiting) if (!first || waiting.placedAt < first.placedAt) first = waiting;
  return first ? showAt(first, delayMs) : null;
}
