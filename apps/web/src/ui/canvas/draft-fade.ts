// L'apparition des cases du brouillon : lesquelles entrent en fondu quand le brouillon change.
// Pur : la scène lit `--lp-dur-fast` et mène les images.

import type { CellKey } from "@liveplace/domain";
import type { Draft } from "../../state/draft";

// Au-delà, les cases suivantes paraissent d'un coup : un gros collage ne charge pas les images.
export const MAX_DRAFT_FADES = 200;

// `from` : l'ancienne couleur d'une case repeinte, nul pour une case neuve.
export type DraftFadeStart = { key: CellKey; from: number | null };

// Les cases neuves ou repeintes, dans l'ordre du brouillon, au plus `room`. Une case retirée n'en est jamais : elle part d'un coup.
export function draftFadeStarts(previous: Draft, next: Draft, room: number): DraftFadeStart[] {
  const starts: DraftFadeStart[] = [];
  for (const [key, { colorIndex }] of next) {
    if (starts.length >= room) break;
    const before = previous.get(key);
    if (before?.colorIndex !== colorIndex) starts.push({ key, from: before?.colorIndex ?? null });
  }
  return starts;
}
