import { HOUR_MS, MINUTE_MS, toActivityPointStarts } from "@liveplace/domain";
import type { ActivityPoint, CanvasActivityPoint } from "@liveplace/domain/ports";
import { describe, expect, it } from "vitest";
import { slotTitle } from "./activity-labels";
import {
  CHART_LABELS,
  canvasChartLinesFor,
  chartLinesFor,
  toActivitySlots,
  toCanvasSlots,
} from "./activity-slots";

const now = Date.UTC(2026, 9, 6, 12, 30, 20);
const { minute, hour } = toActivityPointStarts(now);
const DAY_MS = 24 * HOUR_MS;

const point = (at: number, people = 1): ActivityPoint => ({
  at,
  people,
  streamed: 2,
  pixels: 3,
  signups: 4,
  visits: 5,
  phoneVisits: 1,
  visitMinutes: 30,
});

describe("the time axis of the history (écart §4.3, JOURNAL 2026-10-06)", () => {
  // Tient 1 440 minutes jusqu'à la dernière écoulée, et laisse vide le créneau d'un point absent
  it("holds 1,440 minutes up to the last one gone by, and leaves empty the slot of a missing point", () => {
    const slots = toActivitySlots([point(minute - 3 * MINUTE_MS), point(minute - MINUTE_MS, 7)], "day", now);

    expect(slots).toHaveLength(1440);
    expect(slots.at(-1)?.values).toEqual([7, 5, 30, 2, 3, 4]);
    expect(slots.at(-2)).toBeNull();
    expect(slots.at(-3)?.values).toEqual([1, 5, 30, 2, 3, 4]);
    expect(slots.filter((slot) => slot !== null)).toHaveLength(2);
  });

  // Tient 720 heures jusqu'à l'heure en cours, et ignore un point hors de la période
  it("holds 720 hours up to the current one, and ignores a point outside the period", () => {
    const slots = toActivitySlots([point(hour - 800 * HOUR_MS), point(hour)], "month", now);

    expect(slots).toHaveLength(720);
    expect(slots.at(-1)).not.toBeNull();
    expect(slots.filter((slot) => slot !== null)).toHaveLength(1);
  });

  // Range chaque jour de Paris dans son créneau, même un jour de 23 ou 25 heures
  it("puts each Paris day in its slot, even a day of 23 or 25 hours", () => {
    const days = [Date.UTC(2026, 9, 23, 22), Date.UTC(2026, 9, 24, 22), Date.UTC(2026, 9, 25, 23)];

    const slots = toActivitySlots([point(days[0] ?? 0), point(days[2] ?? 0)], "all", now);

    expect(slots.map((slot) => slot !== null)).toEqual([true, false, true]);
    expect(toActivitySlots([], "all", now)).toEqual([]);
  });

  // Nomme les six courbes dans l'ordre des valeurs de chaque créneau, les visites et le temps passé après les personnes
  it("names the six curves in the order of each slot's values, the visits and the time spent after the people", () => {
    expect(CHART_LABELS).toEqual([
      "Personnes connectées",
      "Visites",
      "Temps passé (min)",
      "Canvas streamés",
      "Pixels posés",
      "Nouveaux comptes",
    ]);
  });

  // Ajoute à la période Tout seule trois courbes à la fin : les comptes, joueurs et streamers actifs
  it("adds three curves at the end for the period All alone: active accounts, players and streamers", () => {
    expect(chartLinesFor("day")).toBe(chartLinesFor("month"));
    expect(chartLinesFor("day").map(({ title }) => title)).toEqual(CHART_LABELS);
    expect(chartLinesFor("all").map(({ title }) => title)).toEqual([
      ...CHART_LABELS,
      "Comptes actifs",
      "Joueurs actifs",
      "Streamers actifs",
    ]);
  });

  // Donne à un créneau de Tout les distincts du jour après les autres valeurs, à zéro pour un jour d'avant l'audience
  it("gives a slot of All the day's distinct counts after the other values, zero for a day from before", () => {
    const withActive = {
      ...point(Date.UTC(2026, 9, 23, 22)),
      activeAccounts: 9,
      activePlayers: 6,
      activeStreamers: 2,
    };

    const [first, second] = toActivitySlots([withActive, point(Date.UTC(2026, 9, 24, 22))], "all", now);

    expect(first?.values).toEqual([1, 5, 30, 2, 3, 4, 9, 6, 2]);
    expect(second?.values).toEqual([1, 5, 30, 2, 3, 4, 0, 0, 0]);
    expect(
      toActivitySlots([{ ...withActive, at: minute - MINUTE_MS }], "day", now).at(-1)?.values,
    ).toHaveLength(6);
  });
});

