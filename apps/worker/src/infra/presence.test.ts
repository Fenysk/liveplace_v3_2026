import { setTimeout as delay } from "node:timers/promises";
import { Redis } from "ioredis";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPresence, HEARTBEAT_KEY, LEASE_KEY, LEASE_TTL_MS } from "./presence";

// Base 14 : ni celle du dev, ni la 15 des tests de redis-core. 127.0.0.1 : `localhost` peut tomber sur wslrelay en IPv6.
const redis = new Redis({ host: "127.0.0.1", db: 14, lazyConnect: true, retryStrategy: () => null });

const now = 1_700_000_000_000;

beforeAll(async () => {
  await redis.connect().catch(() => {
    throw new Error("Redis absent : docker compose -f docker-compose.dev.yml up -d");
  });
});

beforeEach(async () => {
  await redis.del(LEASE_KEY, HEARTBEAT_KEY);
});

afterAll(async () => {
  await redis.del(LEASE_KEY, HEARTBEAT_KEY);
  await redis.quit();
});

describe("the worker presence (Écart §11.5, JOURNAL 2026-10-06)", () => {
  // Un seul worker : le premier tient le bail, le second le trouve pris
  it("lets a single worker hold the lease, the second one finds it taken", async () => {
    const first = createPresence(redis, "worker-a");
    const second = createPresence(redis, "worker-b");

    expect(await first.claim()).toBe(true);
    expect(await second.claim()).toBe(false);
    expect(await redis.get(LEASE_KEY)).toBe("worker-a");
  });

  // Tant qu'il garde le bail, le worker le prolonge et pose son battement : la santé se lit dans Redis
  it("extends its lease and writes its heartbeat while it keeps the lease", async () => {
    const worker = createPresence(redis, "worker-a");
    await worker.claim();
    await redis.pexpire(LEASE_KEY, 1_000);

    expect(await worker.keep(now)).toBe(true);

    expect(await redis.pttl(LEASE_KEY)).toBeGreaterThan(LEASE_TTL_MS - 2_000);
    expect(await redis.get(HEARTBEAT_KEY)).toBe(String(now));
    expect(await redis.ttl(HEARTBEAT_KEY)).toBeGreaterThan(0);
  });

  // Un worker qui a perdu son bail le sait, et ne pose aucun battement : il ne se fait pas passer pour vivant
  it("tells a worker that lost its lease, and writes no heartbeat for it", async () => {
    const worker = createPresence(redis, "worker-a");
    await worker.claim();
    await redis.pexpire(LEASE_KEY, 1);
    await delay(20);
    await createPresence(redis, "worker-b").claim();

    expect(await worker.keep(now)).toBe(false);

    expect(await redis.get(HEARTBEAT_KEY)).toBeNull();
    expect(await redis.get(LEASE_KEY)).toBe("worker-b");
  });

  // Une perte totale de Redis emporte le bail : personne ne le tient, le worker le reprend au lieu de s'arrêter (JOURNAL 2026-10-08)
  it("takes the lease again when Redis lost it and nobody holds it, writing its heartbeat", async () => {
    const worker = createPresence(redis, "worker-a");
    await worker.claim();
    await redis.del(LEASE_KEY);

    expect(await worker.keep(now)).toBe(true);

    expect(await redis.get(LEASE_KEY)).toBe("worker-a");
    expect(await redis.pttl(LEASE_KEY)).toBeGreaterThan(LEASE_TTL_MS - 2_000);
    expect(await redis.get(HEARTBEAT_KEY)).toBe(String(now));
  });

  // En partant, le worker rend son bail pour que le suivant démarre aussitôt, mais ne touche jamais celui d'un autre
  it("hands the lease back when leaving, but never takes another worker's", async () => {
    const first = createPresence(redis, "worker-a");
    const second = createPresence(redis, "worker-b");
    await first.claim();

    await second.leave();
    expect(await redis.get(LEASE_KEY)).toBe("worker-a");
    await first.leave();

    expect(await redis.get(LEASE_KEY)).toBeNull();
    expect(await second.claim()).toBe(true);
  });
});
