// L'axe du temps de l'historique de la capacité (écart §4.3, JOURNAL 2026-10-07) : celui de l'activité, des créneaux réguliers
// du plus ancien au plus récent. Un point absent laisse son créneau vide, et un maillon qui n'avait rien mesuré laisse un
// trou dans sa seule courbe : on ne comble pas.

import type { ActivityPeriod, Timestamp } from "@liveplace/domain";
import { CAPACITY_LINKS } from "@liveplace/domain/capacity";
import type { CapacityPoint } from "@liveplace/domain/ports";
import type { ChartSlot, TimeChartLine } from "../design/time-charts";
import { slotTitle } from "./activity-labels";
import { toTimeAxis } from "./activity-slots";
import { formatRate, LINK_LABELS } from "./capacity-labels";

// Un taux se lit sur 100 % : un taux de 3 % reste près du sol, un taux de 140 % dépasse l'échelle.
const toRatioLine = (title: string): TimeChartLine => ({
  title,
  countLabel: (ratio) => `${title} ${formatRate(ratio)}`,
  scaleMax: 100,
  maxLabel: (max) => `max ${formatRate(max)}`,
  emptyLabel: `${title} : sans mesure`,
});

// La saturation, puis le plus haut taux de chaque maillon, dans l'ordre des valeurs de chaque créneau.
export const CAPACITY_LINES: readonly TimeChartLine[] = [
  toRatioLine("Saturation"),
  ...CAPACITY_LINKS.map((link) => toRatioLine(LINK_LABELS[link])),
];

export function toCapacitySlots(
  points: readonly CapacityPoint[],
  period: ActivityPeriod,
  nowMs: Timestamp,
): ChartSlot[] {
  const first = points[0];
  const last = points.at(-1);
  const axis = toTimeAxis(first && last ? { firstAt: first.at, lastAt: last.at } : null, period, nowMs);
  if (!axis) return [];
  const slots: ChartSlot[] = Array.from({ length: axis.count }, () => null);
  for (const point of points) {
    const index = Math.round((point.at - axis.firstAt) / axis.stepMs);
    if (index >= 0 && index < axis.count)
      slots[index] = {
        title: slotTitle(point.at, period),
        values: [point.saturation, ...CAPACITY_LINKS.map((link) => point[link] ?? null)],
      };
  }
  return slots;
}