describe("the time axis of the history of a canvas (JOURNAL 2026-10-07)", () => {
  const canvasPoint = (at: number, people = 1): CanvasActivityPoint => ({
    at,
    people,
    obsViews: 2,
    pixels: 3,
    visits: 5,
    visitMinutes: 30,
    signups: 4,
  });
  const zeros = [0, 0, 0, 0, 0, 0];

  // Laisse à zéro un créneau sans point, jamais vide : un moment sans activité sur ce canvas vaut zéro
  it("leaves at zero a slot without a point, never empty: a moment without activity on the canvas is worth zero", () => {
    const slots = toCanvasSlots(
      [canvasPoint(minute - 3 * MINUTE_MS), canvasPoint(minute - MINUTE_MS, 7)],
      "day",
      now,
    );

    expect(slots).toHaveLength(1440);
    expect(slots.every((slot) => slot !== null)).toBe(true);
    expect(slots.at(-1)?.values).toEqual([7, 5, 30, 2, 3, 4]);
    expect(slots.at(-2)?.values).toEqual(zeros);
    expect(slots.at(-2)?.title).toBe(slotTitle(minute - 2 * MINUTE_MS, "day"));
    expect(slots.at(-3)?.values).toEqual([1, 5, 30, 2, 3, 4]);
    expect(slots.at(0)?.values).toEqual(zeros);
  });

  // Tient 720 heures jusqu'à l'heure en cours, et ignore un point hors de la période
  it("holds 720 hours up to the current one, and ignores a point outside the period", () => {
    const slots = toCanvasSlots([canvasPoint(hour - 800 * HOUR_MS), canvasPoint(hour)], "month", now);

    expect(slots).toHaveLength(720);
    expect(slots.at(-1)?.values).toEqual([1, 5, 30, 2, 3, 4]);
    expect(slots.filter((slot) => slot?.values.some((value) => (value ?? 0) > 0))).toHaveLength(1);
  });

  // Tout : du premier jour du canvas jusqu'aujourd'hui, les jours sans point à zéro, les joueurs actifs en plus
  it("runs All from the first day of the canvas to today, the days without a point at zero, the active players on top", () => {
    const firstDay = toActivityPointStarts(now - 3 * DAY_MS).day;

    const slots = toCanvasSlots([{ ...canvasPoint(firstDay), activePlayers: 6 }], "all", now);

    expect(slots).toHaveLength(4);
    expect(slots[0]?.values).toEqual([1, 5, 30, 2, 3, 4, 6]);
    expect(slots[1]?.values).toEqual([...zeros, 0]);
    expect(slots[3]?.title).toBe(slotTitle(toActivityPointStarts(now).day, "all"));
    expect(toCanvasSlots([canvasPoint(minute - MINUTE_MS)], "day", now).at(-1)?.values).toHaveLength(6);
  });

  // Nomme le jour de Paris sans point par son vrai jour, même autour du changement d'heure
  it("names a Paris day without a point by its own day, even around the change of hour", () => {
    const later = Date.UTC(2026, 9, 27, 10);
    const slots = toCanvasSlots([canvasPoint(Date.UTC(2026, 9, 23, 22))], "all", later);

    expect(slots).toHaveLength(4);
    expect(slots[1]?.title).toContain("25 oct.");
    expect(slots[3]?.title).toContain("27 oct.");
  });

  // Ne donne aucun créneau à un canvas sans point, quelle que soit la période : le texte dit qu'il n'y a rien
  it("gives no slot to a canvas without a point, whatever the period", () => {
    for (const period of ["day", "month", "all"] as const) expect(toCanvasSlots([], period, now)).toEqual([]);
  });

  // Nomme les six courbes d'un canvas, les vues OBS à la place des canvas streamés, et les joueurs actifs de plus sur Tout
  it("names the six curves of a canvas, the OBS views in place of the streamed canvases, and the active players on top for All", () => {
    const titles = (period: "day" | "month" | "all") => canvasChartLinesFor(period).map(({ title }) => title);

    expect(titles("day")).toEqual([
      "Personnes connectées",
      "Visites",
      "Temps passé (min)",
      "Vues OBS ouvertes",
      "Pixels posés",
      "Nouveaux comptes venus de sa page",
    ]);
    expect(canvasChartLinesFor("day")).toBe(canvasChartLinesFor("month"));
    expect(titles("all")).toEqual([...titles("day"), "Joueurs actifs"]);
  });
});
