import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  PALETTE,
  refillGauge,
  TRANSPARENT_COLOR_INDEX,
  toCellKey,
  toStateOffset,
} from "@liveplace/domain";
import type { Event } from "@liveplace/protocol";
import { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type CanvasMeta, createCanvasCore, type Placement } from "./client";
import { buildCanvasKeys, HIST_DEPTH } from "./keys";

// Base 15 : jamais celle du dev. 127.0.0.1 : `localhost` peut tomber sur wslrelay en IPv6.
const redis = new Redis({ host: "127.0.0.1", db: 15, lazyConnect: true, retryStrategy: () => null });
const core = createCanvasCore(redis);

// Un préfixe par exécution : le nettoyage ne touche que les canvas de ce fichier.
const runId = randomUUID();
let canvasCount = 0;
const uniqueCanvasId = () => `${runId}-${++canvasCount}`;

const meta: CanvasMeta = {
  ownerId: "owner-1",
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  gaugeMax: 3,
  refillMs: 1000,
  refillCharges: 2, // ≠ 1 : un oubli du `× refillCharges` ne passerait pas
  obsDelayMs: 5000,
};

beforeAll(async () => {
  await redis.connect().catch(() => {
    throw new Error("Redis absent : docker compose -f docker-compose.dev.yml up -d");
  });
});

afterAll(async () => {
  const found: string[] = [];
  for await (const names of redis.scanStream({ match: `cv:${runId}-*`, count: 1000 })) found.push(...names);
  if (found.length > 0) await redis.del(...found);
  await redis.quit();
});

describe("createCanvas (§5.6)", () => {
  // Crée un canvas prêt : meta complète, state de width × height octets à zéro, version 0
  it("creates a ready canvas with a zeroed state at version 0", async () => {
    const canvasId = uniqueCanvasId();
    const keys = buildCanvasKeys(canvasId);

    await core.createCanvas(canvasId, meta);

    const state = await redis.getBuffer(keys.state);
    expect(state).toHaveLength(meta.width * meta.height);
    expect(state?.some((byte) => byte !== 0)).toBe(false);
    expect(await redis.get(keys.version)).toBe("0");
    expect(await redis.hgetall(keys.meta)).toEqual({
      ...Object.fromEntries(Object.entries(meta).map(([field, value]) => [field, String(value)])),
      ready: "1",
    });
  });

  // Ne réinitialise jamais un canvas existant (idempotent)
  it("never resets an existing canvas", async () => {
    const canvasId = uniqueCanvasId();
    const keys = buildCanvasKeys(canvasId);
    await core.createCanvas(canvasId, meta);
    await redis.setrange(keys.state, 0, "\x05");
    await redis.incr(keys.version);

    await core.createCanvas(canvasId, { ...meta, gaugeMax: meta.gaugeMax + 1 });

    expect((await redis.getBuffer(keys.state))?.[0]).toBe(5);
    expect(await redis.get(keys.version)).toBe("1");
    expect(await redis.hget(keys.meta, "gaugeMax")).toBe(String(meta.gaugeMax));
  });
});

