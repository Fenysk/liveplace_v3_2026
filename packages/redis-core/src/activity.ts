// L'activité dans Redis (écart §5.1, JOURNAL 2026-10-06 et 2026-10-07) : des nombres sous `activity:`, aucun nom ni
// identifiant dans l'historique ; les distincts d'un jour, dans des HyperLogLog. Le gateway écrit chaque minute et élague ;
// le web compte un nouveau compte, sans script. Chaque canvas a ses propres points, sous `activity:cv:<canvasId>:`.

import { readFileSync } from "node:fs";
import {
  type ActivityPointStarts,
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
  CanvasActivityPoint,
  CanvasAudience,
  SignupWrites,
} from "@liveplace/domain/ports";
import type { ChainableCommander, Redis, Result as RedisResult } from "ioredis";
import {
  ACTIVE_TTL_SECONDS,
  ACTIVITY_CANVAS_MINUTES_RETENTION_MS,
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

// Les visites, les visites au téléphone et le temps passé de plusieurs points : seuls chiffres de l'audience qui s'additionnent.
const sumVisits = (points: readonly ActivityPoint[]) =>
  points.reduce(
    (sum, point) => ({
      visits: sum.visits + point.visits,
      phoneVisits: sum.phoneVisits + point.phoneVisits,
      visitMinutes: sum.visitMinutes + point.visitMinutes,
    }),
    { visits: 0, phoneVisits: 0, visitMinutes: 0 },
  );

// L'audience d'une période : la somme de ses points, et ses distincts `accounts,players,streamers` déjà comptés.
const toAudienceCounts = (
  points: readonly ActivityPoint[],
  [activeAccounts = 0, activePlayers = 0, activeStreamers = 0]: readonly number[],
): ActivityAudience["today"] => ({ ...sumVisits(points), activeAccounts, activePlayers, activeStreamers });

// L'audience d'un canvas : la somme de ses points, nouveaux comptes compris, et ses joueurs actifs déjà comptés.
const toCanvasAudienceCounts = (
  points: readonly ActivityPoint[],
  activePlayers: number,
): CanvasAudience["today"] => ({
  ...sumVisits(points),
  activePlayers,
  signups: points.reduce((sum, point) => sum + point.signups, 0),
});

// Le point d'un canvas, lu comme celui du global : ses vues OBS prennent la place des canvas streamés.
const toCanvasPoint = ({
  at,
  people,
  streamed,
  pixels,
  signups,
  visits,
  visitMinutes,
}: ActivityPoint): CanvasActivityPoint => ({
  at,
  people,
  obsViews: streamed,
  pixels,
  visits,
  visitMinutes,
  signups,
});

// Les débuts, du plus ancien au plus récent, de `count` points espacés de `stepMs` jusqu'à `lastAt`.
const pointStarts = (lastAt: Timestamp, stepMs: number, count: number): Timestamp[] =>
  Array.from({ length: count }, (_, index) => lastAt - (count - 1 - index) * stepMs);

// Les trois HASH d'un historique, celui du global ou celui d'un canvas.
type PointHashes = { minutes: string; hours: string; days: string };

// Un nouveau compte de plus dans les trois points d'un instant.
const addSignupPoints = (
  transaction: ChainableCommander,
  hashes: PointHashes,
  { minute, hour, day }: ActivityPointStarts,
) =>
  transaction
    .hincrby(hashes.minutes, toSignupsField(minute), 1)
    .hincrby(hashes.hours, toSignupsField(hour), 1)
    .hincrby(hashes.days, toSignupsField(day), 1);

// Les six nombres d'une minute, dans l'ordre d'activity.lua : les deux premiers sont des pics, les quatre autres des sommes.
type MinuteCounts = readonly [number, number, number, number, number, number];

const addMinuteCounts = (
  transaction: ChainableCommander,
  hashes: PointHashes,
  { minute, hour, day }: ActivityPointStarts,
  counts: MinuteCounts,
) => transaction.activity(hashes.minutes, hashes.hours, hashes.days, minute, hour, day, ...counts);

// Un identifiant déjà compté ne change rien : verser deux fois la même minute est sans dégât.
const addMembers = (transaction: ChainableCommander, key: string, members: ReadonlySet<string>) =>
  transaction.pfadd(key, ...members).expire(key, ACTIVE_TTL_SECONDS);

export function createSignupWrites(redis: Redis, keys: ActivityKeys = buildActivityKeys()): SignupWrites {
  return {
    // Le compte se compte aussi dans les points du canvas d'où il vient, quand le web le connaît (JOURNAL 2026-10-07).
    async storeSignup({ nowMs, discoveredViaUserId, discoveredViaCanvasId }) {
      const starts = toActivityPointStarts(nowMs);
      const signups = keys.signups(toParisDay(nowMs));
      const transaction = redis.multi();
      addSignupPoints(transaction, keys, starts);
      if (discoveredViaCanvasId) addSignupPoints(transaction, keys.canvas(discoveredViaCanvasId), starts);
      transaction
        .hincrby(signups, discoveredViaUserId ?? WITHOUT_DISCOVERED_VIA, 1)
        .expire(signups, SIGNUPS_TTL_SECONDS);
      await execAll(transaction);
    },
  };
}

// Un point lu à son début : ce que le gateway a écrit, et ce que le web a compté de nouveaux comptes à côté.
type StoredPoint = { at: Timestamp; stored: string | null | undefined; signups: string | null | undefined };

export function createActivityStore(redis: Redis, keys: ActivityKeys = buildActivityKeys()): ActivityStore {
  redis.defineCommand("activity", {
    numberOfKeys: 3,
    lua: readFileSync(new URL("./activity.lua", import.meta.url), "utf8"),
  });

  const getStoredPoints = async (hash: string, ats: Timestamp[]): Promise<StoredPoint[]> => {
    const values = await redis.hmget(hash, ...ats.flatMap((at) => [String(at), toSignupsField(at)]));
    return ats.map((at, index) => ({ at, stored: values[2 * index], signups: values[2 * index + 1] }));
  };

  // Un point n'existe que si le gateway l'a écrit : sans lui, la courbe laisse un trou.
  const listPoints = async (hash: string, ats: Timestamp[]): Promise<ActivityPoint[]> =>
    (await getStoredPoints(hash, ats)).flatMap(({ at, stored, signups }) =>
      stored ? [toPoint(at, stored, signups)] : [],
    );

  // Un point d'un canvas existe dès qu'un nouveau compte y a été compté : absent, il vaut zéro pour qui le lit.
  const listCanvasPoints = async (hash: string, ats: Timestamp[]): Promise<CanvasActivityPoint[]> =>
    (await getStoredPoints(hash, ats)).flatMap(({ at, stored, signups }) =>
      stored || signups ? [toCanvasPoint(toPoint(at, stored ?? "", signups))] : [],
    );

  // Les jours d'un canvas, avec les joueurs actifs de chacun : le champ d'un jour, de ses comptes et de ses joueurs
  // commencent tous par son début.
  const listCanvasDays = async (hash: string): Promise<CanvasActivityPoint[]> => {
    const fields = await redis.hgetall(hash);
    const dayAts = new Set(Object.keys(fields).map((field) => Number.parseInt(field, 10)));
    return [...dayAts]
      .sort((left, right) => left - right)
      .map((at) => ({
        ...toCanvasPoint(toPoint(at, fields[String(at)] ?? "", fields[toSignupsField(at)])),
        activePlayers: Number(fields[toActiveField(at)] ?? 0),
      }));
  };

  // Les comptes, joueurs et streamers : la clé d'un jour de chacun, et ce que `ids` y verse.
  const activeKinds = (ids: ActiveIds) => [
    { toKey: keys.activeAccounts, members: ids.accountIds },
    { toKey: keys.activePlayers, members: ids.playerIds },
    { toKey: keys.activeStreamers, members: ids.streamedCanvasIds },
  ];

  const addActiveIds = async (parisDay: string, ids: ActiveIds): Promise<void> => {
    const filled = activeKinds(ids).filter(({ members }) => members.size > 0);
    if (filled.length === 0) return;
    const transaction = redis.multi();
    for (const { toKey, members } of filled) addMembers(transaction, toKey(parisDay), members);
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

  // Les joueurs d'un canvas pour un jour, et leur nombre dans le point du jour : sans lui, la courbe Tout le perdrait.
  const storeCanvasPlayers = async (
    canvasId: string,
    at: Timestamp,
    playerIds: ReadonlySet<string>,
  ): Promise<void> => {
    if (playerIds.size === 0) return;
    const { activePlayers, days } = keys.canvas(canvasId);
    const key = activePlayers(toParisDay(at));
    await execAll(addMembers(redis.multi(), key, playerIds));
    await redis.hset(days, toActiveField(toActivityPointStarts(at).day), await redis.pfcount(key));
  };

  // Le champ d'un point, celui de ses nouveaux comptes et celui de ses distincts commencent tous par son début.
  const pruneHash = async (hash: string, retentionMs: number, nowMs: Timestamp): Promise<void> => {
    const fields = await redis.hkeys(hash);
    const expired = fields.filter((field) => Number.parseInt(field, 10) < nowMs - retentionMs);
    if (expired.length > 0) await redis.hdel(hash, ...expired);
  };

  return {
    // Les distincts d'abord, qui se rejouent sans dégât : une minute qui échoue plus loin revient au tic suivant, et ses
    // sommes ne s'écrivent qu'une fois, celles des canvas avec les siennes.
    async storeActivityMinute(closed) {
      const { at, people, streamed, pixels, visits, phoneVisits, visitMinutes, pixelsByCanvas, canvases } =
        closed;
      await storeActiveDay(closed);
      await Promise.all(
        [...canvases].map(([canvasId, { playerIds }]) => storeCanvasPlayers(canvasId, at, playerIds)),
      );
      const starts = toActivityPointStarts(at);
      const transaction = redis.multi();
      addMinuteCounts(transaction, keys, starts, [
        people,
        streamed,
        pixels,
        visits,
        phoneVisits,
        visitMinutes,
      ]);
      for (const [canvasId, counts] of canvases)
        addMinuteCounts(transaction, keys.canvas(canvasId), starts, [
          counts.people,
          counts.obsViews,
          counts.pixels,
          counts.visits,
          counts.phoneVisits,
          counts.visitMinutes,
        ]);
      if (pixelsByCanvas.size > 0)
        transaction
          .hset(keys.canvasPixels(starts.minute), Object.fromEntries(pixelsByCanvas))
          .expire(keys.canvasPixels(starts.minute), CANVAS_PIXELS_TTL_SECONDS);
      await execAll(transaction);
    },

    async pruneActivity(nowMs, canvasIds = []) {
      await pruneHash(keys.minutes, ACTIVITY_MINUTES_RETENTION_MS, nowMs);
      await pruneHash(keys.hours, ACTIVITY_HOURS_RETENTION_MS, nowMs);
      for (const canvasId of canvasIds) {
        const { minutes, hours } = keys.canvas(canvasId);
        await pruneHash(minutes, ACTIVITY_CANVAS_MINUTES_RETENTION_MS, nowMs);
        await pruneHash(hours, ACTIVITY_HOURS_RETENTION_MS, nowMs);
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

    // Comme `listActivityHistory`, pour un canvas : seuls les points qui existent, un point absent vaut zéro pour qui lit.
    async listCanvasHistory(canvasId, period, nowMs) {
      const { minutes, hours, days } = keys.canvas(canvasId);
      const { minute, hour } = toActivityPointStarts(nowMs);
      if (period === "day")
        return listCanvasPoints(minutes, pointStarts(minute - MINUTE_MS, MINUTE_MS, DAY_MINUTES));
      if (period === "month") return listCanvasPoints(hours, pointStarts(hour, HOUR_MS, MONTH_HOURS));
      return listCanvasDays(days);
    },

    // Comme `getAudience`, pour un canvas : ses 30 points du jour, ses joueurs en union de leurs HyperLogLog.
    async getCanvasAudience(canvasId, nowMs, openedPlayerIds) {
      const { days, activePlayers } = keys.canvas(canvasId);
      const audienceDays = toAudienceDays(nowMs);
      const today = toParisDay(nowMs);
      if (openedPlayerIds.size > 0)
        await execAll(addMembers(redis.multi(), activePlayers(today), openedPlayerIds));
      const [stored, todayPlayers, monthPlayers] = await Promise.all([
        getStoredPoints(
          days,
          audienceDays.map(({ at }) => at),
        ),
        redis.pfcount(activePlayers(today)),
        redis.pfcount(...audienceDays.map(({ day }) => activePlayers(day))),
      ]);
      const points = stored.map(({ at, stored: value, signups }) => toPoint(at, value ?? "", signups));
      const todayAt = toActivityPointStarts(nowMs).day;
      return {
        today: toCanvasAudienceCounts(
          points.filter(({ at }) => at === todayAt),
          todayPlayers,
        ),
        month: toCanvasAudienceCounts(points, monthPlayers),
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
