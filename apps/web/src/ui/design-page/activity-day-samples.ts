// Les chiffres d'exemple d'un jour passé du suivi d'activité (JOURNAL 2026-10-14) : un soir de stream, ses fresques, ses courbes
// à la minute, à l'heure ou plus du tout. Aucune connexion : /design montre l'affichage, jamais le gateway.

import {
  type ActivityDayGrain,
  DEVELOPER_USER_ID,
  HOUR_MS,
  MINUTE_MS,
  toActivityPointStarts,
  toNextDayStart,
} from "@liveplace/domain";
import type {
  ActivityDay,
  ActivityDayCanvas,
  ActivityPoint,
  CanvasActivityPoint,
  CanvasDayPoint,
} from "@liveplace/domain/ports";
import { SAMPLE_BROKEN_PHOTO, SAMPLE_OWNER, SAMPLE_VIEWER } from "./design-fixtures";

const DAY_MS = 24 * HOUR_MS;

// Le début du jour de Paris d'il y a `daysAgo` jours.
export const dayStartAgo = (nowMs: number, daysAgo: number): number =>
  toActivityPointStarts(nowMs - daysAgo * DAY_MS).day;

// Ce que la rétention en garde : les minutes 7 jours (2 pour un canvas), les heures 366.
export const sampleGrain = (dayAt: number, nowMs: number, minutesDays = 7): ActivityDayGrain => {
  if (dayAt >= nowMs - minutesDays * DAY_MS) return "minute";
  return dayAt >= nowMs - 366 * DAY_MS ? "hour" : "none";
};

// Le soir : une cloche autour de 19 h 30, qui retombe avant minuit.
const evening = (index: number, count: number): number => Math.exp(-((index / count - 0.8) ** 2) / 0.012);

const stepOf = (grain: Exclude<ActivityDayGrain, "none">): number =>
  grain === "minute" ? MINUTE_MS : HOUR_MS;

type DayStep = Exclude<ActivityDayGrain, "none">;

// Les créneaux d'un jour : leur nombre, et la force du soir de chacun.
const slotsOf = (dayAt: number, grain: DayStep) => {
  const count = (toNextDayStart(dayAt) - dayAt) / stepOf(grain);
  return Array.from({ length: count }, (_, index) => ({
    index,
    at: dayAt + index * stepOf(grain),
    peak: evening(index, count),
  }));
};

// Un point par créneau tout le jour : le gateway tourne, même quand personne n'est là.
const sampleDayPoints = (dayAt: number, grain: DayStep): ActivityPoint[] => {
  const scale = grain === "minute" ? 1 : 40;
  return slotsOf(dayAt, grain).map(({ index, at, peak }) => ({
    at,
    people: Math.round(1 + 13 * peak),
    streamed: peak > 0.35 ? 3 : 0,
    pixels: Math.round(2 * scale * peak),
    signups: index % 211 === 0 ? 1 : 0,
    visits: Math.round(peak * (grain === "minute" ? 3 : 18)),
    phoneVisits: Math.round(peak * (grain === "minute" ? 1 : 7)),
    visitMinutes: Math.round(peak * scale * 2),
  }));
};

// Un canvas n'a un point que s'il s'y passe quelque chose : le soir seulement.
const sampleDayCanvasPoints = (dayAt: number, grain: DayStep): CanvasActivityPoint[] => {
  const scale = grain === "minute" ? 1 : 40;
  return slotsOf(dayAt, grain)
    .filter(({ peak }) => peak >= 0.15)
    .map(({ index, at, peak }) => ({
      at,
      people: Math.round(1 + 8 * peak),
      streamedMinutes: peak > 0.35 ? (grain === "minute" ? 1 : 60) : 0,
      pixels: Math.round(1.4 * scale * peak),
      visits: Math.round(peak * (grain === "minute" ? 2 : 12)),
      visitMinutes: Math.round(peak * scale * 1.5),
      signups: index % 301 === 0 ? 1 : 0,
    }));
};

const kalyssDay: CanvasDayPoint = {
  at: 0,
  people: 9,
  streamedMinutes: 215,
  pixels: 1840,
  visits: 23,
  phoneVisits: 9,
  visitMinutes: 330,
  signups: 3,
  activePlayers: 11,
};

// Les fresques actives ce jour-là, dans le désordre : l'écran les trie. Une qui a streamé, une moins, une qui n'a pas streamé,
// une dont le streamer est introuvable.
const sampleDayCanvases = (dayAt: number): ActivityDayCanvas[] => [
  {
    canvasId: "nuagelle",
    owner: { userId: "3", ...SAMPLE_BROKEN_PHOTO },
    point: {
      ...kalyssDay,
      at: dayAt,
      people: 2,
      streamedMinutes: 0,
      pixels: 140,
      visits: 4,
      signups: 0,
      activePlayers: 2,
    },
  },
  { canvasId: "kalyss", owner: { userId: "1", ...SAMPLE_OWNER }, point: { ...kalyssDay, at: dayAt } },
  {
    canvasId: "pixelmoth",
    owner: { userId: "2", ...SAMPLE_VIEWER },
    point: {
      ...kalyssDay,
      at: dayAt,
      people: 5,
      streamedMinutes: 95,
      pixels: 610,
      visits: 9,
      signups: 1,
      activePlayers: 4,
    },
  },
  {
    canvasId: "fenysk",
    owner: { userId: DEVELOPER_USER_ID, login: "fenysk", displayName: "Fenysk" },
    point: {
      ...kalyssDay,
      at: dayAt,
      people: 3,
      streamedMinutes: 40,
      pixels: 85,
      visits: 6,
      signups: 0,
      activePlayers: 1,
    },
  },
  {
    // Archivée depuis, et son streamer n'a plus de miroir
    canvasId: "archive-1",
    point: {
      ...kalyssDay,
      at: dayAt,
      people: 1,
      streamedMinutes: 0,
      pixels: 12,
      visits: 1,
      signups: 0,
      activePlayers: 1,
    },
  },
];

export type SampleDayVariant = "busy" | "quiet";

// Un jour passé tel que le gateway le rend. `quiet` : rien ne s'est passé nulle part ce jour-là, mais le gateway tournait.
export const sampleDay = (dayAt: number, nowMs: number, variant: SampleDayVariant = "busy"): ActivityDay => {
  const grain = sampleGrain(dayAt, nowMs);
  const canvasGrain = sampleGrain(dayAt, nowMs, 2);
  const isBusy = variant === "busy";
  return {
    dayAt,
    grain,
    ...(isBusy
      ? {
          day: {
            at: dayAt,
            people: 14,
            streamed: 3,
            pixels: 4210,
            signups: 6,
            visits: 41,
            phoneVisits: 17,
            visitMinutes: 612,
            activeAccounts: 28,
            activePlayers: 17,
            activeStreamers: 4,
          },
        }
      : {}),
    points: grain === "none" ? [] : sampleDayPoints(dayAt, grain),
    canvases: isBusy ? sampleDayCanvases(dayAt) : [],
    here: {
      canvasId: "kalyss",
      grain: canvasGrain,
      ...(isBusy ? { point: { ...kalyssDay, at: dayAt } } : {}),
      points: isBusy && canvasGrain !== "none" ? sampleDayCanvasPoints(dayAt, canvasGrain) : [],
    },
  };
};
