// La capacité dans Redis (écart §5.1 et §2, JOURNAL 2026-10-07) : des nombres sous `capacity:`, aucun nom hors celui d'un
// déploiement Convex. Le gateway écrit chaque minute, élague, et lit ce que le web dépose ; le web dépose, sans script.

import { readFileSync } from "node:fs";
import { HOUR_MS, MINUTE_MS, type Timestamp, toActivityPointStarts } from "@liveplace/domain";
import {
  CAPACITY_LINKS,
  CAPACITY_RESOURCE_IDS,
  type CapacityLink,
  type CapacityResourceId,
} from "@liveplace/domain/capacity";
import type {
  CapacityPoint,
  CapacityStore,
  CapacityWrites,
  ConvexDeposit,
  ConvexUsage,
  RedisUsage,
  WebMeasure,
} from "@liveplace/domain/ports";
import type { Redis, Result as RedisResult } from "ioredis";
import { buildCapacityKeys, CAPACITY_HOURS_RETENTION_MS, CAPACITY_MINUTES_RETENTION_MS } from "./keys";
import { DAY_MINUTES, execAll, MONTH_HOURS, pointStarts, pruneHash } from "./pyramid";

declare module "ioredis" {
  interface RedisCommander<Context> {
    capacity(...args: (string | number)[]): RedisResult<null, Context>;
  }
}

type CapacityKeys = ReturnType<typeof buildCapacityKeys>;

