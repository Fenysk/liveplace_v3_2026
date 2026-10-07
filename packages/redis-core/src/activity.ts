// L'activité dans Redis (écart §5.1, JOURNAL 2026-10-06 et 2026-10-07) : des nombres sous `activity:`, aucun nom ni
// identifiant dans l'historique ; les distincts d'un jour, dans des HyperLogLog. Le gateway écrit chaque minute et élague ;
// le web compte un nouveau compte, sans script.

import { readFileSync } from "node:fs";
import {
  HOUR_MS,
  MINUTE_MS,
  type Timestamp,
  toActivityPointStarts,
  toAudienceDays,
  toParisDay,
} from "@liveplace/domain";
import type {
  ActiveIds,
  ActivityAudience,
  ActivityPoint,
  ActivityStore,
  SignupWrites,
} from "@liveplace/domain/ports";
import type { ChainableCommander, Redis, Result as RedisResult } from "ioredis";
import {
  ACTIVE_TTL_SECONDS,
  ACTIVITY_HOURS_RETENTION_MS,
  ACTIVITY_MINUTES_RETENTION_MS,
  buildActivityKeys,
  CANVAS_PIXELS_TTL_SECONDS,
  SIGNUPS_TTL_SECONDS,
  toActiveField,
  toSignupsField,
  userKey,
  WITHOUT_DISCOVERED_VIA,
} from "./keys";

declare module "ioredis" {
  interface RedisCommander<Context> {
    activity(...args: (string | number)[]): RedisResult<null, Context>;
  }
}

type ActivityKeys = ReturnType<typeof buildActivityKeys>;

// §5.1 : 24 h d'un point par minute, 30 jours d'un point par heure.
const DAY_MINUTES = 1440;
const MONTH_HOURS = 720;
const POINT_FIELD = /^\d+$/; // le début d'un point ; celui de ses nouveaux comptes a un suffixe

// Un MULTI ne lève pas pour une commande refusée : ioredis la rend à sa place.
const execAll = async (transaction: ChainableCommander): Promise<void> => {
  for (const [error] of (await transaction.exec()) ?? []) if (error) throw error;
};

// `stored` : `people,streamed,pixels,visits,phoneVisits,visitMinutes`, écrit par activity.lua ; un point d'avant l'audience
// n'a que les trois premiers.
const toPoint = (at: Timestamp, stored: string, signups: string | null | undefined): ActivityPoint => {
  const [people = 0, streamed = 0, pixels = 0, visits = 0, phoneVisits = 0, visitMinutes = 0] = stored
    .split(",")
    .map(Number);
  return { at, people, streamed, pixels, signups: Number(signups ?? 0), visits, phoneVisits, visitMinutes };
};

// `stored` : `accounts,players,streamers` d'un jour, écrit à côté de son point ; sans lui, le jour est d'avant l'audience.
const toActiveCounts = (stored: string | undefined) => {
  const [activeAccounts = 0, activePlayers = 0, activeStreamers = 0] = (stored ?? "").split(",").map(Number);
  return { activeAccounts, activePlayers, activeStreamers };
};

// L'audience d'une période : la somme de ses points, et ses distincts `accounts,players,streamers` déjà comptés.
const toAudienceCounts = (
  points: readonly ActivityPoint[],
  [activeAccounts = 0, activePlayers = 0, activeStreamers = 0]: readonly number[],
): ActivityAudience["today"] => ({
  ...points.reduce(
    (sum, point) => ({
      visits: sum.visits + point.visits,
      phoneVisits: sum.phoneVisits + point.phoneVisits,
      visitMinutes: sum.visitMinutes + point.visitMinutes,
    }),
    { visits: 0, phoneVisits: 0, visitMinutes: 0 },
  ),
  activeAccounts,
  activePlayers,
  activeStreamers,
});

// Les débuts, du plus ancien au plus récent, de `count` points espacés de `stepMs` jusqu'à `lastAt`.
const pointStarts = (lastAt: Timestamp, stepMs: number, count: number): Timestamp[] =>
  Array.from({ length: count }, (_, index) => lastAt - (count - 1 - index) * stepMs);

