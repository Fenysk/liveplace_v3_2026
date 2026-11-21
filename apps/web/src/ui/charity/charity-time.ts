// Le formulaire a deux champs par borne : une date (`type="date"`, « 2026-12-05 ») et une heure facultative (`type="time"`, « 20:30 »), à l'heure
// de l'écran ; le gateway veut des millisecondes UTC.

import type { CharityCountdown } from "@liveplace/domain/charity-event";
import type { Locale } from "../locale/locale";

const twoDigits = (count: number): string => String(count).padStart(2, "0");

export const toLocalDate = (timestamp: number): string => {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`;
};

export const toLocalTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  return `${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;
};

// `null` : pas de date (ou pas une date). Sans heure, un début est ce jour-là à 0 h 00 ; une fin est la fin de ce jour, c'est-à-dire le
// lendemain à 0 h 00 (la fin est exclusive : l'événement dure sur [début, fin)). Une heure sans date ne fait pas de date.
export function fromLocalFields(date: string, time: string, edge: "start" | "end"): number | null {
  if (date === "") return null;
  if (time !== "") {
    const timestamp = new Date(`${date}T${time}`).getTime();
    return Number.isNaN(timestamp) ? null : timestamp;
  }
  const dayStart = new Date(`${date}T00:00`);
  if (Number.isNaN(dayStart.getTime())) return null;
  if (edge === "end") dayStart.setDate(dayStart.getDate() + 1);
  return dayStart.getTime();
}

// Le compte à rebours : jours et heures (« 2 j 5 h », en anglais « 2 d 5 h »), puis heures et minutes (« 5 h 12 min »), puis minutes et
// secondes (« 12 min 30 s »). Les minutes après les heures et les secondes après les minutes ont toujours 2 chiffres.
export function formatCountdown(countdown: CharityCountdown, locale: Locale): string {
  if (countdown.unit === "days")
    return `${countdown.days} ${locale === "fr" ? "j" : "d"} ${countdown.hours} h`;
  if (countdown.unit === "hours") return `${countdown.hours} h ${twoDigits(countdown.minutes)} min`;
  return `${countdown.minutes} min ${twoDigits(countdown.seconds)} s`;
}
