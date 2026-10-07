import { HOUR_MS, MINUTE_MS, toActivityPointStarts } from "@liveplace/domain";
import type { CapacityPoint } from "@liveplace/domain/ports";
import { describe, expect, it } from "vitest";
import { slotTitle } from "./activity-labels";
import { CAPACITY_LINES, toCapacitySlots } from "./capacity-slots";

const now = Date.UTC(2026, 9, 7, 12, 30, 20);
const { minute, hour } = toActivityPointStarts(now);

const point = (at: number, counts: Partial<CapacityPoint> = {}): CapacityPoint => ({
  at,
  saturation: 62.1,
  resource: "redisMemory",
  redis: 62.1,
  gateway: 10,
  ...counts,
});

describe("the curves of the capacity (JOURNAL 2026-10-07)", () => {
  // Une courbe pour la saturation, puis une par maillon dans l'ordre de la chaîne, chacune sur une échelle de 0 à 100 %
  it("has one curve for the saturation, then one per link in the order of the chain, each from 0 to 100 %", () => {
    expect(CAPACITY_LINES.map(({ title }) => title)).toEqual([
      "Saturation",
      "Redis",
      "Gateway",
      "Web",
      "VPS",
      "Convex",
    ]);
    expect(CAPACITY_LINES.every(({ scaleMax }) => scaleMax === 100)).toBe(true);
  });

  // Dit chaque valeur de l'infobulle en pourcentage, et « sans mesure » quand un maillon n'avait rien mesuré
  it("says each tooltip value as a percentage, and without measure when a link had measured nothing", () => {
    const [saturation, redis] = CAPACITY_LINES;

    expect(saturation?.countLabel(62.1)).toBe("Saturation 62\u00a0%");
    expect(redis?.countLabel(9.9)).toBe("Redis 9,9\u00a0%");
    expect(redis?.emptyLabel).toBe("Redis : sans mesure");
    expect(redis?.maxLabel?.(87.2)).toBe("max 87\u00a0%");
  });

  // Tient 1 440 minutes jusqu'à la dernière écoulée : un point absent est un trou, un maillon sans taux aussi
  it("holds 1,440 minutes up to the last one gone by: a missing point is a gap, and so is a link without a ratio", () => {
    const slots = toCapacitySlots(
      [point(minute - 3 * MINUTE_MS, { saturation: 10, redis: 10 }), point(minute - MINUTE_MS)],
      "day",
      now,
    );

    expect(slots).toHaveLength(1440);
    expect(slots.at(-1)?.values).toEqual([62.1, 62.1, 10, null, null, null]);
    expect(slots.at(-2)).toBeNull();
    expect(slots.at(-3)?.values).toEqual([10, 10, 10, null, null, null]);
    expect(slots.at(-1)?.title).toBe(slotTitle(minute - MINUTE_MS, "day"));
  });

  // Tient 720 heures jusqu'à l'heure en cours, et ignore un point hors de la période
  it("holds 720 hours up to the current one, and ignores a point outside the period", () => {
    const slots = toCapacitySlots([point(hour - 800 * HOUR_MS), point(hour)], "month", now);

    expect(slots).toHaveLength(720);
    expect(slots.filter((slot) => slot !== null)).toHaveLength(1);
    expect(slots.at(-1)).not.toBeNull();
  });

  // Tout : du premier jour au dernier, chaque jour dans son créneau, et rien sans point
  it("runs All from the first day to the last, each day in its slot, and nothing without a point", () => {
    const days = [Date.UTC(2026, 9, 23, 22), Date.UTC(2026, 9, 24, 22), Date.UTC(2026, 9, 25, 23)];

    const slots = toCapacitySlots([point(days[0] ?? 0), point(days[2] ?? 0)], "all", now);

    expect(slots.map((slot) => slot !== null)).toEqual([true, false, true]);
    expect(toCapacitySlots([], "all", now)).toEqual([]);
  });
});
