import { randomUUID } from "node:crypto";
import { type CanvasMeta, COUNTED_PIXELS_PER_DAY, defaultCanvasMeta, toParisDay } from "@liveplace/domain";
import type { Pixel } from "@liveplace/domain/ports";
import { describe, expect, it } from "vitest";
import { createRedisHarness } from "./test-harness";

const harness = createRedisHarness();
const { redis, core } = harness;

const USER = "user-1";
const now = Date.UTC(2026, 9, 5, 10, 0); // midi à Paris
const nextDay = now + 24 * 3_600_000;

const meta: CanvasMeta = {
  ...defaultCanvasMeta("owner-1"),
  width: 64,
  height: 64,
  gaugeMaxStart: 50,
  gaugeMaxCeiling: 60,
  refillMs: 1000,
};

const readyCanvas = (overrides: Partial<CanvasMeta> = {}) => harness.readyCanvas({ ...meta, ...overrides });

const row = (count: number, y = 0): Pixel[] =>
  Array.from({ length: count }, (_, x) => ({ x, y, colorIndex: 1 }));

const place = async (canvasId: string, pixels: Pixel[], nowMs = now) => {
  const result = await core.place(canvasId, {
    userId: USER,
    requestId: randomUUID(),
    placementId: "ptest0001",
    nowMs,
    pixels,
  });
  if (!result.ok) throw new Error(result.error);
  return result.value;
};

const claim = async (canvasId: string, requestId = randomUUID(), nowMs = now) => {
  const result = await core.claimGauge(canvasId, { userId: USER, requestId, nowMs });
  if (!result.ok) throw new Error(result.error);
  return result.value;
};

