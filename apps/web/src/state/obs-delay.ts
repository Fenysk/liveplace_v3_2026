// Le délai de la vue OBS (§9.5, D-08) : ce que le stream montre, et ce qui attend son heure. Le serveur n'en sait rien.
// L'heure d'affichage d'une case (`showAt`) se calcule au moment de vider la file, avec le délai du moment :
// le streamer peut le changer à chaud (JOURNAL 2026-09-25).

import { type Timestamp, toStateOffset } from "@liveplace/domain";
import type { BroadcastCell, CellsFrame } from "@liveplace/protocol";

// Une case qui attend : sa couleur, sa date de pose, et la version qui l'a mise là.
type WaitingCell = { offset: number; colorIndex: number; placedAt: Timestamp; version: number };

// `shown` est modifiée sur place : 65 536 octets recopiés à chaque frame, ce serait pour rien.
export type ObsQueue = { width: number; shown: Uint8Array; waiting: WaitingCell[] };

export function createObsQueue(width: number, shown: Uint8Array): ObsQueue {
  return { width, shown, waiting: [] };
}

const showAt = (cell: Pick<WaitingCell, "placedAt">, delayMs: number): Timestamp => cell.placedAt + delayMs;

const offsetOf = (queue: ObsQueue, cell: BroadcastCell): number => toStateOffset(cell.x, cell.y, queue.width);

const toWaiting = ({ colorIndex, placedAt, version }: BroadcastCell, offset: number): WaitingCell => ({
  offset,
  colorIndex,
  placedAt,
  version,
});

// Règle 2 : une modération est immédiate, et annule tout ce qui attendait sur sa case. Le pixel revenu paraît tout
// de suite si son propre délai est écoulé ; sinon la case reste vide jusqu'à son heure, car ce qui était montré est
// peut-être justement ce qu'on retire.
const clearCell = (
  queue: ObsQueue,
  cell: BroadcastCell,
  offset: number,
  nowMs: Timestamp,
  delayMs: number,
) => {
  queue.waiting = queue.waiting.filter((waiting) => waiting.offset !== offset);
  const isShownNow = cell.colorIndex === 0 || showAt(cell, delayMs) <= nowMs;
  queue.shown[offset] = isShownNow ? cell.colorIndex : 0;
  if (!isShownNow) queue.waiting.push(toWaiting(cell, offset));
};

// Règles 1 et 2, pour le flux live comme pour le resync : une pose attend son heure, une modération est immédiate.
export function queueCells(queue: ObsQueue, frame: CellsFrame, nowMs: Timestamp, delayMs: number): void {
  for (const cell of frame.cells) {
    const offset = offsetOf(queue, cell);
    if (cell.kind === "clear") clearCell(queue, cell, offset, nowMs, delayMs);
    else queue.waiting.push(toWaiting(cell, offset));
  }
}

// Règle 3 : le snapshot montre l'état réel. On revient à l'état d'avant la fenêtre, du plus récent au plus ancien, puis
// on rejoue ses cases par les règles 1 et 2 : comme si la page n'avait jamais été rechargée.
export function queueRecent(queue: ObsQueue, recent: CellsFrame, nowMs: Timestamp, delayMs: number): void {
  for (const cell of [...recent.cells].reverse())
    queue.shown[offsetOf(queue, cell)] = cell.previousColorIndex;
  queueCells(queue, recent, nowMs, delayMs);
}

// Ce qui est dû paraît, dans l'ordre de pose : sur une case, la dernière pose l'emporte. Rend le nombre de cases.
export function showDueCells(queue: ObsQueue, nowMs: Timestamp, delayMs: number): number {
  const due = queue.waiting.filter((waiting) => showAt(waiting, delayMs) <= nowMs);
  if (due.length === 0) return 0;
  queue.waiting = queue.waiting.filter((waiting) => showAt(waiting, delayMs) > nowMs);
  due.sort((left, right) => left.placedAt - right.placedAt || left.version - right.version);
  for (const { offset, colorIndex } of due) queue.shown[offset] = colorIndex;
  return due.length;
}

// L'heure de la prochaine case à paraître : un seul minuteur pour toute la file.
export function nextShowAt(queue: ObsQueue, delayMs: number): Timestamp | null {
  // Une boucle, pas `Math.min(...)` : avec 10 min de délai sur un canvas animé, la file déborderait la pile.
  let first: WaitingCell | null = null;
  for (const waiting of queue.waiting) if (!first || waiting.placedAt < first.placedAt) first = waiting;
  return first ? showAt(first, delayMs) : null;
}
