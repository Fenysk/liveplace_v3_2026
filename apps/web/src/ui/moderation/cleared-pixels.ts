// Retirer ses pixels (CDC 2026, Inspection ; JOURNAL 2026-09-28) : une pose seule, ses voisines dans une plage
// d'heures, ou tous ses pixels. L'aperçu et l'action se calculent ici, sur les mêmes pixels : ils ne se contredisent pas.

import type { AuthoredPixel } from "@liveplace/domain/ports";
import type { ModerationAction } from "../../state/canvas-store";
import type { SliderStep } from "../design/slider";

const MINUTE = 60_000;

// A2 : un curseur à crans, qui étend la plage avant et après à la fois.
export const CLEAR_SPAN_STEPS: readonly SliderStep[] = [
  { value: 0, label: "Cette pose seule" },
  { value: MINUTE, label: "± 1 min" },
  { value: 5 * MINUTE, label: "± 5 min" },
  { value: 15 * MINUTE, label: "± 15 min" },
  { value: 60 * MINUTE, label: "± 1 h" },
];

// La case « Retirer tous ses pixels », décochée par défaut, et le cran du curseur.
export type ClearScope = { isAll: boolean; spanMs: number };
export const PLACEMENT_ONLY: ClearScope = { isAll: false, spanMs: 0 };

// La pose visée, figée au clic : quelqu'un peut poser sur la case pendant qu'on hésite.
export type ClearTarget = { userId: string; placementId: string };

type Range = { from: number; to: number };

// De la première à la dernière heure visible de la pose, élargie du cran. Sans pixel visible de la pose : aucune.
const rangeOf = (pixels: readonly AuthoredPixel[], placementId: string, spanMs: number): Range | null => {
  let from = Number.POSITIVE_INFINITY;
  let to = Number.NEGATIVE_INFINITY;
  for (const pixel of pixels) {
    if (pixel.placementId !== placementId || pixel.placedAt === undefined) continue;
    from = Math.min(from, pixel.placedAt);
    to = Math.max(to, pixel.placedAt);
  }
  return from <= to ? { from: from - spanMs, to: to + spanMs } : null;
};

const isInRange = ({ placedAt }: AuthoredPixel, range: Range | null): boolean =>
  range !== null && placedAt !== undefined && placedAt >= range.from && placedAt <= range.to;

export function listClearedPixels(
  pixels: readonly AuthoredPixel[],
  { placementId }: ClearTarget,
  { isAll, spanMs }: ClearScope,
): readonly AuthoredPixel[] {
  if (isAll) return pixels;
  const range = spanMs > 0 ? rangeOf(pixels, placementId, spanMs) : null;
  return pixels.filter((pixel) => pixel.placementId === placementId || isInRange(pixel, range));
}

export function toClearAction(
  { userId, placementId }: ClearTarget,
  pixels: readonly AuthoredPixel[],
  { isAll, spanMs }: ClearScope,
): ModerationAction {
  if (isAll) return { action: "clearUser", target: userId };
  const range = spanMs > 0 ? rangeOf(pixels, placementId, spanMs) : null;
  return { action: "clearPlacement", target: userId, placementId, ...(range ? { range } : {}) };
}
