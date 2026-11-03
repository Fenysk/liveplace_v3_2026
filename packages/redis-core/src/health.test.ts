import { Redis } from "ioredis";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";
import { createGatewayHeartbeat, createHealthProbe } from "./health";
import { GATEWAY_HEARTBEAT_KEY, HEARTBEAT_TTL_SECONDS, WORKER_HEARTBEAT_KEY } from "./keys";

// Le Redis de ce lancement (test-global-setup.ts), base 13 : les clés de battement sont fixes, aucune autre base ne les voit. 127.0.0.1 : `localhost` peut tomber sur wslrelay en IPv6.
const redis = new Redis({
  host: "127.0.0.1",
  port: inject("redisPort"),
  db: 13,
  lazyConnect: true,
  retryStrategy: () => null,
});

const now = 1_700_000_000_000;

beforeAll(async () => {
  await redis.connect().catch(() => {
    throw new Error("Redis de test injoignable : son conteneur Docker s'est arrêté");
  });
});

beforeEach(async () => {
  await redis.del(GATEWAY_HEARTBEAT_KEY, WORKER_HEARTBEAT_KEY);
});

afterAll(async () => {
  await redis.del(GATEWAY_HEARTBEAT_KEY, WORKER_HEARTBEAT_KEY);
  await redis.quit();
});

describe("the gateway heartbeat (JOURNAL 2026-11-03)", () => {
  // Il bat avec l'instant de son battement et expire : un gateway arrêté cesse de battre au bout de 30 s
  it("writes its heartbeat with the time of the beat, and lets it expire", async () => {
    await createGatewayHeartbeat(redis).beat(now);

    expect(await redis.get(GATEWAY_HEARTBEAT_KEY)).toBe(String(now));
    const ttl = await redis.ttl(GATEWAY_HEARTBEAT_KEY);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(HEARTBEAT_TTL_SECONDS);
  });
});

describe("the health probe (JOURNAL 2026-11-03)", () => {
  // Redis répond : la sonde de Redis dit vrai
  it("tells that Redis answers", async () => {
    expect(await createHealthProbe(redis).redis()).toBe(true);
  });

  // Aucun battement : ni le gateway ni le worker ne répondent
  it("tells that the gateway and the worker do not answer while neither beats", async () => {
    const probe = createHealthProbe(redis);

    expect(await probe.gateway()).toBe(false);
    expect(await probe.worker()).toBe(false);
  });

  // Chaque service se lit à son seul battement : celui de l'un ne répond jamais pour l'autre
  it("reads each service from its own heartbeat only", async () => {
    const probe = createHealthProbe(redis);

    await createGatewayHeartbeat(redis).beat(now);
    expect(await probe.gateway()).toBe(true);
    expect(await probe.worker()).toBe(false);

    await redis.del(GATEWAY_HEARTBEAT_KEY);
    await redis.set(WORKER_HEARTBEAT_KEY, now, "EX", HEARTBEAT_TTL_SECONDS);
    expect(await probe.gateway()).toBe(false);
    expect(await probe.worker()).toBe(true);
  });
});
