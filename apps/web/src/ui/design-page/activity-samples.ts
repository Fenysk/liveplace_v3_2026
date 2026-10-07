// Les chiffres d'exemple du suivi d'activité (écart §10.3, JOURNAL 2026-10-06 et 2026-10-07) : des courbes, des canvas,
// une frame. Aucune connexion : /design montre l'affichage, jamais le gateway.

import {
  type ActivityPeriod,
  DEVELOPER_USER_ID,
  HOUR_MS,
  MINUTE_MS,
  toActivityPointStarts,
} from "@liveplace/domain";
import type {
  ActivityCanvas,
  ActivityFrame,
  ActivityHere,
  ActivityPoint,
  CanvasActivityPoint,
  ConnectedAccount,
} from "@liveplace/domain/ports";
import { SAMPLE_BROKEN_PHOTO, SAMPLE_OWNER, SAMPLE_VIEWER } from "./design-fixtures";

const DAY_MS = 24 * HOUR_MS;

// Des courbes qui ondulent, et un trou : le serveur arrêté une quarantaine de minutes, ou quelques heures.
export const PERIOD_SHAPES = {
  day: { count: 1440, stepMs: MINUTE_MS, gap: [600, 640] },
  month: { count: 720, stepMs: HOUR_MS, gap: [200, 206] },
  all: { count: 120, stepMs: DAY_MS, gap: [40, 42] },
} as const;

// Le début du dernier point d'une période : la dernière minute écoulée, l'heure ou le jour en cours.
export const lastPointAt = (period: ActivityPeriod, nowMs: number): number => {
  const starts = toActivityPointStarts(nowMs);
  return period === "day" ? starts.minute - MINUTE_MS : period === "month" ? starts.hour : starts.day;
};

// Un canvas où il ne se passe quelque chose que par moments : un point par créneau seulement quand il s'y passe quelque
// chose, le reste vaut zéro.
export const sampleCanvasPoints = (period: ActivityPeriod, nowMs: number): CanvasActivityPoint[] => {
  const { count, stepMs } = PERIOD_SHAPES[period];
  const lastAt = lastPointAt(period, nowMs);
  return Array.from({ length: count }, (_, index) => index)
    .filter((index) => index % 200 < 70)
    .map((index) => ({
      at: lastAt - (count - 1 - index) * stepMs,
      people: Math.round(2 + 2 * Math.sin(index / 30) + (index % 3)),
      obsViews: index % 100 < 40 ? 1 : 0,
      pixels: Math.round(20 + 15 * Math.sin(index / 20) + (index % 7) * 2),
      visits: index % 4,
      visitMinutes: Math.round(4 + 3 * Math.sin(index / 25) + (index % 5)),
      signups: index % 61 === 0 ? 1 : 0,
      // Les joueurs actifs ne se gardent que par jour : Tout seulement
      ...(period === "all" ? { activePlayers: Math.round(3 + 2 * Math.sin(index / 9)) } : {}),
    }));
};

export const samplePoints = (period: ActivityPeriod, nowMs: number): ActivityPoint[] => {
  const { count, stepMs, gap } = PERIOD_SHAPES[period];
  const lastAt = lastPointAt(period, nowMs);
  return Array.from({ length: count }, (_, index) => index)
    .filter((index) => index < gap[0] || index >= gap[1])
    .map((index) => ({
      at: lastAt - (count - 1 - index) * stepMs,
      people: Math.round(7 + 5 * Math.sin(index / 90) + (index % 5)),
      streamed: index % 300 < 120 ? 2 : 1,
      pixels: Math.round(45 + 40 * Math.sin(index / 40) + (index % 11) * 3),
      signups: index % 97 === 0 ? 1 : 0,
      visits: Math.round(2 + 2 * Math.sin(index / 70) + (index % 3)),
      phoneVisits: index % 3,
      visitMinutes: Math.round(12 + 9 * Math.sin(index / 50) + (index % 7)),
      // Les distincts ne se gardent que par jour : Tout seulement
      ...(period === "all"
        ? {
            activeAccounts: Math.round(14 + 6 * Math.sin(index / 20) + (index % 4)),
            activePlayers: Math.round(8 + 4 * Math.sin(index / 25) + (index % 3)),
            activeStreamers: index % 30 < 12 ? 3 : 2,
          }
        : {}),
    }));
};

