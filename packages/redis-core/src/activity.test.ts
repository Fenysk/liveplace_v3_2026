import { AUDIENCE_DAYS, HOUR_MS, MINUTE_MS, toActivityPointStarts, toParisDay } from "@liveplace/domain";
import type { ActiveIds, ActivityMinute, CanvasMinute, CanvasSeen } from "@liveplace/domain/ports";
import { describe, expect, it } from "vitest";
import { createActivityStore, createSignupWrites } from "./activity";
import {
  ACTIVE_TTL_SECONDS,
  ACTIVITY_CANVAS_MINUTES_RETENTION_MS,
  ACTIVITY_HOURS_RETENTION_MS,
  ACTIVITY_MINUTES_RETENTION_MS,
  CANVAS_PIXELS_TTL_SECONDS,
  SIGNUPS_TTL_SECONDS,
  toActiveField,
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

const noVisits = { visits: 0, phoneVisits: 0, visitMinutes: 0 };

// Les identifiants d'une minute : ses comptes, ses joueurs, et ses canvas streamés.
const ids = (accounts: string[] = [], players: string[] = [], streamed: string[] = []): ActiveIds => ({
  accountIds: new Set(accounts),
  playerIds: new Set(players),
  streamedCanvasIds: new Set(streamed),
});

const minute = (at: number, counts: Partial<ActivityMinute> = {}): ActivityMinute => ({
  at,
  people: 0,
  streamed: 0,
  live: 0,
  pixels: 0,
  ...noVisits,
  ...ids(),
  pixelsByCanvas: new Map(),
  canvases: new Map(),
  ...counts,
});

const canvasMinute = (counts: Partial<CanvasMinute> = {}): CanvasMinute => ({
  people: 0,
  obsViews: 0,
  live: 0,
  pixels: 0,
  visits: 0,
  phoneVisits: 0,
  visitMinutes: 0,
  playerIds: new Set(),
  ...counts,
});

// La minute d'un instant, avec ce que chaque canvas y a vécu.
const inMinute = (at: number, canvases: Record<string, CanvasMinute>) =>
  minute(at, { canvases: new Map(Object.entries(canvases)) });

describe("the activity in Redis (écart §5.1, JOURNAL 2026-10-06)", () => {
  // Garde le pic des personnes et des canvas streamés, et la somme des pixels, sur la minute, l'heure et le jour
  it("keeps the peak of people and streamed canvases, and the sum of pixels, on the minute, hour and day", async () => {
    const { store } = stores();

    await store.storeActivityMinute(minute(minuteAt - MINUTE_MS, { people: 5, streamed: 2, pixels: 30 }));
    await store.storeActivityMinute(minute(minuteAt - MINUTE_MS, { people: 3, streamed: 1, pixels: 4 }));
    await store.storeActivityMinute(minute(minuteAt - 2 * MINUTE_MS, { people: 8, streamed: 1, pixels: 10 }));

    const point = { streamed: 2, live: 0, signups: 0, ...noVisits };
    expect(await store.listActivityHistory("day", now)).toEqual([
      { at: minuteAt - 2 * MINUTE_MS, people: 8, streamed: 1, live: 0, pixels: 10, signups: 0, ...noVisits },
      { at: minuteAt - MINUTE_MS, people: 5, pixels: 34, ...point },
    ]);
    expect(await store.listActivityHistory("month", now)).toEqual([
      { at: hourAt, people: 8, pixels: 44, ...point },
    ]);
    expect(await store.listActivityHistory("all", now)).toEqual([
      { at: dayAt, people: 8, pixels: 44, activeAccounts: 0, activePlayers: 0, activeStreamers: 0, ...point },
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
      { at: hourAt, people: 1, streamed: 0, live: 0, pixels: 0, signups: 1, ...noVisits },
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

  // Garde les nouveaux comptes d'un jour de Paris 31 jours, et rien d'autre qu'un nombre par provenance
  it("keeps the signups of a Paris day 31 days, and nothing but a number per provenance", async () => {
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
        "1234,56,78901,2345,678,90123,45",
      ]);
      await redis.hset(hash, Object.fromEntries(fields));
    };
    await fill(keys.minutes, ACTIVITY_MINUTES_RETENTION_MS / MINUTE_MS, MINUTE_MS);
    await fill(keys.hours, ACTIVITY_HOURS_RETENTION_MS / HOUR_MS, HOUR_MS);
    await fill(keys.days, 366, DAY_MS);
    const active = Array.from({ length: 366 }, (_, index) => [
      toActiveField(now - index * DAY_MS),
      "1234,567,89",
    ]);
    await redis.hset(keys.days, Object.fromEntries(active));

    let bytes = 0;
    for (const hash of [keys.minutes, keys.hours, keys.days])
      bytes += Number(await redis.call("MEMORY", "USAGE", hash, "SAMPLES", "0"));
    expect(bytes).toBeLessThan(2 * 1024 * 1024);
  });
});

// Écart §5.1 (JOURNAL 2026-10-07) : l'audience, ses sommes dans les points et ses distincts dans des HyperLogLog.
describe("the audience in Redis (écart §5.1, JOURNAL 2026-10-07)", () => {
  const dayMinute = (daysAgo: number) => toActivityPointStarts(now - daysAgo * DAY_MS).minute;
  const zero = {
    visits: 0,
    phoneVisits: 0,
    visitMinutes: 0,
    activeAccounts: 0,
    activePlayers: 0,
    activeStreamers: 0,
  };

  // Additionne les visites, les visites au téléphone et le temps passé sur la minute, l'heure et le jour
  it("sums the visits, the phone visits and the time spent on the minute, hour and day", async () => {
    const { store } = stores();

    await store.storeActivityMinute(
      minute(minuteAt - MINUTE_MS, { visits: 3, phoneVisits: 1, visitMinutes: 12 }),
    );
    await store.storeActivityMinute(
      minute(minuteAt - MINUTE_MS, { visits: 2, phoneVisits: 2, visitMinutes: 5 }),
    );
    await store.storeActivityMinute(minute(minuteAt - 2 * MINUTE_MS, { visits: 1, visitMinutes: 3 }));

    expect(await store.listActivityHistory("day", now)).toMatchObject([
      { at: minuteAt - 2 * MINUTE_MS, visits: 1, phoneVisits: 0, visitMinutes: 3 },
      { at: minuteAt - MINUTE_MS, visits: 5, phoneVisits: 3, visitMinutes: 17 },
    ]);
    expect(await store.listActivityHistory("month", now)).toMatchObject([
      { at: hourAt, visits: 6, phoneVisits: 3, visitMinutes: 20 },
    ]);
    expect(await store.listActivityHistory("all", now)).toMatchObject([
      { at: dayAt, visits: 6, phoneVisits: 3, visitMinutes: 20 },
    ]);
  });

  // Lit un point d'avant l'audience, à trois champs, avec des zéros, et lui ajoute les sommes nouvelles
  it("reads a point from before the audience, with three fields, as zeros, and adds the new sums to it", async () => {
    const { keys, store } = stores();
    const before = minuteAt - MINUTE_MS;
    for (const [hash, at] of [
      [keys.minutes, before],
      [keys.hours, hourAt],
      [keys.days, dayAt],
    ] as const)
      await redis.hset(hash, String(at), "5,2,30");

    expect(await store.listActivityHistory("day", now)).toEqual([
      { at: before, people: 5, streamed: 2, live: 0, pixels: 30, signups: 0, ...noVisits },
    ]);

    await store.storeActivityMinute(
      minute(before, { people: 3, streamed: 3, pixels: 4, visits: 2, phoneVisits: 1, visitMinutes: 6 }),
    );

    const after = {
      people: 5,
      streamed: 3,
      live: 0,
      pixels: 34,
      signups: 0,
      visits: 2,
      phoneVisits: 1,
      visitMinutes: 6,
    };
    expect(await store.listActivityHistory("day", now)).toEqual([{ at: before, ...after }]);
    expect(await store.listActivityHistory("month", now)).toMatchObject([{ at: hourAt, ...after }]);
    expect(await store.listActivityHistory("all", now)).toMatchObject([{ at: dayAt, ...after }]);
    expect(await redis.hget(keys.minutes, String(before))).toBe("5,3,34,2,1,6,0");
  });

  // Compte une fois un compte, un joueur et un canvas streamé que plusieurs minutes d'un jour revoient
  it("counts once an account, a player and a streamed canvas that several minutes of a day see again", async () => {
    const { store } = stores();

    await store.storeActivityMinute(minute(minuteAt - 2 * MINUTE_MS, ids(["u1", "u2"], ["u1"], ["c1"])));
    await store.storeActivityMinute(
      minute(minuteAt - MINUTE_MS, ids(["u2", "u3"], ["u1", "u3"], ["c1", "c2"])),
    );

    const [day] = await store.listActivityHistory("all", now);
    expect(day).toMatchObject({ activeAccounts: 3, activePlayers: 2, activeStreamers: 2 });
  });

  // Garde les distincts d'un jour dans son point, pour la courbe Tout seulement, et après la fin de leur HyperLogLog
  it("keeps a day's distinct counts in its point, for the all curve only, after their HyperLogLog is gone", async () => {
    const { keys, store } = stores();
    await store.storeActivityMinute(minute(minuteAt - MINUTE_MS, ids(["u1", "u2"], ["u1"], ["c1"])));

    const today = toParisDay(now);
    await redis.del(keys.activeAccounts(today), keys.activePlayers(today), keys.activeStreamers(today));

    const [day] = await store.listActivityHistory("all", now);
    expect(day).toMatchObject({ at: dayAt, activeAccounts: 2, activePlayers: 1, activeStreamers: 1 });
    expect(await redis.hget(keys.days, toActiveField(dayAt))).toBe("2,1,1");
    for (const period of ["day", "month"] as const) {
      const [point] = await store.listActivityHistory(period, now);
      expect(point).not.toHaveProperty("activeAccounts");
    }
  });

  // Lit à zéro les distincts d'un jour d'avant l'audience, et n'écrit rien pour une minute sans identifiant
  it("reads as zero the distinct counts of a day from before the audience, and writes none for a minute with no id", async () => {
    const { keys, store } = stores();
    await redis.hset(keys.days, String(dayAt), "5,2,30");
    await store.storeActivityMinute(minute(minuteAt - MINUTE_MS, { people: 1 }));

    expect(await redis.hget(keys.days, toActiveField(dayAt))).toBeNull();
    expect(await store.listActivityHistory("all", now)).toMatchObject([
      { at: dayAt, activeAccounts: 0, activePlayers: 0, activeStreamers: 0 },
    ]);
  });

  // Garde l'HyperLogLog d'un jour 31 jours, pour que les 30 jours d'avant aucun ne manque
  it("keeps the HyperLogLog of a day 31 days", async () => {
    const { keys, store } = stores();
    await store.storeActivityMinute(minute(minuteAt - MINUTE_MS, ids(["u1"], ["u1"], ["c1"])));

    const today = toParisDay(now);
    for (const key of [keys.activeAccounts(today), keys.activePlayers(today), keys.activeStreamers(today)]) {
      expect(await redis.type(key)).toBe("string");
      const ttl = await redis.ttl(key);
      expect(ttl).toBeGreaterThan(ACTIVE_TTL_SECONDS - 5);
      expect(ttl).toBeLessThanOrEqual(ACTIVE_TTL_SECONDS);
    }
  });

  // Compte l'audience d'aujourd'hui et celle des 30 derniers jours de Paris, les distincts en union
  it("counts the audience of today and of the last 30 Paris days, the distinct ones as a union", async () => {
    const { store } = stores();
    const today = { visits: 3, phoneVisits: 1, visitMinutes: 10, ...ids(["a1", "a2"], ["a1"], ["c1"]) };
    const yesterday = {
      visits: 4,
      phoneVisits: 2,
      visitMinutes: 20,
      ...ids(["a2", "a3"], ["a2", "a3"], ["c1", "c2"]),
    };
    const oldest = { visits: 1, visitMinutes: 5, ...ids(["a4"], [], ["c3"]) };
    const outside = { visits: 100, phoneVisits: 50, visitMinutes: 900, ...ids(["a5"], ["a5"], ["c4"]) };
    await store.storeActivityMinute(minute(minuteAt - MINUTE_MS, today));
    await store.storeActivityMinute(minute(dayMinute(1), yesterday));
    await store.storeActivityMinute(minute(dayMinute(AUDIENCE_DAYS - 1), oldest));
    await store.storeActivityMinute(minute(dayMinute(AUDIENCE_DAYS), outside));

    expect(await store.getAudience(now, ids())).toEqual({
      today: {
        visits: 3,
        phoneVisits: 1,
        visitMinutes: 10,
        activeAccounts: 2,
        activePlayers: 1,
        activeStreamers: 1,
      },
      month: {
        visits: 8,
        phoneVisits: 3,
        visitMinutes: 35,
        activeAccounts: 4,
        activePlayers: 3,
        activeStreamers: 3,
      },
    });
  });

  // Rend une audience à zéro quand rien n'a été écrit, et ne compte pas un jour sans point
  it("gives a zero audience when nothing was written, and counts no day without a point", async () => {
    const { store } = stores();

    expect(await store.getAudience(now, ids())).toEqual({ today: zero, month: zero });
    await store.storeActivityMinute(minute(dayMinute(3), { visits: 2, visitMinutes: 4 }));
    expect(await store.getAudience(now, ids())).toEqual({
      today: zero,
      month: { ...zero, visits: 2, visitMinutes: 4 },
    });
  });

  // Compte les identifiants de la minute en cours sans l'attendre, et une seule fois quand elle s'écrit
  it("counts the ids of the minute in progress without waiting for it, and once when it is written", async () => {
    const { store } = stores();
    await store.storeActivityMinute(minute(minuteAt - MINUTE_MS, ids(["u1"], ["u1"], ["c1"])));
    const open = ids(["u1", "u2"], ["u2"], ["c1", "c2"]);

    const first = await store.getAudience(now, open);
    expect(await store.getAudience(now, open)).toEqual(first);
    expect(first.today).toMatchObject({ activeAccounts: 2, activePlayers: 2, activeStreamers: 2 });
    expect(first.month).toMatchObject({ activeAccounts: 2, activePlayers: 2, activeStreamers: 2 });

    await store.storeActivityMinute(minute(minuteAt, open));
    expect((await store.getAudience(now, ids())).today).toMatchObject({
      activeAccounts: 2,
      activePlayers: 2,
    });
    const [day] = await store.listActivityHistory("all", now);
    expect(day).toMatchObject({ activeAccounts: 2, activePlayers: 2, activeStreamers: 2 });
  });

  // Tient chaque jour de Paris pour son jour : une minute après minuit compte pour le nouveau
  it("holds each Paris day for its own: a minute after midnight belongs to the new day", async () => {
    const { keys, store } = stores();
    const midnight = toActivityPointStarts(now + DAY_MS).day;

    await store.storeActivityMinute(minute(midnight - MINUTE_MS, ids(["u1"])));
    await store.storeActivityMinute(minute(midnight, ids(["u2"])));

    expect(await redis.pfcount(keys.activeAccounts(toParisDay(midnight - MINUTE_MS)))).toBe(1);
    expect(await redis.pfcount(keys.activeAccounts(toParisDay(midnight)))).toBe(1);
    const audience = await store.getAudience(midnight + 5 * MINUTE_MS, ids());
    expect(audience.today.activeAccounts).toBe(1);
    expect(audience.month.activeAccounts).toBe(2);
  });

  // Ne garde aucun identifiant : des compteurs et des HyperLogLog seulement, jamais de quoi retrouver un compte
  it("keeps no identifier: counters and HyperLogLogs only, nothing to find an account in", async () => {
    const { keys, store } = stores();
    const prefix = keys.minutes.slice(0, -"minute".length);
    await store.storeActivityMinute(
      minute(minuteAt - MINUTE_MS, ids(["account-4242"], ["account-4242"], ["canvas-4242"])),
    );

    let dumped = "";
    for await (const names of redis.scanStream({ match: `${prefix}*`, count: 1000 }))
      for (const name of names as string[]) {
        const type = await redis.type(name);
        const content =
          type === "hash" ? JSON.stringify(await redis.hgetall(name)) : await redis.getBuffer(name);
        dumped += `${name}=${content}\n`;
      }

    expect(dumped).toContain("accounts:");
    expect(dumped).not.toContain("4242");
  });
});

// Écart §5.1 (JOURNAL 2026-10-07) : l'historique d'un canvas, ses trois niveaux, ses joueurs actifs et son audience.
describe("the history of a canvas in Redis (écart §5.1, JOURNAL 2026-10-07)", () => {
  const players = (...playerIds: string[]) => ({ playerIds: new Set(playerIds) });
  const quiet = { live: 0, visits: 0, visitMinutes: 0, signups: 0 };

  // Garde le pic des personnes et des vues OBS d'un canvas, et les sommes du reste, sur la minute, l'heure et le jour
  it("keeps the peak of people and OBS views of a canvas, and the sums of the rest, on the minute, hour and day", async () => {
    const { store } = stores();
    const at = minuteAt - MINUTE_MS;

    await store.storeActivityMinute(
      inMinute(at, {
        c1: canvasMinute({ people: 5, obsViews: 2, pixels: 30, visits: 3, phoneVisits: 1, visitMinutes: 12 }),
      }),
    );
    await store.storeActivityMinute(
      inMinute(at, {
        c1: canvasMinute({ people: 3, obsViews: 1, pixels: 4, visits: 2, phoneVisits: 2, visitMinutes: 5 }),
      }),
    );
    await store.storeActivityMinute(
      inMinute(minuteAt - 2 * MINUTE_MS, { c1: canvasMinute({ people: 8, pixels: 10 }) }),
    );

    const summed = { obsViews: 2, live: 0, visits: 5, visitMinutes: 17, signups: 0 };
    expect(await store.listCanvasHistory("c1", "day", now)).toEqual([
      { at: minuteAt - 2 * MINUTE_MS, people: 8, obsViews: 0, pixels: 10, ...quiet },
      { at, people: 5, pixels: 34, ...summed },
    ]);
    expect(await store.listCanvasHistory("c1", "month", now)).toEqual([
      { at: hourAt, people: 8, pixels: 44, ...summed },
    ]);
    expect(await store.listCanvasHistory("c1", "all", now)).toEqual([
      { at: dayAt, people: 8, pixels: 44, activePlayers: 0, ...summed },
    ]);
  });

  // N'écrit rien pour un canvas où la minute n'a rien eu, et laisse chaque canvas à ses points
  it("writes nothing for a canvas the minute had nothing for, and keeps each canvas to its own points", async () => {
    const { keys, store } = stores();

    await store.storeActivityMinute(minute(minuteAt - 3 * MINUTE_MS, { people: 4 }));
    await store.storeActivityMinute(
      inMinute(minuteAt - MINUTE_MS, { c1: canvasMinute({ people: 2 }), c2: canvasMinute({ pixels: 9 }) }),
    );

    expect(await store.listCanvasHistory("c3", "day", now)).toEqual([]);
    expect(await redis.exists(keys.canvas("c3").minutes, keys.canvas("c3").days)).toBe(0);
    expect(await store.listCanvasHistory("c1", "day", now)).toEqual([
      { at: minuteAt - MINUTE_MS, people: 2, obsViews: 0, pixels: 0, ...quiet },
    ]);
    expect(await store.listCanvasHistory("c2", "day", now)).toEqual([
      { at: minuteAt - MINUTE_MS, people: 0, obsViews: 0, pixels: 9, ...quiet },
    ]);
    expect((await store.listActivityHistory("day", now)).map(({ people }) => people)).toEqual([4, 0]);
  });

  // Compte un nouveau compte dans les points du canvas d'où il vient, seul : zéro pour le reste, et aucun point d'un autre canvas
  it("counts a signup in the points of the canvas it came from, alone: zero for the rest, and none for another", async () => {
    const { keys, store, signups } = stores();
    const nowMs = now - 2 * MINUTE_MS;

    await signups.storeSignup({ nowMs, discoveredViaUserId: "owner-1", discoveredViaCanvasId: "c1" });
    await signups.storeSignup({ nowMs, discoveredViaUserId: "owner-2" });
    await signups.storeSignup({ nowMs });

    const point = { people: 0, obsViews: 0, live: 0, pixels: 0, visits: 0, visitMinutes: 0, signups: 1 };
    expect(await store.listCanvasHistory("c1", "day", now)).toEqual([
      { at: toActivityPointStarts(nowMs).minute, ...point },
    ]);
    expect(await store.listCanvasHistory("c1", "month", now)).toEqual([{ at: hourAt, ...point }]);
    expect(await store.listCanvasHistory("c1", "all", now)).toEqual([
      { at: dayAt, activePlayers: 0, ...point },
    ]);
    expect(await store.listCanvasHistory("c2", "all", now)).toEqual([]);
    expect(await redis.exists(keys.canvas("owner-1").days, keys.canvas("owner-2").days)).toBe(0);
    expect((await store.getDaySignups(nowMs)).total).toBe(3);
  });

  // Compte une fois un joueur que plusieurs minutes d'un jour revoient, et garde le nombre du jour dans son point, pour Tout seul
  it("counts once a player that several minutes of a day see again, and keeps the day's count in its point, for All alone", async () => {
    const { store } = stores();

    await store.storeActivityMinute(
      inMinute(minuteAt - 2 * MINUTE_MS, { c1: canvasMinute({ people: 1, ...players("p1", "p2") }) }),
    );
    await store.storeActivityMinute(
      inMinute(minuteAt - MINUTE_MS, { c1: canvasMinute({ people: 1, ...players("p2", "p3") }) }),
    );

    const [day] = await store.listCanvasHistory("c1", "all", now);
    expect(day).toMatchObject({ at: dayAt, activePlayers: 3 });
    for (const period of ["day", "month"] as const) {
      const [point] = await store.listCanvasHistory("c1", period, now);
      expect(point).not.toHaveProperty("activePlayers");
    }
  });

  // Garde l'HyperLogLog des joueurs d'un jour de ce canvas 31 jours, sous le sien : un autre canvas ne s'y mêle pas
  it("keeps the HyperLogLog of a canvas's players for a day 31 days, under its own key: another canvas does not mix in", async () => {
    const { keys, store } = stores();
    await store.storeActivityMinute(
      inMinute(minuteAt - MINUTE_MS, {
        c1: canvasMinute({ people: 1, ...players("p1") }),
        c2: canvasMinute({ people: 1, ...players("p1", "p2", "p3") }),
      }),
    );

    const key = keys.canvas("c1").activePlayers(toParisDay(now));
    expect(await redis.type(key)).toBe("string");
    expect(await redis.pfcount(key)).toBe(1);
    expect(await redis.pfcount(keys.canvas("c2").activePlayers(toParisDay(now)))).toBe(3);
    const ttl = await redis.ttl(key);
    expect(ttl).toBeGreaterThan(ACTIVE_TTL_SECONDS - 5);
    expect(ttl).toBeLessThanOrEqual(ACTIVE_TTL_SECONDS);
  });

  // Compte l'audience d'un canvas aujourd'hui et sur les 30 derniers jours de Paris, ses joueurs en union et ses nouveaux comptes en somme
  it("counts the audience of a canvas today and over the last 30 Paris days, its players as a union, its signups as a sum", async () => {
    const { store, signups } = stores();
    await store.storeActivityMinute(
      inMinute(minuteAt - MINUTE_MS, {
        c1: canvasMinute({ visits: 3, phoneVisits: 1, visitMinutes: 10, ...players("a1", "a2") }),
      }),
    );
    await store.storeActivityMinute(
      inMinute(toActivityPointStarts(now - DAY_MS).minute, {
        c1: canvasMinute({ visits: 4, phoneVisits: 2, visitMinutes: 20, ...players("a2", "a3") }),
      }),
    );
    await store.storeActivityMinute(
      inMinute(toActivityPointStarts(now - (AUDIENCE_DAYS - 1) * DAY_MS).minute, {
        c1: canvasMinute({ visits: 1, visitMinutes: 5, ...players("a4") }),
      }),
    );
    await store.storeActivityMinute(
      inMinute(toActivityPointStarts(now - AUDIENCE_DAYS * DAY_MS).minute, {
        c1: canvasMinute({ visits: 100, phoneVisits: 50, visitMinutes: 900, ...players("a5") }),
      }),
    );
    for (const [nowMs, count] of [
      [now, 2],
      [now - DAY_MS, 1],
      [now - AUDIENCE_DAYS * DAY_MS, 7],
    ] as const)
      for (let signup = 0; signup < count; signup += 1)
        await signups.storeSignup({ nowMs, discoveredViaCanvasId: "c1" });

    expect(await store.getCanvasAudience("c1", now, new Set())).toEqual({
      today: { visits: 3, phoneVisits: 1, visitMinutes: 10, activePlayers: 2, signups: 2 },
      month: { visits: 8, phoneVisits: 3, visitMinutes: 35, activePlayers: 4, signups: 3 },
    });
  });

  // Rend une audience à zéro à un canvas dont rien n'a été écrit, et ne compte pas les visites d'un autre
  it("gives a zero audience to a canvas nothing was written for, and counts no visit of another", async () => {
    const { store } = stores();
    const zero = { visits: 0, phoneVisits: 0, visitMinutes: 0, activePlayers: 0, signups: 0 };
    await store.storeActivityMinute(inMinute(minuteAt - MINUTE_MS, { c2: canvasMinute({ visits: 6 }) }));

    expect(await store.getCanvasAudience("c1", now, new Set())).toEqual({ today: zero, month: zero });
  });

  // Compte les joueurs de la minute en cours sans l'attendre, et une seule fois quand elle s'écrit
  it("counts the players of the minute in progress without waiting for it, and once when it is written", async () => {
    const { store } = stores();
    await store.storeActivityMinute(
      inMinute(minuteAt - MINUTE_MS, { c1: canvasMinute({ people: 1, ...players("p1") }) }),
    );
    const open = new Set(["p1", "p2"]);

    const first = await store.getCanvasAudience("c1", now, open);
    expect(await store.getCanvasAudience("c1", now, open)).toEqual(first);
    expect(first.today.activePlayers).toBe(2);
    expect(first.month.activePlayers).toBe(2);

    await store.storeActivityMinute(inMinute(minuteAt, { c1: canvasMinute({ people: 1, playerIds: open }) }));
    expect((await store.getCanvasAudience("c1", now, new Set())).today.activePlayers).toBe(2);
    const [day] = await store.listCanvasHistory("c1", "all", now);
    expect(day).toMatchObject({ activePlayers: 2 });
  });

  // Élague les minutes d'un canvas de plus de 2 jours et ses heures de plus de 366 jours, jamais un jour, et seulement les canvas demandés
  it("prunes a canvas's minutes older than 2 days and hours older than 366 days, never a day, and only the canvases asked", async () => {
    const { keys, store, signups } = stores();
    const expiredMinute = toActivityPointStarts(now - ACTIVITY_CANVAS_MINUTES_RETENTION_MS - MINUTE_MS);
    const expiredHour = toActivityPointStarts(now - ACTIVITY_HOURS_RETENTION_MS - HOUR_MS);
    for (const canvasId of ["c1", "c2"])
      for (const at of [expiredMinute.minute, expiredHour.minute, minuteAt])
        await store.storeActivityMinute(inMinute(at, { [canvasId]: canvasMinute({ people: 1 }) }));
    await signups.storeSignup({ nowMs: expiredMinute.minute, discoveredViaCanvasId: "c1" });

    await store.pruneActivity(now, ["c1"]);

    const [c1, c2] = [keys.canvas("c1"), keys.canvas("c2")];
    expect(await redis.hkeys(c1.minutes)).toEqual([String(minuteAt)]);
    expect((await redis.hkeys(c1.hours)).sort()).toEqual(
      [`${expiredMinute.hour}`, `${expiredMinute.hour}:signups`, `${hourAt}`].sort(),
    );
    expect(await redis.hlen(c1.days)).toBe(4);
    expect(await redis.hlen(c2.minutes)).toBe(3);
    expect(await redis.hlen(c2.hours)).toBe(3);
    expect((await redis.hkeys(keys.minutes)).sort()).toEqual(
      [`${expiredMinute.minute}`, `${expiredMinute.minute}:signups`, `${minuteAt}`].sort(),
    );
  });

  // Ne garde aucun identifiant de joueur : des compteurs et des HyperLogLog seulement
  it("keeps no player identifier: counters and HyperLogLogs only", async () => {
    const { keys, store } = stores();
    const prefix = keys.minutes.slice(0, -"minute".length);
    await store.storeActivityMinute(
      inMinute(minuteAt - MINUTE_MS, { c1: canvasMinute({ people: 1, ...players("player-4242") }) }),
    );

    let dumped = "";
    for await (const names of redis.scanStream({ match: `${prefix}cv:*`, count: 1000 }))
      for (const name of names as string[]) {
        const type = await redis.type(name);
        const content =
          type === "hash" ? JSON.stringify(await redis.hgetall(name)) : await redis.getBuffer(name);
        dumped += `${name}=${content}\n`;
      }

    expect(dumped).toContain("players:");
    expect(dumped).not.toContain("4242");
  });
});

// Écart §5.1 (JOURNAL 2026-10-08) : les canvas en live, un pic pour tout LivePlace, une somme de minutes pour un canvas.
describe("the live in the points (écart §5.1, JOURNAL 2026-10-08)", () => {
  // Garde le pic des canvas en live de tout LivePlace, jamais leur somme, sur la minute, l'heure et le jour
  it("keeps the peak of the live canvases of the whole of LivePlace, never their sum, on the minute, hour and day", async () => {
    const { store } = stores();

    await store.storeActivityMinute(minute(minuteAt - 2 * MINUTE_MS, { streamed: 3, live: 2 }));
    await store.storeActivityMinute(minute(minuteAt - MINUTE_MS, { streamed: 3, live: 1 }));
    await store.storeActivityMinute(minute(minuteAt - MINUTE_MS, { streamed: 3, live: 1 }));

    expect((await store.listActivityHistory("day", now)).map(({ live }) => live)).toEqual([2, 1]);
    expect(await store.listActivityHistory("month", now)).toMatchObject([{ at: hourAt, live: 2 }]);
    expect(await store.listActivityHistory("all", now)).toMatchObject([{ at: dayAt, live: 2 }]);
  });

  // Somme les minutes en live d'un canvas à l'heure et au jour : 0 ou 1 à la minute, jamais un pic
  it("sums the minutes in live of a canvas on its hour and day: 0 or 1 on the minute, never a peak", async () => {
    const { store } = stores();
    const live = canvasMinute({ people: 1, obsViews: 1, live: 1 });

    for (const minutesAgo of [4, 3, 2])
      await store.storeActivityMinute(inMinute(minuteAt - minutesAgo * MINUTE_MS, { c1: live }));
    await store.storeActivityMinute(
      inMinute(minuteAt - MINUTE_MS, { c1: canvasMinute({ people: 1, obsViews: 1 }) }),
    );

    expect((await store.listCanvasHistory("c1", "day", now)).map(({ live: minutes }) => minutes)).toEqual([
      1, 1, 1, 0,
    ]);
    expect(await store.listCanvasHistory("c1", "month", now)).toMatchObject([{ at: hourAt, live: 3 }]);
    expect(await store.listCanvasHistory("c1", "all", now)).toMatchObject([{ at: dayAt, live: 3 }]);
  });

  // Lit un point d'avant le live, à six champs, avec zéro minute en live, et le réécrit à sept champs avec le nouveau
  it("reads a point from before the live, with six fields, as zero, and writes it again with seven", async () => {
    const { keys, store } = stores();
    const before = minuteAt - MINUTE_MS;
    const canvas = keys.canvas("c1");
    for (const [hash, at] of [
      [keys.minutes, before],
      [keys.hours, hourAt],
      [keys.days, dayAt],
      [canvas.minutes, before],
      [canvas.hours, hourAt],
      [canvas.days, dayAt],
    ] as const)
      await redis.hset(hash, String(at), "5,2,30,4,1,9");

    const seen = { people: 5, pixels: 30, visits: 4, visitMinutes: 9, signups: 0 };
    expect(await store.listActivityHistory("day", now)).toEqual([
      { at: before, ...seen, streamed: 2, live: 0, phoneVisits: 1 },
    ]);
    expect(await store.listCanvasHistory("c1", "day", now)).toEqual([
      { at: before, ...seen, obsViews: 2, live: 0 },
    ]);

    await store.storeActivityMinute({
      ...inMinute(before, { c1: canvasMinute({ obsViews: 3, live: 1, pixels: 1 }) }),
      streamed: 3,
      live: 2,
      pixels: 1,
    });

    expect(await redis.hget(keys.minutes, String(before))).toBe("5,3,31,4,1,9,2");
    expect(await redis.hget(keys.hours, String(hourAt))).toBe("5,3,31,4,1,9,2");
    expect(await redis.hget(keys.days, String(dayAt))).toBe("5,3,31,4,1,9,2");
    expect(await redis.hget(canvas.minutes, String(before))).toBe("5,3,31,4,1,9,1");
    expect(await redis.hget(canvas.days, String(dayAt))).toBe("5,3,31,4,1,9,1");
    expect(await store.listActivityHistory("all", now)).toMatchObject([{ at: dayAt, streamed: 3, live: 2 }]);
    expect(await store.listCanvasHistory("c1", "all", now)).toMatchObject([
      { at: dayAt, obsViews: 3, live: 1 },
    ]);
  });
});

// Écart §5.1 (JOURNAL 2026-10-08) : une coupure de moins de 5 minutes se comble, atomiquement, dans les points.
describe("the gap of a stream in the points (écart §5.1, JOURNAL 2026-10-08)", () => {
  const at = (minutesAgo: number) => minuteAt - minutesAgo * MINUTE_MS;
  const streamedBy = (...ats: number[]) =>
    ats.map((minuteStart) => minute(minuteStart, { people: 1, streamed: 1 }));
  const globalOf = async (store: ReturnType<typeof stores>["store"], period: "day" | "month" | "all") =>
    (await store.listActivityHistory(period, now)).map(({ at: pointAt, streamed, live }) => [
      pointAt,
      streamed,
      live,
    ]);
  const canvasOf = async (
    store: ReturnType<typeof stores>["store"],
    period: "day" | "month" | "all",
    canvasId = "c1",
  ) =>
    (await store.listCanvasHistory(canvasId, period, now)).map(({ at: pointAt, obsViews, live }) => [
      pointAt,
      obsViews,
      live,
    ]);

  // Compte le canvas comme streamé dans les minutes du trou : un de plus pour tout LivePlace, une vue OBS pour le canvas, créant son point
  it("counts the canvas as streamed in the minutes of the gap: one more for the whole, an OBS view for the canvas, creating its point", async () => {
    const { store } = stores();
    for (const closed of streamedBy(at(4), at(3), at(1))) await store.storeActivityMinute(closed);
    await store.storeActivityMinute(minute(at(2), { people: 1 }));
    await store.storeActivityMinute(inMinute(at(4), { c1: canvasMinute({ people: 1, obsViews: 1 }) }));

    await store.storeActivityGap({ canvasId: "c1", kind: "streamed", minutes: [at(3), at(2)] });

    expect(await globalOf(store, "day")).toEqual([
      [at(4), 1, 0],
      [at(3), 2, 0],
      [at(2), 1, 0],
      [at(1), 1, 0],
    ]);
    expect(await canvasOf(store, "day")).toEqual([
      [at(4), 1, 0],
      [at(3), 1, 0],
      [at(2), 1, 0],
    ]);
  });

  // Monte le pic de l'heure et du jour à la valeur comblée, sans la sommer
  it("raises the peak of the hour and the day to the filled value, without summing it", async () => {
    const { store } = stores();
    for (const closed of streamedBy(at(4), at(3), at(2))) await store.storeActivityMinute(closed);

    await store.storeActivityGap({ canvasId: "c1", kind: "streamed", minutes: [at(3), at(2)] });

    expect(await globalOf(store, "month")).toEqual([[hourAt, 2, 0]]);
    expect(await globalOf(store, "all")).toEqual([[dayAt, 2, 0]]);
    expect(await canvasOf(store, "month")).toEqual([[hourAt, 1, 0]]);
    expect(await canvasOf(store, "all")).toEqual([[dayAt, 1, 0]]);
  });

  // Ne crée aucun point pour tout LivePlace là où le serveur était arrêté, mais crée celui du canvas
  it("creates no point for the whole of LivePlace where the server was stopped, but creates the canvas's", async () => {
    const { store } = stores();
    await store.storeActivityMinute(minute(at(2), { people: 1 }));

    await store.storeActivityGap({ canvasId: "c1", kind: "streamed", minutes: [at(3), at(2)] });

    expect(await globalOf(store, "day")).toEqual([[at(2), 1, 0]]);
    expect(await canvasOf(store, "day")).toEqual([
      [at(3), 1, 0],
      [at(2), 1, 0],
    ]);
  });

  // Compte une minute comblée une seule fois, même rejouée, et ne recompte pas une minute où le canvas était déjà streamé
  it("counts a filled minute once, even replayed, and does not count again a minute the canvas was already streamed", async () => {
    const { store } = stores();
    for (const closed of streamedBy(at(3), at(2))) await store.storeActivityMinute(closed);
    await store.storeActivityMinute(inMinute(at(3), { c1: canvasMinute({ obsViews: 2 }) }));

    await store.storeActivityGap({ canvasId: "c1", kind: "streamed", minutes: [at(3), at(2)] });
    const once = [await globalOf(store, "day"), await canvasOf(store, "month")];
    await store.storeActivityGap({ canvasId: "c1", kind: "streamed", minutes: [at(3), at(2)] });

    expect(once).toEqual([
      [
        [at(3), 1, 0],
        [at(2), 2, 0],
      ],
      [[hourAt, 2, 0]],
    ]);
    expect([await globalOf(store, "day"), await canvasOf(store, "month")]).toEqual(once);
    expect(await canvasOf(store, "day")).toEqual([
      [at(3), 2, 0],
      [at(2), 1, 0],
    ]);
  });

  // Compte le canvas comme en live dans les minutes du trou : un de plus pour tout LivePlace, une minute en live pour le canvas, sommée à l'heure et au jour
  it("counts the canvas as live in the minutes of the gap: one more for the whole, a minute in live for the canvas, summed on the hour and day", async () => {
    const { store } = stores();
    for (const closed of streamedBy(at(4), at(3), at(2), at(1)))
      await store.storeActivityMinute({ ...closed, live: 1 });

    await store.storeActivityGap({ canvasId: "c1", kind: "live", minutes: [at(3), at(2)] });
    await store.storeActivityGap({ canvasId: "c1", kind: "live", minutes: [at(3), at(2)] });

    expect(await globalOf(store, "day")).toEqual([
      [at(4), 1, 1],
      [at(3), 1, 2],
      [at(2), 1, 2],
      [at(1), 1, 1],
    ]);
    expect(await globalOf(store, "all")).toEqual([[dayAt, 1, 2]]);
    expect(await canvasOf(store, "day")).toEqual([
      [at(3), 0, 1],
      [at(2), 0, 1],
    ]);
    expect(await canvasOf(store, "month")).toEqual([[hourAt, 0, 2]]);
    expect(await canvasOf(store, "all")).toEqual([[dayAt, 0, 2]]);
  });

  // Compte à part les minutes streamées et en live d'un même trou, et un canvas à la fois
  it("counts the streamed and the live minutes of one gap apart, and one canvas at a time", async () => {
    const { store } = stores();
    for (const closed of streamedBy(at(3), at(2))) await store.storeActivityMinute(closed);

    await store.storeActivityGap({ canvasId: "c1", kind: "streamed", minutes: [at(3), at(2)] });
    await store.storeActivityGap({ canvasId: "c1", kind: "live", minutes: [at(3), at(2)] });
    await store.storeActivityGap({ canvasId: "c2", kind: "streamed", minutes: [at(2)] });

    expect(await globalOf(store, "day")).toEqual([
      [at(3), 2, 1],
      [at(2), 3, 1],
    ]);
    expect(await canvasOf(store, "day")).toEqual([
      [at(3), 1, 1],
      [at(2), 1, 1],
    ]);
    expect(await canvasOf(store, "day", "c2")).toEqual([[at(2), 1, 0]]);
  });

  // Range les minutes d'un trou qui passe l'heure dans leur propre heure
  it("puts the minutes of a gap across the hour in their own hour", async () => {
    const { store } = stores();
    const minutes = [hourAt - MINUTE_MS, hourAt];
    for (const closed of streamedBy(...minutes)) await store.storeActivityMinute(closed);

    await store.storeActivityGap({ canvasId: "c1", kind: "live", minutes });

    expect(await canvasOf(store, "month")).toEqual([
      [hourAt - HOUR_MS, 0, 1],
      [hourAt, 0, 1],
    ]);
  });

  // Compte aussi le canvas parmi les streamers actifs du nouveau jour quand le trou passe minuit, et ne touche pas aux streamers pour un live
  it("also counts the canvas among the active streamers of the new day when the gap crosses midnight, and leaves the streamers alone for a live", async () => {
    const { keys, store } = stores();
    const midnight = toActivityPointStarts(now + DAY_MS).day;
    const minutes = [midnight - MINUTE_MS, midnight];
    for (const closed of streamedBy(...minutes)) await store.storeActivityMinute(closed);
    const yesterday = toParisDay(midnight - MINUTE_MS);
    const today = toParisDay(midnight);

    await store.storeActivityGap({ canvasId: "c1", kind: "live", minutes });
    expect(await redis.exists(keys.activeStreamers(yesterday), keys.activeStreamers(today))).toBe(0);

    await store.storeActivityGap({ canvasId: "c1", kind: "streamed", minutes });

    expect(await redis.pfcount(keys.activeStreamers(yesterday))).toBe(1);
    expect(await redis.pfcount(keys.activeStreamers(today))).toBe(1);
    expect(await redis.hget(keys.days, toActiveField(midnight))).toBe("0,0,1");
    const ttl = await redis.ttl(keys.activeStreamers(today));
    expect(ttl).toBeGreaterThan(ACTIVE_TTL_SECONDS - 5);
  });

  // N'écrit rien pour un trou sans minute
  it("writes nothing for a gap without a minute", async () => {
    const { keys, store } = stores();

    await store.storeActivityGap({ canvasId: "c1", kind: "streamed", minutes: [] });

    expect(await redis.exists(keys.canvas("c1").minutes, keys.canvas("c1").days, keys.minutes)).toBe(0);
  });
});

// Écart §5.1 (JOURNAL 2026-10-08) : la dernière vue OBS et le dernier live vus de chaque canvas survivent à un redémarrage.
describe("the times a canvas was seen, in Redis (écart §5.1, JOURNAL 2026-10-08)", () => {
  // Verse les heures vues d'un canvas et les relit, un champ vide pour ce qui n'a jamais été vu, et les remplace au versement suivant
  it("stores the times a canvas was seen and reads them back, a field left out for what was never seen, replaced at the next storing", async () => {
    const { keys, store } = stores();

    await store.storeSeen(
      new Map<string, CanvasSeen>([
        ["c1", { obsSeenAt: now, liveSeenAt: now - 2000 }],
        ["c2", { obsSeenAt: now }],
        ["c3", { liveSeenAt: now }],
      ]),
    );
    await store.storeSeen(
      new Map<string, CanvasSeen>([["c1", { obsSeenAt: now + 60_000, liveSeenAt: now - 2000 }]]),
    );

    expect(await store.listSeen()).toEqual(
      new Map<string, CanvasSeen>([
        ["c1", { obsSeenAt: now + 60_000, liveSeenAt: now - 2000 }],
        ["c2", { obsSeenAt: now }],
        ["c3", { liveSeenAt: now }],
      ]),
    );
    expect(await redis.hget(keys.seen, "c2")).toBe(`${now},`);
    expect(await redis.hget(keys.seen, "c3")).toBe(`,${now}`);
  });

  // Ne lit rien, ni n'écrit, quand aucun canvas n'a été vu
  it("reads nothing, and writes nothing, when no canvas was seen", async () => {
    const { keys, store } = stores();

    await store.storeSeen(new Map());

    expect(await store.listSeen()).toEqual(new Map());
    expect(await redis.exists(keys.seen)).toBe(0);
  });

  // Élague ce qui a été vu il y a plus de 10 minutes, d'après la plus récente de ses deux heures, et jamais le reste
  it("prunes what was seen more than 10 minutes ago, by the more recent of its two times, and nothing else", async () => {
    const { store } = stores();
    await store.storeSeen(
      new Map<string, CanvasSeen>([
        ["1-old", { obsSeenAt: now - 11 * MINUTE_MS, liveSeenAt: now - 12 * MINUTE_MS }],
        ["2-old", { liveSeenAt: now - 10 * MINUTE_MS - 1 }],
        ["3-kept", { obsSeenAt: now - 11 * MINUTE_MS, liveSeenAt: now - 9 * MINUTE_MS }],
        ["4-kept", { obsSeenAt: now - 10 * MINUTE_MS }],
      ]),
    );

    await store.pruneSeen(now);

    expect([...(await store.listSeen()).keys()].sort()).toEqual(["3-kept", "4-kept"]);
  });

  // Ne garde que des identifiants de canvas et des heures : un HASH, aucun nom
  it("keeps canvas ids and times only: a hash, no name", async () => {
    const { keys, store } = stores();

    await store.storeSeen(new Map<string, CanvasSeen>([["canvas-4242", { obsSeenAt: now }]]));

    expect(await redis.type(keys.seen)).toBe("hash");
    expect(await redis.hgetall(keys.seen)).toEqual({ "canvas-4242": `${now},` });
  });
});
