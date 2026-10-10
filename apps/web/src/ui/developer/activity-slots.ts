// L'axe du temps de l'historique (écart §4.3, JOURNAL 2026-10-06 et 2026-10-07) : des créneaux réguliers, du plus ancien
// au plus récent, comme le gateway écrit ses points. Pour tout LivePlace, un point absent laisse son créneau vide : la
// courbe y fait un trou. Pour un canvas, il vaut zéro : le gateway n'écrit un point que s'il s'y passe quelque chose.

import {
  type ActivityPeriod,
  HOUR_MS,
  MINUTE_MS,
  type Timestamp,
  toActivityPointStarts,
  toHourStart,
  toMinuteStart,
} from "@liveplace/domain";
import type { ActivityPoint, CanvasActivityPoint } from "@liveplace/domain/ports";
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
  streamedMinutesLabel,
  visitMinutesLabel,
  visitsLabel,
} from "./activity-labels";

const DAY_MS = 24 * HOUR_MS;

const PEOPLE_LINE: TimeChartLine = { title: "Personnes connectées", countLabel: connectedPeopleLabel };
const VISITS_LINE: TimeChartLine = { title: "Visites", countLabel: visitsLabel };
const TIME_SPENT_LINE: TimeChartLine = { title: "Temps passé (min)", countLabel: visitMinutesLabel };
const PIXELS_LINE: TimeChartLine = { title: "Pixels posés", countLabel: placedPixelsLabel };

// Les six courbes, de haut en bas, dans l'ordre des valeurs de chaque créneau : leur titre, et leur valeur accordée
// dans l'infobulle. Les visites et le temps passé suivent les personnes (JOURNAL 2026-10-07) ; les canvas streamés sont
// ceux dont une vue OBS est ouverte et le streamer en live (JOURNAL 2026-10-08).
export const CHART_LINES: readonly TimeChartLine[] = [
  PEOPLE_LINE,
  VISITS_LINE,
  TIME_SPENT_LINE,
  { title: "Fresques streamées", countLabel: streamedCanvasesLabel },
  PIXELS_LINE,
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

// Celles d'un canvas : ses minutes streamées à la place des canvas streamés, les nouveaux comptes venus de sa page, et sur
// Tout ses joueurs actifs de chaque jour. Ses vues OBS ouvertes ne sont qu'un détail de l'instant, sans courbe.
const CANVAS_CHART_LINES: readonly TimeChartLine[] = [
  PEOPLE_LINE,
  VISITS_LINE,
  TIME_SPENT_LINE,
  { title: "Temps streamé (min)", countLabel: streamedMinutesLabel },
  PIXELS_LINE,
  { title: "Nouveaux comptes venus de sa page", countLabel: signupsLabel },
];

const CANVAS_ALL_CHART_LINES: readonly TimeChartLine[] = [
  ...CANVAS_CHART_LINES,
  { title: "Joueurs actifs", countLabel: activePlayersLabel },
];

export const canvasChartLinesFor = (period: ActivityPeriod): readonly TimeChartLine[] =>
  period === "all" ? CANVAS_ALL_CHART_LINES : CANVAS_CHART_LINES;

type TimeAxis = { firstAt: Timestamp; stepMs: number; count: number };

// Tout : du premier jour au dernier, ceux de ces débuts de jour de Paris.
export type DayRange = { firstAt: Timestamp; lastAt: Timestamp };

// 24 h : jusqu'à la dernière minute écoulée. 30 jours : jusqu'à l'heure en cours. Tout : du premier jour au dernier.
export const toTimeAxis = (
  days: DayRange | null,
  period: ActivityPeriod,
  nowMs: Timestamp,
): TimeAxis | null => {
  if (period === "day")
    return { firstAt: toMinuteStart(nowMs) - 1440 * MINUTE_MS, stepMs: MINUTE_MS, count: 1440 };
  if (period === "month") return { firstAt: toHourStart(nowMs) - 719 * HOUR_MS, stepMs: HOUR_MS, count: 720 };
  if (!days) return null;
  return {
    firstAt: days.firstAt,
    stepMs: DAY_MS,
    count: Math.round((days.lastAt - days.firstAt) / DAY_MS) + 1,
  };
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
  const first = points[0];
  const last = points.at(-1);
  const axis = toTimeAxis(first && last ? { firstAt: first.at, lastAt: last.at } : null, period, nowMs);
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

// Les valeurs d'un créneau d'un canvas, dans l'ordre de ses courbes : les joueurs actifs sur Tout seulement.
const toCanvasValues = (
  { people, visits, visitMinutes, streamedMinutes, pixels, signups, activePlayers = 0 }: CanvasActivityPoint,
  period: ActivityPeriod,
): number[] => [
  people,
  visits,
  visitMinutes,
  streamedMinutes,
  pixels,
  signups,
  ...(period === "all" ? [activePlayers] : []),
];

// Pour un canvas, un créneau sans point vaut zéro. Un jour sans point se nomme à midi : à minuit, un jour de Paris de 23 ou
// 25 heures tomberait sur la veille. Sans aucun point, aucun créneau : le texte dit qu'il n'y a rien.
export function toCanvasSlots(
  points: readonly CanvasActivityPoint[],
  period: ActivityPeriod,
  nowMs: Timestamp,
): ChartSlot[] {
  const first = points[0];
  if (!first) return [];
  const today = toActivityPointStarts(nowMs).day;
  const axis = toTimeAxis({ firstAt: first.at, lastAt: Math.max(first.at, today) }, period, nowMs);
  if (!axis) return [];
  const noon = period === "all" ? DAY_MS / 2 : 0;
  const slots: ChartSlot[] = Array.from({ length: axis.count }, (_, index) => ({
    title: slotTitle(axis.firstAt + index * axis.stepMs + noon, period),
    values: canvasChartLinesFor(period).map(() => 0),
  }));
  for (const point of points) {
    const index = Math.round((point.at - axis.firstAt) / axis.stepMs);
    if (index >= 0 && index < axis.count)
      slots[index] = { title: slotTitle(point.at, period), values: toCanvasValues(point, period) };
  }
  return slots;
}
