// La santé dans Redis (JOURNAL 2026-11-03) : le gateway bat, `/healthz` du web lit le sien, celui du worker (§7.5) et Redis lui-même.

import type { Timestamp } from "@liveplace/domain";
import type { HealthProbe } from "@liveplace/domain/ports";
import type { Redis } from "ioredis";
import { GATEWAY_HEARTBEAT_KEY, HEARTBEAT_TTL_SECONDS, WORKER_HEARTBEAT_KEY } from "./keys";

export function createGatewayHeartbeat(redis: Redis) {
  return {
    // L'instant du battement, et une clé qui expire : un gateway arrêté ou figé cesse de battre.
    async beat(nowMs: Timestamp): Promise<void> {
      await redis.set(GATEWAY_HEARTBEAT_KEY, nowMs, "EX", HEARTBEAT_TTL_SECONDS);
    },
  };
}

export function createHealthProbe(redis: Redis): HealthProbe {
  const hasHeartbeat = async (key: string): Promise<boolean> => (await redis.exists(key)) === 1;
  return {
    redis: async () => (await redis.ping()) === "PONG",
    gateway: () => hasHeartbeat(GATEWAY_HEARTBEAT_KEY),
    worker: () => hasHeartbeat(WORKER_HEARTBEAT_KEY),
  };
}
