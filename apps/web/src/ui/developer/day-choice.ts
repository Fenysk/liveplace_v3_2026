// Le jour que la fenêtre Développeur montre (JOURNAL 2026-10-14) : aujourd'hui en direct, ou un jour passé. Le jour est celui
// de Paris, de 23, 24 ou 25 h : on passe de l'un à l'autre par le domaine, jamais en ajoutant 24 h.

import { type Timestamp, toActivityPointStarts, toNextDayStart, toPreviousDayStart } from "@liveplace/domain";
import { formatDayLabel } from "./activity-labels";

export type DayChoice = {
  label: string; // « Aujourd'hui », « Hier » ou « lun. 13 oct. »
  canGoBack: boolean; // non sur le plus ancien jour gardé, ni tant qu'il est inconnu
  canGoForward: boolean; // non sur aujourd'hui
  previousAt: Timestamp; // le jour que choisit « précédent »
  nextAt: Timestamp | undefined; // le jour que choisit « suivant » ; absent : aujourd'hui
};

// `dayAt` absent : aujourd'hui. `firstDayAt` : le plus ancien jour gardé, que le gateway fait connaître.
export function toDayChoice(
  dayAt: Timestamp | undefined,
  firstDayAt: Timestamp | undefined,
  nowMs: Timestamp,
): DayChoice {
  const todayAt = toActivityPointStarts(nowMs).day;
  const shownAt = Math.min(dayAt ?? todayAt, todayAt);
  const nextAt = toNextDayStart(shownAt);
  return {
    label: formatDayLabel(shownAt, nowMs),
    canGoBack: firstDayAt !== undefined && shownAt > firstDayAt,
    canGoForward: shownAt < todayAt,
    previousAt: toPreviousDayStart(shownAt),
    nextAt: nextAt < todayAt ? nextAt : undefined,
  };
}
