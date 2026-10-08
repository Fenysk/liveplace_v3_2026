// L'activité dans Redis (écart §5.1, JOURNAL 2026-10-06, 2026-10-07 et 2026-10-08) : des nombres sous `activity:`, aucun nom ni
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
  ACTIVITY_SEEN_RETENTION_MS,
  buildActivityKeys,
  CANVAS_PIXELS_TTL_SECONDS,
  SIGNUPS_TTL_SECONDS,
  toActiveField,
  toSignupsField,
  userKey,
  WITHOUT_DISCOVERED_VIA,
} from "./keys";
import { DAY_MINUTES, execAll, MONTH_HOURS, pointStarts, pruneHash } from "./pyramid";

declare module "ioredis" {
  interface RedisCommander<Context> {
    activity(...args: (string | number)[]): RedisResult<null, Context>;
    activityGap(...args: (string | number)[]): RedisResult<null, Context>;
  }
}

type ActivityKeys = ReturnType<typeof buildActivityKeys>;

const POINT_FIELD = /^\d+$/; // le début d'un point ; celui de ses nouveaux comptes a un suffixe

// `stored` : `people,streamed,pixels,visits,phoneVisits,visitMinutes,live`, écrit par activity.lua ; un point d'avant l'audience
// n'a que les trois premiers champs, un point d'avant le live (JOURNAL 2026-10-08) les six premiers : les autres valent 0.
const toFields = (stored: string) => {
  const fields = stored.split(",").map(Number);
  const [people = 0, , pixels = 0, visits = 0, phoneVisits = 0, visitMinutes = 0, live = 0] = fields;
  return { people, pixels, visits, phoneVisits, visitMinutes, live };
};

