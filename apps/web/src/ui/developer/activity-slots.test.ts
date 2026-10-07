import { HOUR_MS, MINUTE_MS, toActivityPointStarts } from "@liveplace/domain";
import type { ActivityPoint } from "@liveplace/domain/ports";
import { describe, expect, it } from "vitest";
import { CHART_LABELS, chartLinesFor, toActivitySlots } from "./activity-slots";

const now = Date.UTC(2026, 9, 6, 12, 30, 20);
const { minute, hour } = toActivityPointStarts(now);

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
