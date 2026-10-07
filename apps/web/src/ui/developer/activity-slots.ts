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
  activeAccountsLabel,
  activePlayersLabel,
  activeStreamersLabel,
  connectedPeopleLabel,
  placedPixelsLabel,
  signupsLabel,
  slotTitle,
  streamedCanvasesLabel,
  visitMinutesLabel,
  visitsLabel,
} from "./activity-labels";

const DAY_MS = 24 * HOUR_MS;

// Les six courbes, de haut en bas, dans l'ordre des valeurs de chaque créneau : leur titre, et leur valeur accordée
// dans l'infobulle. Les visites et le temps passé suivent les personnes (JOURNAL 2026-10-07).
export const CHART_LINES: readonly TimeChartLine[] = [
  { title: "Personnes connectées", countLabel: connectedPeopleLabel },
  { title: "Visites", countLabel: visitsLabel },
  { title: "Temps passé (min)", countLabel: visitMinutesLabel },
  { title: "Canvas streamés", countLabel: streamedCanvasesLabel },
  { title: "Pixels posés", countLabel: placedPixelsLabel },
  { title: "Nouveaux comptes", countLabel: signupsLabel },
];

export const CHART_LABELS = CHART_LINES.map(({ title }) => title);

// Tout seulement : les distincts de chaque jour, que les points d'une heure ou d'une minute ne gardent pas.
const ALL_CHART_LINES: readonly TimeChartLine[] = [
  ...CHART_LINES,
  { title: "Comptes actifs", countLabel: activeAccountsLabel },
  { title: "Joueurs actifs", countLabel: activePlayersLabel },
  { title: "Streamers actifs", countLabel: activeStreamersLabel },
];

export const chartLinesFor = (period: ActivityPeriod): readonly TimeChartLine[] =>
  period === "all" ? ALL_CHART_LINES : CHART_LINES;

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

// Les trois dernières valeurs d'un jour : zéro pour un jour d'avant l'audience, et rien hors de Tout.
const toDistinctValues = (
  { activeAccounts = 0, activePlayers = 0, activeStreamers = 0 }: ActivityPoint,
  period: ActivityPeriod,
): number[] => (period === "all" ? [activeAccounts, activePlayers, activeStreamers] : []);

// L'arrondi range chaque point dans son créneau, même un jour de Paris de 23 ou 25 heures.
export function toActivitySlots(
  points: readonly ActivityPoint[],
  period: ActivityPeriod,
  nowMs: Timestamp,
): ChartSlot[] {
  const axis = toTimeAxis(points, period, nowMs);
  if (!axis) return [];
  const slots: ChartSlot[] = Array.from({ length: axis.count }, () => null);
  for (const point of points) {
    const { at, people, streamed, pixels, signups, visits, visitMinutes } = point;
    const index = Math.round((at - axis.firstAt) / axis.stepMs);
    if (index >= 0 && index < axis.count)
      slots[index] = {
        title: slotTitle(at, period),
        values: [people, visits, visitMinutes, streamed, pixels, signups, ...toDistinctValues(point, period)],
      };
  }
  return slots;
}