const toNumber = (value: string | undefined): number | undefined => {
  const parsed = value === undefined ? Number.NaN : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

// Les lignes `clé:valeur` d'un rapport de `INFO`, sans les titres de section.
const toFields = (report: string): Map<string, string> =>
  new Map(
    report.split(/\r?\n/).flatMap((line) => {
      const colon = line.indexOf(":");
      return line.startsWith("#") || colon < 0
        ? []
        : [[line.slice(0, colon), line.slice(colon + 1)] as const];
    }),
  );

const sumOf = (fields: Map<string, string>, sysKey: string, userKey: string): number | undefined => {
  const sys = toNumber(fields.get(sysKey));
  const user = toNumber(fields.get(userKey));
  return sys === undefined || user === undefined ? undefined : sys + user;
};

// `INFO memory cpu errorstats` : le fil principal seul compte (un cœur, §3) ; avant Redis 7, tout le serveur. Aucun refus
// faute de mémoire tant que `errorstat_OOM` n'existe pas. Un rapport sans la mémoire ou le processeur n'est pas inventé.
export function parseRedisUsage(report: string): RedisUsage | null {
  const fields = toFields(report);
  const usedMemoryBytes = toNumber(fields.get("used_memory"));
  const maxMemoryBytes = toNumber(fields.get("maxmemory"));
  const cpuSeconds =
    sumOf(fields, "used_cpu_sys_main_thread", "used_cpu_user_main_thread") ??
    sumOf(fields, "used_cpu_sys", "used_cpu_user");
  if (usedMemoryBytes === undefined || maxMemoryBytes === undefined || cpuSeconds === undefined) return null;
  const refusals = /^count=(\d+)/.exec(fields.get("errorstat_OOM") ?? "")?.[1];
  return { usedMemoryBytes, maxMemoryBytes, cpuSeconds, outOfMemoryRefusals: Number(refusals ?? 0) };
}

const toLinkRatios = (values: readonly number[]): Partial<Record<CapacityLink, number>> => {
  const ratios: Partial<Record<CapacityLink, number>> = {};
  CAPACITY_LINKS.forEach((link, index) => {
    const ratio = values[index];
    if (ratio !== undefined && ratio >= 0) ratios[link] = ratio;
  });
  return ratios;
};

// `stored` : `saturation,resource,redis,gateway,web,machine,convex`, écrit par capacity.lua ; -1 : pas de ressource, pas de mesure.
const toPoint = (at: Timestamp, stored: string): CapacityPoint => {
  const [saturation = 0, resourceIndex = -1, ...ratios] = stored.split(",").map(Number);
  const resource = CAPACITY_RESOURCE_IDS[resourceIndex];
  return { at, saturation, ...(resource ? { resource } : {}), ...toLinkRatios(ratios) };
};

// `at,utilization` pour le web, `at,calls,databaseIoGb,egressGb,computeGbHours` pour un déploiement Convex.
const toWebMeasure = (stored: string | null): WebMeasure | null => {
  const [at, utilization] = (stored ?? "").split(",").map(toNumber);
  return at === undefined || utilization === undefined ? null : { at, utilization };
};

const toConvexUsage = (stored: string): ConvexUsage | null => {
  const [at, calls, databaseIoGb, egressGb, computeGbHours] = stored.split(",").map(toNumber);
  if (
    at === undefined ||
    calls === undefined ||
    databaseIoGb === undefined ||
    egressGb === undefined ||
    computeGbHours === undefined
  )
    return null;
  return { at, calls, databaseIoGb, egressGb, computeGbHours };
};

export function createCapacityWrites(redis: Redis, keys: CapacityKeys = buildCapacityKeys()): CapacityWrites {
  return {
    async storeWebUtilization({ at, utilization }) {
      await redis.set(keys.web, `${at},${utilization}`);
    },

    // Le premier déploiement lu efface « non configuré » : la variable vient d'être posée.
    async storeConvexUsage(deployment, { at, calls, databaseIoGb, egressGb, computeGbHours }) {
      const stored = [at, calls, databaseIoGb, egressGb, computeGbHours].join(",");
      await execAll(redis.multi().hset(keys.convex, deployment, stored).del(keys.convexUnconfigured));
    },

    // Les déploiements d'avant partent avec la variable qui les nommait.
    async storeConvexUnconfigured() {
      await execAll(redis.multi().del(keys.convex).set(keys.convexUnconfigured, "1"));
    },
  };
}

export function createCapacityStore(redis: Redis, keys: CapacityKeys = buildCapacityKeys()): CapacityStore {
  redis.defineCommand("capacity", {
    numberOfKeys: 3,
    lua: readFileSync(new URL("./capacity.lua", import.meta.url), "utf8"),
  });

  // Un point n'existe que si le gateway l'a écrit : sans lui, la courbe laisse un trou.
  const listPoints = async (hash: string, ats: Timestamp[]): Promise<CapacityPoint[]> => {
    const values = await redis.hmget(hash, ...ats.map(String));
    return ats.flatMap((at, index) => {
      const stored = values[index];
      return stored ? [toPoint(at, stored)] : [];
    });
  };

  return {
    async getRedisUsage() {
      const usage = parseRedisUsage(await redis.info("memory", "cpu", "errorstats"));
      if (!usage) throw new Error("rapport de Redis illisible : mémoire ou processeur absent");
      return usage;
    },

    async getWebMeasure() {
      return toWebMeasure(await redis.get(keys.web));
    },

    async getConvexDeposit(): Promise<ConvexDeposit | null> {
      const [fields, isUnconfigured] = await Promise.all([
        redis.hgetall(keys.convex),
        redis.exists(keys.convexUnconfigured),
      ]);
      if (isUnconfigured > 0) return { status: "unconfigured" };
      const deployments = Object.entries(fields).flatMap(([name, stored]) => {
        const usage = toConvexUsage(stored);
        return usage ? [[name, usage] as const] : [];
      });
      return deployments.length === 0 ? null : { status: "configured", deployments: new Map(deployments) };
    },

    async listCeilingsReached() {
      const fields = await redis.hgetall(keys.reached);
      const reached = new Map<CapacityResourceId, Timestamp>();
      for (const [name, stored] of Object.entries(fields)) {
        const id = CAPACITY_RESOURCE_IDS.find((known) => known === name);
        const at = toNumber(stored);
        if (id && at !== undefined) reached.set(id, at);
      }
      return reached;
    },

    async storeCeilingReached(id, at) {
      await redis.hset(keys.reached, id, at);
    },

    // Un seul script, atomique : le pic de la minute se reporte sur l'heure et le jour avec sa ressource porteuse.
    async storeCapacityMinute({ at, percent, resource, linkRatios }) {
      const { minute, hour, day } = toActivityPointStarts(at);
      await redis.capacity(
        keys.minutes,
        keys.hours,
        keys.days,
        minute,
        hour,
        day,
        percent,
        resource === undefined ? -1 : CAPACITY_RESOURCE_IDS.indexOf(resource),
        ...CAPACITY_LINKS.map((link) => linkRatios[link] ?? -1),
      );
    },

    async pruneCapacity(nowMs) {
      await pruneHash(redis, keys.minutes, CAPACITY_MINUTES_RETENTION_MS, nowMs);
      await pruneHash(redis, keys.hours, CAPACITY_HOURS_RETENTION_MS, nowMs);
    },

    // La minute en cours n'est pas encore écrite ; l'heure et le jour en cours le sont, en partie.
    async listCapacityHistory(period, nowMs) {
      const { minute, hour } = toActivityPointStarts(nowMs);
      if (period === "day")
        return listPoints(keys.minutes, pointStarts(minute - MINUTE_MS, MINUTE_MS, DAY_MINUTES));
      if (period === "month") return listPoints(keys.hours, pointStarts(hour, HOUR_MS, MONTH_HOURS));
      const fields = await redis.hgetall(keys.days);
      return Object.entries(fields)
        .map(([field, stored]) => toPoint(Number(field), stored))
        .sort((left, right) => left.at - right.at);
    },
  };
}
