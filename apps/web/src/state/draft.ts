// Le brouillon (CDC 2026, écart §9.3, JOURNAL 2026-09-24) : les cases choisies, pas encore posées, et ses règles.
// Pur : ni navigateur, ni réseau. Un brouillon ne se modifie jamais, chaque règle en rend un nouveau.

import { type CellKey, TRANSPARENT_COLOR_INDEX, toCellKey } from "@liveplace/domain";
import type { AckFrame } from "@liveplace/domain/ports";
import type { Pixel } from "./canvas-store";

// Une case par clé, dans l'ordre où elles ont été choisies : c'est l'ordre d'envoi.
export type Draft = ReadonlyMap<CellKey, Pixel>;

// Ce que le brouillon doit savoir du canvas : les charges prévues, et la couleur posée sous une case.
export type DraftContext = { charges: number; colorIndexAt(x: number, y: number): number };

// `isCapped` : une case n'a pas pu entrer, faute de charges. La jauge vibre.
export type DraftEdit = { draft: Draft; isCapped: boolean };

export const EMPTY_DRAFT: Draft = new Map();

export const BATCH_MAX = 64; // pixels d'une frame `place` (§4.2)

const unchanged = (draft: Draft): DraftEdit => ({ draft, isCapped: false });

const isErasingNothing = (pixel: Pixel, context: DraftContext): boolean =>
  pixel.colorIndex === TRANSPARENT_COLOR_INDEX &&
  context.colorIndexAt(pixel.x, pixel.y) === TRANSPARENT_COLOR_INDEX;

const withPixel = (draft: Draft, pixel: Pixel): Draft =>
  new Map(draft).set(toCellKey(pixel.x, pixel.y), pixel);

// Un clic ou un tap : une case du brouillon en sort, quelle que soit la couleur active ; sinon elle entre.
export function toggleDraftCell(draft: Draft, pixel: Pixel, context: DraftContext): DraftEdit {
  const key = toCellKey(pixel.x, pixel.y);
  if (draft.has(key)) {
    const next = new Map(draft);
    next.delete(key);
    return unchanged(next);
  }
  if (isErasingNothing(pixel, context)) return unchanged(draft);
  if (draft.size >= context.charges) return { draft, isCapped: true };
  return unchanged(withPixel(draft, pixel));
}

// Un tracé n'ajoute que des cases neuves : il ne retire ni ne recolore jamais une case du brouillon.
export function traceDraftCells(draft: Draft, pixels: readonly Pixel[], context: DraftContext): DraftEdit {
  let next = draft;
  for (const pixel of pixels) {
    if (next.has(toCellKey(pixel.x, pixel.y)) || isErasingNothing(pixel, context)) continue;
    if (next.size >= context.charges) return { draft: next, isCapped: true };
    next = withPixel(next, pixel);
  }
  return unchanged(next);
}

export function toBatches(draft: Draft): Pixel[][] {
  const pixels = [...draft.values()];
  const batches: Pixel[][] = [];
  for (let start = 0; start < pixels.length; start += BATCH_MAX)
    batches.push(pixels.slice(start, start + BATCH_MAX));
  return batches;
}

// L'`index` d'un refus est la place du pixel dans son lot, jamais dans le brouillon.
export function settleBatch(draft: Draft, batch: readonly Pixel[], ack: Pick<AckFrame, "rejected">): Draft {
  const rejected = new Set(ack.rejected.map(({ index }) => index));
  const next = new Map(draft);
  batch.forEach((pixel, index) => {
    if (!rejected.has(index)) next.delete(toCellKey(pixel.x, pixel.y));
  });
  return next;
}