export const sampleAccounts = (nowMs: number): ConnectedAccount[] => [
  {
    userId: "1",
    ...SAMPLE_OWNER,
    role: "owner",
    connectedAt: nowMs - 2 * HOUR_MS - 5 * MINUTE_MS,
    devices: ["desktop"],
  },
  {
    userId: "2",
    ...SAMPLE_VIEWER,
    role: "moderator",
    connectedAt: nowMs - 12 * MINUTE_MS,
    devices: ["desktop", "phone"],
  },
  {
    userId: "3",
    ...SAMPLE_BROKEN_PHOTO,
    role: "viewer",
    connectedAt: nowMs - 40_000,
    devices: ["phone"],
  },
];

export const sampleCanvases = (nowMs: number): ActivityCanvas[] => [
  {
    canvasId: "kalyss",
    owner: { userId: "1", ...SAMPLE_OWNER, twitchLive: { category: "Art" } },
    obsViews: 2,
    people: 4,
    guests: 1,
    heat: 1240,
    signups: 2,
    accounts: sampleAccounts(nowMs),
  },
  {
    canvasId: "fenysk",
    owner: { userId: DEVELOPER_USER_ID, login: "fenysk", displayName: "Fenysk" },
    obsViews: 0,
    people: 2,
    guests: 2,
    heat: 0,
    signups: 0,
    accounts: [],
  },
  {
    canvasId: "pixelmoth",
    owner: { userId: "2", ...SAMPLE_VIEWER },
    obsViews: 0,
    people: 0,
    guests: 0,
    heat: 35,
    signups: 1,
    accounts: [],
  },
];

// Un jour sans visite : la durée moyenne n'existe pas.
export const NO_AUDIENCE = {
  visits: 0,
  phoneVisits: 0,
  visitMinutes: 0,
  activeAccounts: 0,
  activePlayers: 0,
  activeStreamers: 0,
};

export const sampleHere = (nowMs: number): ActivityHere => ({
  canvasId: "kalyss",
  owner: { userId: "1", ...SAMPLE_OWNER },
  obsViews: 2,
  people: 4,
  guests: 1,
  heat: 1240,
  pixels: 87,
  accounts: sampleAccounts(nowMs),
  audience: {
    today: { visits: 14, phoneVisits: 6, visitMinutes: 96, activePlayers: 5, signups: 2 },
    month: { visits: 412, phoneVisits: 171, visitMinutes: 2210, activePlayers: 38, signups: 25 },
  },
});

// Un canvas où personne n'est, où personne n'a rien posé, et que personne ne streame.
export const quietHere = (nowMs: number): ActivityHere => ({
  ...sampleHere(nowMs),
  obsViews: 0,
  people: 0,
  guests: 0,
  heat: 0,
  pixels: 0,
  accounts: [],
  audience: {
    today: { visits: 0, phoneVisits: 0, visitMinutes: 0, activePlayers: 0, signups: 0 },
    month: { visits: 3, phoneVisits: 1, visitMinutes: 11, activePlayers: 1, signups: 0 },
  },
});

// `here` : le canvas de la socket, absent quand elle n'en a pas de prêt.
export const sampleFrame = (nowMs: number, here?: ActivityHere): ActivityFrame => ({
  t: "activity",
  now: { people: 6, guests: 3, streamed: 1, pixels: 87, signups: 3 },
  audience: {
    today: {
      visits: 38,
      phoneVisits: 19,
      visitMinutes: 200,
      activeAccounts: 14,
      activePlayers: 9,
      activeStreamers: 3,
    },
    month: {
      visits: 1214,
      phoneVisits: 497,
      visitMinutes: 5461,
      activeAccounts: 212,
      activePlayers: 131,
      activeStreamers: 11,
    },
  },
  canvases: sampleCanvases(nowMs),
  ...(here ? { here } : {}),
});
