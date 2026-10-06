// L'activité dans Redis (écart §5.1, JOURNAL 2026-10-06) : des nombres sous `activity:`, aucun nom ni identifiant dans
// l'historique. Le gateway écrit chaque minute et élague ; le web compte un nouveau compte, sans script.

import { readFileSync } from "node:fs";
import { HOUR_MS, MINUTE_MS, type Timestamp, toActivityPointStarts, toParisDay } from "@liveplace/domain";
import type { ActivityPoint, ActivityStore, SignupWrites } from "@liveplace/domain/ports";
import type { ChainableCommander, Redis, Result as RedisResult } from "ioredis";
import {
  ACTIVITY_HOURS_RETENTION_MS,
  ACTIVITY_MINUTES_RETENTION_MS,
  buildActivityKeys,
  CANVAS_PIXELS_TTL_SECONDS,
  SIGNUPS_TTL_SECONDS,
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

// `stored` : `people,streamed,pixels`, écrit par activity.lua.
const toPoint = (at: Timestamp, stored: string, signups: string | null | undefined): ActivityPoint => {
  const [people = 0, streamed = 0, pixels = 0] = stored.split(",").map(Number);
  return { at, people, streamed, pixels, signups: Number(signups ?? 0) };
};

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

  return {
    async storeActivityMinute({ at, people, streamed, pixels, pixelsByCanvas }) {
      const { minute, hour, day } = toActivityPointStarts(at);
      const transaction = redis
        .multi()
        .activity(keys.minutes, keys.hours, keys.days, minute, hour, day, people, streamed, pixels);
      if (pixelsByCanvas.size > 0)
        transaction
          .hset(keys.canvasPixels(minute), Object.fromEntries(pixelsByCanvas))
          .expire(keys.canvasPixels(minute), CANVAS_PIXELS_TTL_SECONDS);
      await execAll(transaction);
    },

    // Le champ d'un point et celui de ses nouveaux comptes commencent tous deux par son début.
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
        .map(([field, stored]) => toPoint(Number(field), stored, fields[toSignupsField(Number(field))]))
        .sort((left, right) => left.at - right.at);
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
