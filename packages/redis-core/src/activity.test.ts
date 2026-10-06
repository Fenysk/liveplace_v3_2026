import { HOUR_MS, MINUTE_MS, toActivityPointStarts } from "@liveplace/domain";
import type { ActivityMinute } from "@liveplace/domain/ports";
import { describe, expect, it } from "vitest";
import { createActivityStore, createSignupWrites } from "./activity";
import {
  ACTIVITY_HOURS_RETENTION_MS,
  ACTIVITY_MINUTES_RETENTION_MS,
  CANVAS_PIXELS_TTL_SECONDS,
  SIGNUPS_TTL_SECONDS,
} from "./keys";
import { createRedisHarness } from "./test-harness";

const harness = createRedisHarness();
const { redis, core } = harness;

const DAY_MS = 24 * HOUR_MS;
const now = Date.UTC(2026, 9, 6, 12, 30, 15); // 14 h 30 à Paris
const minuteAt = toActivityPointStarts(now).minute;
const hourAt = toActivityPointStarts(now).hour;
const dayAt = toActivityPointStarts(now).day; // minuit à Paris, 22 h UTC la veille

// Chaque test a ses propres clés : l'activité est globale, aucun canvas ne la sépare.
const stores = () => {
  const keys = harness.uniqueActivityKeys();
  return { keys, store: createActivityStore(redis, keys), signups: createSignupWrites(redis, keys) };
};

const minute = (at: number, counts: Partial<ActivityMinute> = {}): ActivityMinute => ({
  at,
  people: 0,
  streamed: 0,
  pixels: 0,
  pixelsByCanvas: new Map(),
  ...counts,
});

