// Retirer ses pixels (CDC 2026, Inspection ; JOURNAL 2026-09-28) : une pose seule, ses voisines dans une plage
// d'heures, ou tous ses pixels. Signaler prend la même plage (JOURNAL 2026-09-29). L'aperçu et l'action se calculent
// ici, sur les mêmes pixels : ils ne se contredisent pas.

import type { AuthoredPixel } from "@liveplace/domain/ports";
import type { ModerationAction } from "../../state/canvas-store";
import type { SliderStep } from "../design/slider";
import type { Locale } from "../locale/locale";
import { MODERATION_TEXTS } from "./moderation-texts";

const MINUTE = 60_000;

// A2 : un curseur à crans, qui étend la plage avant et après à la fois. Le cran 0 porte le libellé de ce qu'il vise.
const clearSpanStepsOf = (zeroLabel: string): readonly SliderStep[] => [
  { value: 0, label: zeroLabel },
  { value: MINUTE, label: "± 1 min" },
  { value: 5 * MINUTE, label: "± 5 min" },
  { value: 15 * MINUTE, label: "± 15 min" },
  { value: 60 * MINUTE, label: "± 1 h" },
];

// Une ligne de plusieurs poses n'a pas de « pose seule » : son cran 0 les retire toutes (JOURNAL 2026-10-07).
export const clearSpanSteps = (placementCount: number, locale: Locale): readonly SliderStep[] =>
  clearSpanStepsOf(
    placementCount > 1
      ? MODERATION_TEXTS[locale].spanReportedPlacements
      : MODERATION_TEXTS[locale].spanPlacementOnly,
  );

// La case « Retirer tous ses pixels », décochée par défaut, et le cran du curseur.
export type ClearScope = { isAll: boolean; spanMs: number };
export const PLACEMENT_ONLY: ClearScope = { isAll: false, spanMs: 0 };

// La pose visée, figée au clic : quelqu'un peut poser sur la case pendant qu'on hésite. `placementIds` : une ligne de
// signalements, toutes ses poses (JOURNAL 2026-10-07) ; absent, `placementId` seule.
export type ClearTarget = { userId: string; placementId: string; placementIds?: readonly string[] };

type Range = { from: number; to: number };

const placementIdsOf = ({ placementId, placementIds }: Omit<ClearTarget, "userId">): readonly string[] =>
  placementIds ?? [placementId];

const isOfPlacements = ({ placementId }: AuthoredPixel, placementIds: readonly string[]): boolean =>
  placementId !== undefined && placementIds.includes(placementId);

// De la première à la dernière heure visible de ces poses, élargie du cran. Sans pixel visible d'elles : aucune.
export function toPlacementRange(
  pixels: readonly AuthoredPixel[],
  placementIds: readonly string[],
  spanMs: number,
): Range | null {
  let from = Number.POSITIVE_INFINITY;
  let to = Number.NEGATIVE_INFINITY;
  for (const pixel of pixels) {
    if (!isOfPlacements(pixel, placementIds) || pixel.placedAt === undefined) continue;
    from = Math.min(from, pixel.placedAt);
    to = Math.max(to, pixel.placedAt);
  }
  return from <= to ? { from: from - spanMs, to: to + spanMs } : null;
}

const isInRange = ({ placedAt }: AuthoredPixel, range: Range | null): boolean =>
  range !== null && placedAt !== undefined && placedAt >= range.from && placedAt <= range.to;

export function listClearedPixels(
  pixels: readonly AuthoredPixel[],
  target: Omit<ClearTarget, "userId">,
  { isAll, spanMs }: ClearScope,
): readonly AuthoredPixel[] {
  if (isAll) return pixels;
  const placementIds = placementIdsOf(target);
  const range = spanMs > 0 ? toPlacementRange(pixels, placementIds, spanMs) : null;
  return pixels.filter((pixel) => isOfPlacements(pixel, placementIds) || isInRange(pixel, range));
}

// De la plus ancienne à la plus récente, d'après ses pixels visibles ; sans pixel visible, d'abord. Une pose enterrée
// part avant celle qui la recouvre : la preuve d'un ban garde ce que le stream montrait (JOURNAL 2026-10-07).
const oldestFirst = (placementIds: readonly string[], pixels: readonly AuthoredPixel[]): string[] => {
  const placedAtOf = new Map<string, number>();
  for (const { placementId, placedAt } of pixels) {
    if (placementId === undefined || placedAt === undefined) continue;
    placedAtOf.set(placementId, Math.min(placedAtOf.get(placementId) ?? placedAt, placedAt));
  }
  return [...placementIds].sort((a, b) => (placedAtOf.get(a) ?? 0) - (placedAtOf.get(b) ?? 0));
};

// Une action par pose, pour que chacune entre dans `cleared:placements`, même recouverte. La plage, une fois, sur la
// première : elle couvre toute la ligne, les suivantes ne font que poser la pierre de leur pose (JOURNAL 2026-10-07).
export function toClearActions(
  target: ClearTarget,
  pixels: readonly AuthoredPixel[],
  { isAll, spanMs }: ClearScope,
): ModerationAction[] {
  if (isAll) return [{ action: "clearUser", target: target.userId }];
  const placementIds = placementIdsOf(target);
  const range = spanMs > 0 ? toPlacementRange(pixels, placementIds, spanMs) : null;
  return oldestFirst(placementIds, pixels).map((placementId, index) => ({
    action: "clearPlacement",
    target: target.userId,
    placementId,
    ...(range && index === 0 ? { range } : {}),
  }));
}