// Écart §5.1 (JOURNAL 2026-10-08) : `live` dit l'état streamé (vue OBS ouverte et streamer en live), 0 pour un point d'avant lui.
const toPoint = (at: Timestamp, stored: string, signups: string | null | undefined): ActivityPoint => {
  const { live, ...counts } = toFields(stored);
  return { at, ...counts, streamed: live, signups: Number(signups ?? 0) };
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

// Le point d'un canvas : ses minutes streamées (une somme) sont le septième champ. Son deuxième, le pic de ses vues OBS, reste
// écrit mais n'est plus lu.
const toCanvasPoint = (
  at: Timestamp,
  stored: string,
  signups: string | null | undefined,
): CanvasActivityPoint => {
  const { people, live: streamedMinutes, pixels, visits, visitMinutes } = toFields(stored);
  return { at, people, streamedMinutes, pixels, visits, visitMinutes, signups: Number(signups ?? 0) };
};

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

// Les sept nombres d'une minute, dans l'ordre d'activity.lua : les deux premiers sont des pics, les quatre suivants des
// sommes, le dernier un pic pour tout LivePlace (l'état streamé, écrit aussi dans le deuxième) et une somme de minutes
// streamées pour un canvas.
type MinuteCounts = readonly [number, number, number, number, number, number, number];
type StreamedTotal = "peak" | "sum";

const addMinuteCounts = (
  transaction: ChainableCommander,
  hashes: PointHashes,
  { minute, hour, day }: ActivityPointStarts,
  counts: MinuteCounts,
  streamedTotal: StreamedTotal,
) =>
  transaction.activity(
    hashes.minutes,
    hashes.hours,
    hashes.days,
    minute,
    hour,
    day,
    ...counts,
    streamedTotal,
  );

// L'heure où un canvas a été vu streamé. L'ancien format, `obsSeenAt,liveSeenAt`, se relit par sa dernière heure : celle du
// live, qui est l'état streamé d'aujourd'hui (JOURNAL 2026-10-08).
const toSeenAt = (stored: string): Timestamp | undefined => {
  const seenAt = Number(stored.split(",").at(-1) ?? "");
  return seenAt > 0 ? seenAt : undefined; // vide ou illisible : jamais vu
};

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
  redis.defineCommand("activityGap", {
    numberOfKeys: 6,
    lua: readFileSync(new URL("./activity-gap.lua", import.meta.url), "utf8"),
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
      stored || signups ? [toCanvasPoint(at, stored ?? "", signups)] : [],
    );

  // Les jours d'un canvas, avec les joueurs actifs de chacun : le champ d'un jour, de ses comptes et de ses joueurs
  // commencent tous par son début.
  const listCanvasDays = async (hash: string): Promise<CanvasActivityPoint[]> => {
    const fields = await redis.hgetall(hash);
    const dayAts = new Set(Object.keys(fields).map((field) => Number.parseInt(field, 10)));
    return [...dayAts]
      .sort((left, right) => left - right)
      .map((at) => ({
        ...toCanvasPoint(at, fields[String(at)] ?? "", fields[toSignupsField(at)]),
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
      addMinuteCounts(
        transaction,
        keys,
        starts,
        [people, streamed, pixels, visits, phoneVisits, visitMinutes, streamed],
        "peak",
      );
      for (const [canvasId, counts] of canvases)
        addMinuteCounts(
          transaction,
          keys.canvas(canvasId),
          starts,
          [
            counts.people,
            counts.obsViews,
            counts.pixels,
            counts.visits,
            counts.phoneVisits,
            counts.visitMinutes,
            counts.streamedMinutes,
          ],
          "sum",
        );
      if (pixelsByCanvas.size > 0)
        transaction
          .hset(keys.canvasPixels(starts.minute), Object.fromEntries(pixelsByCanvas))
          .expire(keys.canvasPixels(starts.minute), CANVAS_PIXELS_TTL_SECONDS);
      await execAll(transaction);
    },

    // Les points d'abord, atomiques : un canvas streamé au passage de minuit l'est aussi pour le nouveau jour, un HyperLogLog
    // qui se rejoue sans dégât.
    async storeActivityGap({ canvasId, minutes }) {
      if (minutes.length === 0) return;
      const { minutes: canvasMinutes, hours, days } = keys.canvas(canvasId);
      const starts = minutes.map((minute) => toActivityPointStarts(minute));
      await redis.activityGap(
        keys.minutes,
        keys.hours,
        keys.days,
        canvasMinutes,
        hours,
        days,
        ...starts.flatMap(({ minute, hour, day }) => [minute, hour, day]),
      );
      const lastMinuteOfDay = new Map(starts.map(({ minute, day }) => [day, minute]));
      for (const at of lastMinuteOfDay.values())
        await storeActiveDay({
          at,
          accountIds: new Set(),
          playerIds: new Set(),
          streamedCanvasIds: new Set([canvasId]),
        });
    },

    async storeSeen(seen) {
      if (seen.size === 0) return;
      await redis.hset(keys.seen, Object.fromEntries(seen));
    },

    async listSeen() {
      const fields = await redis.hgetall(keys.seen);
      return new Map(
        Object.entries(fields).flatMap(([canvasId, stored]) => {
          const seenAt = toSeenAt(stored);
          return seenAt === undefined ? [] : [[canvasId, seenAt] as const];
        }),
      );
    },

    // Les identifiants de canvas peuvent commencer par un chiffre : `pruneHash`, qui lit un début de point, n'est pas pour eux.
    async pruneSeen(nowMs) {
      const fields = await redis.hgetall(keys.seen);
      const expired = Object.entries(fields)
        .filter(([, stored]) => (toSeenAt(stored) ?? 0) < nowMs - ACTIVITY_SEEN_RETENTION_MS)
        .map(([canvasId]) => canvasId);
      if (expired.length > 0) await redis.hdel(keys.seen, ...expired);
    },

    async pruneActivity(nowMs, canvasIds = []) {
      await pruneHash(redis, keys.minutes, ACTIVITY_MINUTES_RETENTION_MS, nowMs);
      await pruneHash(redis, keys.hours, ACTIVITY_HOURS_RETENTION_MS, nowMs);
      for (const canvasId of canvasIds) {
        const { minutes, hours } = keys.canvas(canvasId);
        await pruneHash(redis, minutes, ACTIVITY_CANVAS_MINUTES_RETENTION_MS, nowMs);
        await pruneHash(redis, hours, ACTIVITY_HOURS_RETENTION_MS, nowMs);
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