describe("place (§5.3)", () => {
  // Horloge figée réaliste : 13 chiffres, comme un vrai Date.now().
  const now = 1_700_000_000_000;

  const readyCanvas = async () => {
    const canvasId = uniqueCanvasId();
    await core.createCanvas(canvasId, meta);
    return { canvasId, keys: buildCanvasKeys(canvasId) };
  };

  const placement = (overrides: Partial<Placement> = {}): Placement => ({
    userId: "user-1",
    requestId: randomUUID(),
    nowMs: now,
    pixels: [{ x: 3, y: 2, colorIndex: 5 }],
    ...overrides,
  });

  const placed = async (canvasId: string, request: Placement) => {
    const result = await core.place(canvasId, request);
    if (!result.ok) throw new Error(result.error);
    return result.value;
  };

  const eventAt = async (events: string, version: number): Promise<unknown> => {
    const entries = await redis.xrange(events, `${version}-0`, `${version}-0`);
    return JSON.parse(entries[0]?.[1][1] ?? "null");
  };

  // Écrit un pixel accepté à son stateOffset, le nomme par sa cellKey, et enregistre l'événement (D-15)
  it("writes an accepted pixel at its stateOffset, names it by cellKey, and records the event", async () => {
    const { canvasId, keys } = await readyCanvas();
    const pixel = { x: 3, y: 2, colorIndex: 5 }; // y ≥ 1 : cellKey ≠ stateOffset
    const request = placement({ pixels: [pixel] });
    const gauge = refillGauge(undefined, now, meta);

    const ack = await placed(canvasId, request);

    expect(ack).toEqual({
      t: "ack",
      requestId: request.requestId,
      version: 1,
      accepted: 1,
      rejected: [],
      gauge: { charges: gauge.charges - 1, max: meta.gaugeMax, nextRefillAt: gauge.at + meta.refillMs },
    });
    const cellKey = toCellKey(pixel.x, pixel.y);
    expect((await redis.getBuffer(keys.state))?.[toStateOffset(pixel.x, pixel.y, meta.width)]).toBe(
      pixel.colorIndex,
    );
    expect(await redis.lindex(keys.hist(cellKey), 0)).toBe(`${request.userId}:${pixel.colorIndex}:${now}:1`);
    expect(await redis.smembers(keys.cells(request.userId))).toEqual([String(cellKey)]);
    expect(await redis.get(keys.version)).toBe("1");
    const event: Event = {
      version: 1,
      kind: "place",
      authorId: request.userId,
      occurredAt: now,
      cells: [{ ...pixel, previousColorIndex: TRANSPARENT_COLOR_INDEX, placedAt: now }],
    };
    expect(await eventAt(keys.events, 1)).toEqual(event);
    expect(await redis.xlen(keys.events)).toBe(1);
  });

  // Rejette un par un les pixels hors bornes ou hors palette, et accepte le reste du lot
  it("rejects out-of-bounds and out-of-palette pixels one by one, and accepts the rest", async () => {
    const { canvasId, keys } = await readyCanvas();
    const request = placement({
      pixels: [
        { x: meta.width, y: 0, colorIndex: 1 },
        { x: 0, y: meta.height, colorIndex: 1 },
        { x: 0, y: 0, colorIndex: PALETTE.length },
        { x: 1, y: 1, colorIndex: PALETTE.length - 1 },
      ],
    });

    const ack = await placed(canvasId, request);

    expect(ack.accepted).toBe(1);
    expect(ack.rejected).toEqual([
      { index: 0, reason: "invalid" },
      { index: 1, reason: "invalid" },
      { index: 2, reason: "invalid" },
    ]);
    expect(ack.gauge.charges).toBe(meta.gaugeMax - 1);
    expect(await redis.get(keys.version)).toBe("1");
  });

  // Accepte jusqu'aux charges, rejette le reste avec gauge, et ne crée ni version ni événement sans pixel accepté
  it("accepts up to the charges, rejects the rest with gauge, and bumps nothing when none is accepted", async () => {
    const { canvasId, keys } = await readyCanvas();
    const pixels = Array.from({ length: meta.gaugeMax + 2 }, (_, x) => ({ x, y: 0, colorIndex: 1 }));

    const first = await placed(canvasId, placement({ pixels }));

    expect(first.accepted).toBe(meta.gaugeMax);
    expect(first.rejected).toEqual([
      { index: meta.gaugeMax, reason: "gauge" },
      { index: meta.gaugeMax + 1, reason: "gauge" },
    ]);

    const second = placement({ pixels: [{ x: 0, y: 1, colorIndex: 1 }] });
    expect(await placed(canvasId, second)).toEqual({
      t: "ack",
      requestId: second.requestId,
      accepted: 0,
      rejected: [{ index: 0, reason: "gauge" }],
      gauge: { charges: 0, max: meta.gaugeMax, nextRefillAt: now + meta.refillMs },
    });
    expect(await redis.get(keys.version)).toBe("1");
    expect(await redis.xlen(keys.events)).toBe(1);
  });

  // Recharge la jauge à l'intervalle exact, pas une milliseconde avant
  it("refills the gauge at the exact interval, not a millisecond before", async () => {
    const { canvasId } = await readyCanvas();
    const pixels = Array.from({ length: meta.gaugeMax }, (_, x) => ({ x, y: 0, colorIndex: 1 }));
    await placed(canvasId, placement({ pixels }));
    const pixel = [{ x: 0, y: 1, colorIndex: 1 }];

    const early = await placed(canvasId, placement({ nowMs: now + meta.refillMs - 1, pixels: pixel }));
    const onTime = await placed(canvasId, placement({ nowMs: now + meta.refillMs, pixels: pixel }));

    expect(early.accepted).toBe(0);
    const gauge = refillGauge({ charges: 0, at: now }, now + meta.refillMs, meta);
    expect(onTime.accepted).toBe(1);
    expect(onTime.gauge).toEqual({
      charges: gauge.charges - 1,
      max: meta.gaugeMax,
      nextRefillAt: gauge.at + meta.refillMs,
    });
  });

  // Ne vide pas la jauge et ne recule pas `at` quand l'horloge recule
  it("neither drains the gauge nor moves it back when the clock goes backwards", async () => {
    const { canvasId, keys } = await readyCanvas();
    const request = placement();
    await placed(canvasId, request);

    const ack = await placed(
      canvasId,
      placement({ nowMs: now - meta.refillMs, pixels: [{ x: 0, y: 1, colorIndex: 1 }] }),
    );

    expect(ack.gauge).toEqual({
      charges: meta.gaugeMax - 2,
      max: meta.gaugeMax,
      nextRefillAt: now + meta.refillMs,
    });
    expect(await redis.hgetall(keys.gauge(request.userId))).toEqual({
      charges: String(meta.gaugeMax - 2),
      at: String(now),
    });
  });

  // Renvoie le même ack pour un requestId rejoué, sans consommer deux fois
  it("returns the same ack for a retried requestId without consuming twice", async () => {
    const { canvasId, keys } = await readyCanvas();
    const request = placement();

    const first = await placed(canvasId, request);
    const retry = await placed(canvasId, request);

    expect(retry).toEqual(first);
    expect(await redis.get(keys.version)).toBe("1");
    expect(await redis.hget(keys.gauge(request.userId), "charges")).toBe(String(meta.gaugeMax - 1));
  });

  // Rejette tous les pixels d'un utilisateur banni avec banned, sans rien écrire
  it("rejects every pixel of a banned user with banned and writes nothing", async () => {
    const { canvasId, keys } = await readyCanvas();
    const request = placement({
      pixels: [
        { x: 0, y: 0, colorIndex: 1 },
        { x: 1, y: 0, colorIndex: 1 },
      ],
    });
    await redis.sadd(keys.bans, request.userId);

    const ack = await placed(canvasId, request);

    expect(ack.accepted).toBe(0);
    expect(ack.rejected).toEqual([
      { index: 0, reason: "banned" },
      { index: 1, reason: "banned" },
    ]);
    expect(await redis.get(keys.version)).toBe("0");
    expect(await redis.exists(keys.gauge(request.userId), keys.req(request.userId, request.requestId))).toBe(
      0,
    );
  });

  // Refuse un canvas absent ou pas prêt, sans rien écrire
  it("refuses a missing or not ready canvas and writes nothing", async () => {
    const { canvasId, keys } = await readyCanvas();
    await redis.hset(keys.meta, "ready", "0");

    expect(await core.place(canvasId, placement())).toEqual({ ok: false, error: "canvas_not_found" });
    expect(await core.place(uniqueCanvasId(), placement())).toEqual({ ok: false, error: "canvas_not_found" });
    expect(await redis.get(keys.version)).toBe("0");
  });

  // Recouvre le pixel d'un autre auteur : previousColorIndex, hist et cells suivent l'auteur visible
  it("covers another author's pixel: previousColorIndex, hist and cells follow the visible author", async () => {
    const { canvasId, keys } = await readyCanvas();
    const below = { x: 3, y: 2, colorIndex: 5 };
    const above = { ...below, colorIndex: 6 };
    const cellKey = toCellKey(below.x, below.y);

    await placed(canvasId, placement({ userId: "author-a", pixels: [below] }));
    await placed(canvasId, placement({ userId: "author-b", pixels: [above] }));

    expect(await eventAt(keys.events, 2)).toMatchObject({
      cells: [{ colorIndex: above.colorIndex, previousColorIndex: below.colorIndex }],
    });
    expect(await redis.lrange(keys.hist(cellKey), 0, -1)).toEqual([
      `author-b:${above.colorIndex}:${now}:2`,
      `author-a:${below.colorIndex}:${now}:1`,
    ]);
    expect(await redis.sismember(keys.cells("author-a"), String(cellKey))).toBe(0);
    expect(await redis.sismember(keys.cells("author-b"), String(cellKey))).toBe(1);
  });

  // Garde une pile et une version cohérentes sous des poses concurrentes sur une même case
  it("keeps a coherent pile and version under concurrent placements on one cell", async () => {
    const { canvasId, keys } = await readyCanvas();
    const count = 100;
    const pixel = { x: 3, y: 2, colorIndex: 1 };
    const cellKey = toCellKey(pixel.x, pixel.y);
    const userIds = Array.from({ length: count }, (_, index) => `user-${index}`);

    const acks = await Promise.all(
      userIds.map((userId) => placed(canvasId, placement({ userId, pixels: [pixel] }))),
    );

    expect(await redis.get(keys.version)).toBe(String(count));
    expect(new Set(acks.map((ack) => ack.version)).size).toBe(count);
    expect(await redis.llen(keys.hist(cellKey))).toBe(HIST_DEPTH);
    const holders = await Promise.all(
      userIds.map((userId) => redis.sismember(keys.cells(userId), String(cellKey))),
    );
    expect(holders.filter((held) => held === 1)).toHaveLength(1);
  });

  // Publie l'événement sur le canal live
  it("publishes the event on the live channel", async () => {
    const { canvasId, keys } = await readyCanvas();
    const subscriber = redis.duplicate();
    try {
      const received = new Promise<string>((resolve) => {
        subscriber.on("message", (_channel: string, message: string) => resolve(message));
      });
      await subscriber.subscribe(keys.live);

      await placed(canvasId, placement());

      const message = await Promise.race([received, delay(1000, "null")]);
      expect(JSON.parse(message)).toEqual({ e: await eventAt(keys.events, 1) });
    } finally {
      await subscriber.quit();
    }
  });
});
