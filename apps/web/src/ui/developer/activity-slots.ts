// L'axe du temps de l'historique (écart §4.3, JOURNAL 2026-10-06) : des créneaux réguliers, du plus ancien au plus
// récent, comme le gateway écrit ses points. Un point absent laisse son créneau vide : la courbe y fait un trou.

import {
  type ActivityPeriod,
  HOUR_MS,
  MINUTE_MS,
  type Timestamp,
  toHourStart,
  toMinuteStart,
} from "@liveplace/domain";
import type { ActivityPoint } from "@liveplace/domain/ports";
import type { ChartSlot, TimeChartLine } from "../design/time-charts";
import {
  connectedPeopleLabel,
  placedPixelsLabel,
  signupsLabel,
  slotTitle,
  streamedCanvasesLabel,
} from "./activity-labels";

const DAY_MS = 24 * HOUR_MS;

// Les quatre courbes, de haut en bas, dans l'ordre des valeurs de chaque créneau : leur titre, et leur valeur accordée
// dans l'infobulle.
export const CHART_LINES: readonly TimeChartLine[] = [
  { title: "Personnes connectées", countLabel: connectedPeopleLabel },
  { title: "Canvas streamés", countLabel: streamedCanvasesLabel },
  { title: "Pixels posés", countLabel: placedPixelsLabel },
  { title: "Nouveaux comptes", countLabel: signupsLabel },
];

export const CHART_LABELS = CHART_LINES.map(({ title }) => title);

type TimeAxis = { firstAt: Timestamp; stepMs: number; count: number };

// 24 h : jusqu'à la dernière minute écoulée. 30 jours : jusqu'à l'heure en cours. Tout : du premier jour au dernier.
const toTimeAxis = (
  points: readonly ActivityPoint[],
  period: ActivityPeriod,
  nowMs: Timestamp,
): TimeAxis | null => {
  if (period === "day")
    return { firstAt: toMinuteStart(nowMs) - 1440 * MINUTE_MS, stepMs: MINUTE_MS, count: 1440 };
  if (period === "month") return { firstAt: toHourStart(nowMs) - 719 * HOUR_MS, stepMs: HOUR_MS, count: 720 };
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return null;
  return { firstAt: first.at, stepMs: DAY_MS, count: Math.round((last.at - first.at) / DAY_MS) + 1 };
};

// L'arrondi range chaque point dans son créneau, même un jour de Paris de 23 ou 25 heures.
export function toActivitySlots(
  points: readonly ActivityPoint[],
  period: ActivityPeriod,
  nowMs: Timestamp,
): ChartSlot[] {
  const axis = toTimeAxis(points, period, nowMs);
  if (!axis) return [];
  const slots: ChartSlot[] = Array.from({ length: axis.count }, () => null);
  for (const { at, people, streamed, pixels, signups } of points) {
    const index = Math.round((at - axis.firstAt) / axis.stepMs);
    if (index >= 0 && index < axis.count)
      slots[index] = { title: slotTitle(at, period), values: [people, streamed, pixels, signups] };
  }
  return slots;
}