describe("the activity in Redis (écart §5.1, JOURNAL 2026-10-06)", () => {
  // Garde le pic des personnes et des canvas streamés, et la somme des pixels, sur la minute, l'heure et le jour
  it("keeps the peak of people and streamed canvases, and the sum of pixels, on the minute, hour and day", async () => {
    const { store } = stores();

    await store.storeActivityMinute(minute(minuteAt - MINUTE_MS, { people: 5, streamed: 2, pixels: 30 }));
    await store.storeActivityMinute(minute(minuteAt - MINUTE_MS, { people: 3, streamed: 1, pixels: 4 }));
    await store.storeActivityMinute(minute(minuteAt - 2 * MINUTE_MS, { people: 8, streamed: 1, pixels: 10 }));

    const point = { streamed: 2, signups: 0 };
    expect(await store.listActivityHistory("day", now)).toEqual([
      { at: minuteAt - 2 * MINUTE_MS, people: 8, streamed: 1, pixels: 10, signups: 0 },
      { at: minuteAt - MINUTE_MS, people: 5, pixels: 34, ...point },
    ]);
    expect(await store.listActivityHistory("month", now)).toEqual([
      { at: hourAt, people: 8, pixels: 44, ...point },
    ]);
    expect(await store.listActivityHistory("all", now)).toEqual([
      { at: dayAt, people: 8, pixels: 44, ...point },
    ]);
  });

  // Écrit un point même à zéro, et laisse absent celui d'une minute sans serveur : aucun zéro inventé
  it("writes a point even at zero, and leaves out a minute without a server: no zero is made up", async () => {
    const { store } = stores();

    await store.storeActivityMinute(minute(minuteAt - 3 * MINUTE_MS, { people: 2 }));
    await store.storeActivityMinute(minute(minuteAt - MINUTE_MS));

    const ats = (await store.listActivityHistory("day", now)).map(({ at }) => at);
    expect(ats).toEqual([minuteAt - 3 * MINUTE_MS, minuteAt - MINUTE_MS]);
  });

  // Rend les 1 440 dernières minutes, les 720 dernières heures, puis tous les jours, du plus ancien au plus récent
  it("lists the last 1,440 minutes, the last 720 hours, then every day, oldest first", async () => {
    const { store } = stores();
    const dayBefore = now - 25 * HOUR_MS;
    const longAgo = now - 40 * DAY_MS;

    for (const at of [longAgo, dayBefore, now - 2 * MINUTE_MS])
      await store.storeActivityMinute(minute(toActivityPointStarts(at).minute, { pixels: 1 }));

    expect(await store.listActivityHistory("day", now)).toHaveLength(1);
    expect((await store.listActivityHistory("month", now)).map(({ at }) => at)).toEqual([
      toActivityPointStarts(dayBefore).hour,
      hourAt,
    ]);
    expect((await store.listActivityHistory("all", now)).map(({ at }) => at)).toEqual([
      toActivityPointStarts(longAgo).day,
      toActivityPointStarts(dayBefore).day,
      dayAt,
    ]);
  });

  // Ajoute un nouveau compte à sa minute, son heure et son jour, et à sa provenance pour le jour de Paris
  it("adds a signup to its minute, hour and day, and to its provenance for the Paris day", async () => {
    const { store, signups } = stores();
    await store.storeActivityMinute(minute(minuteAt, { people: 1 }));

    await signups.storeSignup({ nowMs: now, discoveredViaUserId: "owner-1" });
    await signups.storeSignup({ nowMs: now + 1000, discoveredViaUserId: "owner-1" });
    await signups.storeSignup({ nowMs: now + 2000 });

    const [day] = await store.listActivityHistory("all", now);
    expect(day).toMatchObject({ people: 1, signups: 3 });
    const { total, byDiscoveredViaUserId } = await store.getDaySignups(now);
    expect(total).toBe(3);
    expect(byDiscoveredViaUserId).toEqual(new Map([["owner-1", 2]]));
    expect((await store.getDaySignups(now + DAY_MS)).total).toBe(0);
  });

  // Ne montre pas les nouveaux comptes d'une minute sans serveur, mais les compte dans son heure et son jour
  it("hides the signups of a minute without a server, but counts them in its hour and day", async () => {
    const { store, signups } = stores();
    await store.storeActivityMinute(minute(minuteAt - 5 * MINUTE_MS, { people: 1 }));

    await signups.storeSignup({ nowMs: now - MINUTE_MS });

    expect((await store.listActivityHistory("day", now)).map(({ signups: count }) => count)).toEqual([0]);
    expect(await store.listActivityHistory("month", now)).toEqual([
      { at: hourAt, people: 1, streamed: 0, pixels: 0, signups: 1 },
    ]);
  });

  // Élague les minutes de plus de 7 jours et les heures de plus de 366 jours, jamais un jour
  it("prunes minutes older than 7 days and hours older than 366 days, never a day", async () => {
    const { keys, store, signups } = stores();
    const expiredMinute = toActivityPointStarts(now - ACTIVITY_MINUTES_RETENTION_MS - MINUTE_MS);
    const expiredHour = toActivityPointStarts(now - ACTIVITY_HOURS_RETENTION_MS - HOUR_MS);
    for (const at of [expiredMinute.minute, expiredHour.minute, minuteAt])
      await store.storeActivityMinute(minute(at));
    await signups.storeSignup({ nowMs: expiredMinute.minute });

    await store.pruneActivity(now);

    expect(await redis.hkeys(keys.minutes)).toEqual([String(minuteAt)]);
    expect((await redis.hkeys(keys.hours)).sort()).toEqual(
      [`${expiredMinute.hour}`, `${expiredMinute.hour}:signups`, `${hourAt}`].sort(),
    );
    expect(await redis.hlen(keys.days)).toBe(4);
  });

  // Garde les pixels de chaque canvas par minute 61 minutes, et les relit pour la température
  it("keeps each canvas's pixels per minute for 61 minutes, and reads them back for the heat", async () => {
    const { keys, store } = stores();
    const pixelsByCanvas = new Map([
      ["canvas-1", 12],
      ["canvas-2", 3],
    ]);
    await store.storeActivityMinute(minute(minuteAt - 2 * MINUTE_MS, { pixels: 15, pixelsByCanvas }));
    await store.storeActivityMinute(minute(minuteAt - MINUTE_MS));

    expect(await store.listCanvasPixels(minuteAt - 59 * MINUTE_MS, minuteAt)).toEqual([
      { at: minuteAt - 2 * MINUTE_MS, pixelsByCanvas },
    ]);
    expect(await store.listCanvasPixels(minuteAt - MINUTE_MS, minuteAt)).toEqual([]);
    const ttl = await redis.ttl(keys.canvasPixels(minuteAt - 2 * MINUTE_MS));
    expect(ttl).toBeGreaterThan(CANVAS_PIXELS_TTL_SECONDS - 5);
    expect(ttl).toBeLessThanOrEqual(CANVAS_PIXELS_TTL_SECONDS);
  });

  // Garde les nouveaux comptes d'un jour de Paris 48 heures, et rien d'autre qu'un nombre par provenance
  it("keeps the signups of a Paris day 48 hours, and nothing but a number per provenance", async () => {
    const { keys, signups } = stores();

    await signups.storeSignup({ nowMs: now, discoveredViaUserId: "owner-1" });

    const key = keys.signups("2026-10-06");
    expect(await redis.hgetall(key)).toEqual({ "owner-1": "1" });
    expect(await redis.ttl(key)).toBeGreaterThan(SIGNUPS_TTL_SECONDS - 5);
  });

  // Lit le miroir `user:` du streamer d'un canvas, et rien quand il n'en a pas
  it("reads the user: mirror of a canvas's owner, and nothing when there is none", async () => {
    const { store } = stores();
    const userId = harness.uniqueCanvasId();
    await core.setUser({ userId, login: "kalyss", displayName: "Kalyss", avatarUrl: "https://avatar" });

    expect(await store.getUser(userId)).toEqual({
      userId,
      login: "kalyss",
      displayName: "Kalyss",
      avatarUrl: "https://avatar",
    });
    expect(await store.getUser(harness.uniqueCanvasId())).toBeNull();
  });

  // Tient une année d'historique sous 2 Mo
  it("holds a year of history under 2 MB", async () => {
    const { keys } = stores();
    const fill = async (hash: string, count: number, stepMs: number) => {
      const fields = Array.from({ length: count }, (_, index) => [
        `${now - index * stepMs}`,
        "1234,56,78901",
      ]);
      await redis.hset(hash, Object.fromEntries(fields));
    };
    await fill(keys.minutes, ACTIVITY_MINUTES_RETENTION_MS / MINUTE_MS, MINUTE_MS);
    await fill(keys.hours, ACTIVITY_HOURS_RETENTION_MS / HOUR_MS, HOUR_MS);
    await fill(keys.days, 366, DAY_MS);

    let bytes = 0;
    for (const hash of [keys.minutes, keys.hours, keys.days])
      bytes += Number(await redis.call("MEMORY", "USAGE", hash, "SAMPLES", "0"));
    expect(bytes).toBeLessThan(2 * 1024 * 1024);
  });
});