describe("the progress of a player (JOURNAL 2026-09-30)", () => {
  // Compte chaque pixel accepté, jamais un refusé, et rend le +1 réclamable au 12e
  it("counts each accepted pixel, never a rejected one, and makes the +1 claimable at the 12th", async () => {
    const { canvasId, keys } = await readyCanvas();

    const first = await place(canvasId, [...row(11), { x: 99, y: 0, colorIndex: 1 }]);
    const second = await place(canvasId, row(1, 1));

    expect(first.gauge.claimable).toBe(0);
    expect(second.gauge.claimable).toBe(1);
    expect(await redis.hgetall(keys.progress(USER))).toEqual({
      counted: "12",
      day: toParisDay(now),
      dayCounted: "12",
    });
    expect(await redis.ttl(keys.progress(USER))).toBe(-1);
  });

  // S'arrête à la limite du jour, puis repart de zéro le lendemain
  it("stops at the daily limit, then starts again from zero the next day", async () => {
    const { canvasId, keys } = await readyCanvas();
    const almost = COUNTED_PIXELS_PER_DAY - 2;
    await redis.hset(keys.progress(USER), { counted: almost, day: toParisDay(now), dayCounted: almost });

    await place(canvasId, row(5));
    expect(await redis.hmget(keys.progress(USER), "counted", "dayCounted")).toEqual([
      String(COUNTED_PIXELS_PER_DAY),
      String(COUNTED_PIXELS_PER_DAY),
    ]);

    await place(canvasId, row(3, 1), nextDay);
    expect(await redis.hgetall(keys.progress(USER))).toEqual({
      counted: String(COUNTED_PIXELS_PER_DAY + 3),
      day: toParisDay(nextDay),
      dayCounted: "3",
    });
  });

  // Donne +1 de max et une charge, pleine si la jauge l'était, puis plus rien
  it("gives +1 max and one charge, full when the gauge was, then nothing more", async () => {
    const { canvasId, keys } = await readyCanvas();
    await redis.hset(keys.progress(USER), { counted: 12, day: toParisDay(now), dayCounted: 12 });

    const claimed = await claim(canvasId);
    const again = await claim(canvasId);

    expect(claimed).toMatchObject({ accepted: 1, rejected: [] });
    expect(claimed.gauge).toEqual({ charges: 51, max: 51, nextRefillAt: now + meta.refillMs, claimable: 0 });
    expect(again).toMatchObject({ accepted: 0, gauge: { charges: 51, max: 51, claimable: 0 } });
    expect(await redis.hget(keys.progress(USER), "claimed")).toBe("1");
  });

  // Ajoute la charge à une jauge qui se recharge, sans toucher à sa recharge
  it("adds the charge to a refilling gauge, without touching its refill", async () => {
    const { canvasId, keys } = await readyCanvas();
    await place(canvasId, row(12));

    const claimed = await claim(canvasId, randomUUID(), now + 500);

    expect(claimed.gauge).toEqual({ charges: 39, max: 51, nextRefillAt: now + meta.refillMs, claimable: 0 });
    expect(await redis.hget(keys.gauge(USER), "charges")).toBe("39");
  });

  // Ne donne qu'un +1 pour un claim rejoué avec le même requestId
  it("gives a single +1 for a claim replayed with the same requestId", async () => {
    const { canvasId, keys } = await readyCanvas();
    await redis.hset(keys.progress(USER), { counted: 100 });
    const requestId = randomUUID();

    const [first, replayed] = await Promise.all([claim(canvasId, requestId), claim(canvasId, requestId)]);

    expect(replayed).toEqual(first);
    expect(await redis.hget(keys.progress(USER), "claimed")).toBe("1");
  });

  // Refuse un banni, qui garde sa progression
  it("refuses a banned player, who keeps his progress", async () => {
    const { canvasId, keys } = await readyCanvas();
    await redis.hset(keys.progress(USER), { counted: 100 });
    await redis.sadd(keys.bans, USER);

    const refused = await claim(canvasId);

    expect(refused).toMatchObject({ accepted: 0, gauge: { max: 50, claimable: 0 } });
    expect((await core.getGauge(canvasId, USER, now)).claimable).toBe(0);
    expect(await redis.hgetall(keys.progress(USER))).toEqual({ counted: "100" });

    await redis.srem(keys.bans, USER);
    expect((await core.getGauge(canvasId, USER, now)).claimable).toBe(3);
  });

  // Refuse au plafond, même avec des récompenses gagnées
  it("refuses at the ceiling, even with earned rewards", async () => {
    const { canvasId, keys } = await readyCanvas({ gaugeMaxCeiling: 51 });
    await redis.hset(keys.progress(USER), { counted: 900 });

    const claimed = await claim(canvasId);
    const refused = await claim(canvasId);

    expect(claimed).toMatchObject({ accepted: 1, gauge: { max: 51, claimable: 0 } });
    expect(refused).toMatchObject({ accepted: 0, gauge: { max: 51, claimable: 0 } });
  });

  // Rabote la jauge sous un plafond baissé sans perdre d'autre charge, et rend le niveau quand il remonte
  it("trims the gauge under a lowered ceiling without losing another charge, and gives the level back when it rises", async () => {
    const { canvasId, keys } = await readyCanvas();
    await redis.hset(keys.progress(USER), { counted: 900, claimed: 8 });
    await place(canvasId, row(1));

    await core.setGaugeLimits(canvasId, { gaugeMaxStart: 50, gaugeMaxCeiling: 52 });
    expect(await core.getGauge(canvasId, USER, now)).toMatchObject({ charges: 52, max: 52, claimable: 0 });
    const trimmed = await place(canvasId, row(1, 1));
    expect(trimmed.gauge).toMatchObject({ charges: 51, max: 52, claimable: 0 });

    await core.setGaugeLimits(canvasId, { gaugeMaxStart: 50, gaugeMaxCeiling: 60 });
    expect(await core.getGauge(canvasId, USER, now)).toMatchObject({ charges: 51, max: 58, claimable: 1 });
  });

  // Écrit les bornes dans meta et les publie sur le canal du canvas
  it("writes the limits in meta and publishes them on the canvas channel", async () => {
    const { canvasId } = await readyCanvas();
    const received: unknown[] = [];
    const unsubscribe = await core.subscribe(canvasId, (message) => received.push(message));

    await core.setGaugeLimits(canvasId, { gaugeMaxStart: 20, gaugeMaxCeiling: 40 });
    await new Promise((resolve) => setTimeout(resolve, 50));
    await unsubscribe();

    expect(await core.getCanvas(canvasId)).toMatchObject({ gaugeMaxStart: 20, gaugeMaxCeiling: 40 });
    expect(received).toEqual([{ ctl: { t: "gaugeLimits", gaugeMaxStart: 20, gaugeMaxCeiling: 40 } }]);
  });
});