export function createSignupWrites(redis: Redis, keys: ActivityKeys = buildActivityKeys()): SignupWrites {
  return {
    async storeSignup({ nowMs, discoveredViaUserId }) {
      const { minute, hour, day } = toActivityPointStarts(nowMs);
      const signups = keys.signups(toParisDay(nowMs));
      await execAll(
        redis
          .multi()
          .hincrby(keys.minutes, toSignupsField(minute), 1)
          .hincrby(keys.hours, toSignupsField(hour), 1)
          .hincrby(keys.days, toSignupsField(day), 1)
          .hincrby(signups, discoveredViaUserId ?? WITHOUT_DISCOVERED_VIA, 1)
          .expire(signups, SIGNUPS_TTL_SECONDS),
      );
    },
  };
}

export function createActivityStore(redis: Redis, keys: ActivityKeys = buildActivityKeys()): ActivityStore {
  redis.defineCommand("activity", {
    numberOfKeys: 3,
    lua: readFileSync(new URL("./activity.lua", import.meta.url), "utf8"),
  });

  // Un point n'existe que si le gateway l'a écrit : sans lui, la courbe laisse un trou.
  const listPoints = async (hash: string, ats: Timestamp[]): Promise<ActivityPoint[]> => {
    const values = await redis.hmget(hash, ...ats.flatMap((at) => [String(at), toSignupsField(at)]));
    return ats.flatMap((at, index) => {
      const stored = values[2 * index];
      return stored ? [toPoint(at, stored, values[2 * index + 1])] : [];
    });
  };

  // Les comptes, joueurs et streamers : la clé d'un jour de chacun, et ce que `ids` y verse.
  const activeKinds = (ids: ActiveIds) => [
    { toKey: keys.activeAccounts, members: ids.accountIds },
    { toKey: keys.activePlayers, members: ids.playerIds },
    { toKey: keys.activeStreamers, members: ids.streamedCanvasIds },
  ];

  // Un identifiant déjà compté ne change rien : verser deux fois la même minute est sans dégât.
  const addActiveIds = async (parisDay: string, ids: ActiveIds): Promise<void> => {
    const filled = activeKinds(ids).filter(({ members }) => members.size > 0);
    if (filled.length === 0) return;
    const transaction = redis.multi();
    for (const { toKey, members } of filled)
      transaction.pfadd(toKey(parisDay), ...members).expire(toKey(parisDay), ACTIVE_TTL_SECONDS);
    await execAll(transaction);
  };

  // Les distincts du jour dans son point : sans eux, la courbe Tout les perdrait avec les HyperLogLog.
  const storeActiveDay = async (minute: ActiveIds & { at: Timestamp }): Promise<void> => {
    const parisDay = toParisDay(minute.at);
    await addActiveIds(parisDay, minute);
    const counts = await Promise.all(activeKinds(minute).map(({ toKey }) => redis.pfcount(toKey(parisDay))));
    if (counts.some((count) => count > 0))
      await redis.hset(keys.days, toActiveField(toActivityPointStarts(minute.at).day), counts.join(","));
  };

  return {
    // Les distincts d'abord, qui se rejouent sans dégât : une minute qui échoue plus loin revient au tic suivant, et ses
    // sommes ne s'écrivent qu'une fois.
    async storeActivityMinute(closed) {
      const { at, people, streamed, pixels, visits, phoneVisits, visitMinutes, pixelsByCanvas } = closed;
      await storeActiveDay(closed);
      const { minute, hour, day } = toActivityPointStarts(at);
      const transaction = redis
        .multi()
        .activity(
          keys.minutes,
          keys.hours,
          keys.days,
          minute,
          hour,
          day,
          people,
          streamed,
          pixels,
          visits,
          phoneVisits,
          visitMinutes,
        );
      if (pixelsByCanvas.size > 0)
        transaction
          .hset(keys.canvasPixels(minute), Object.fromEntries(pixelsByCanvas))
          .expire(keys.canvasPixels(minute), CANVAS_PIXELS_TTL_SECONDS);
      await execAll(transaction);
    },

    // Le champ d'un point, celui de ses nouveaux comptes et celui de ses distincts commencent tous par son début.
    async pruneActivity(nowMs) {
      for (const [hash, retentionMs] of [
        [keys.minutes, ACTIVITY_MINUTES_RETENTION_MS],
        [keys.hours, ACTIVITY_HOURS_RETENTION_MS],
      ] as const) {
        const fields = await redis.hkeys(hash);
        const expired = fields.filter((field) => Number.parseInt(field, 10) < nowMs - retentionMs);
        if (expired.length > 0) await redis.hdel(hash, ...expired);
      }
    },

    // La minute en cours n'est pas encore écrite ; l'heure et le jour en cours le sont, en partie.
    async listActivityHistory(period, nowMs) {
      const { minute, hour } = toActivityPointStarts(nowMs);
      if (period === "day")
        return listPoints(keys.minutes, pointStarts(minute - MINUTE_MS, MINUTE_MS, DAY_MINUTES));
      if (period === "month") return listPoints(keys.hours, pointStarts(hour, HOUR_MS, MONTH_HOURS));
      const fields = await redis.hgetall(keys.days);
      return Object.entries(fields)
        .filter(([field]) => POINT_FIELD.test(field))
        .map(([field, stored]) => ({
          ...toPoint(Number(field), stored, fields[toSignupsField(Number(field))]),
          ...toActiveCounts(fields[toActiveField(Number(field))]),
        }))
        .sort((left, right) => left.at - right.at);
    },

    // Les sommes des 30 points du jour, les distincts en union de leurs HyperLogLog : les commandes partent ensemble.
    async getAudience(nowMs, opened) {
      const days = toAudienceDays(nowMs);
      const today = toParisDay(nowMs);
      await addActiveIds(today, opened);
      const kinds = activeKinds(opened);
      const [stored, todayCounts, monthCounts] = await Promise.all([
        redis.hmget(keys.days, ...days.map(({ at }) => String(at))),
        Promise.all(kinds.map(({ toKey }) => redis.pfcount(toKey(today)))),
        Promise.all(kinds.map(({ toKey }) => redis.pfcount(...days.map(({ day }) => toKey(day))))),
      ]);
      const points = days.flatMap(({ at }, index) => {
        const value = stored[index];
        return value ? [toPoint(at, value, null)] : [];
      });
      const todayAt = toActivityPointStarts(nowMs).day;
      return {
        today: toAudienceCounts(
          points.filter(({ at }) => at === todayAt),
          todayCounts,
        ),
        month: toAudienceCounts(points, monthCounts),
      };
    },

    // Lu au démarrage du gateway seulement : les commandes partent ensemble sur la connexion.
    async listCanvasPixels(fromMs, toMs) {
      const ats = pointStarts(
        toMs - MINUTE_MS,
        MINUTE_MS,
        Math.max(0, Math.floor((toMs - fromMs) / MINUTE_MS)),
      );
      const minutes = await Promise.all(ats.map((at) => redis.hgetall(keys.canvasPixels(at))));
      return ats.flatMap((at, index) => {
        const counts = Object.entries(minutes[index] ?? {}).map(
          ([canvasId, count]) => [canvasId, Number(count)] as const,
        );
        return counts.length > 0 ? [{ at, pixelsByCanvas: new Map(counts) }] : [];
      });
    },

    async getDaySignups(nowMs) {
      const fields = await redis.hgetall(keys.signups(toParisDay(nowMs)));
      const counts = Object.entries(fields).map(([via, count]) => [via, Number(count)] as const);
      return {
        total: counts.reduce((sum, [, count]) => sum + count, 0),
        byDiscoveredViaUserId: new Map(counts.filter(([via]) => via !== WITHOUT_DISCOVERED_VIA)),
      };
    },

    async getUser(userId) {
      const { login, displayName, avatarUrl } = await redis.hgetall(userKey(userId));
      if (!login || !displayName) return null;
      return { userId, login, displayName, ...(avatarUrl ? { avatarUrl } : {}) };
    },
  };
}
