import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  type CanvasMeta,
  PALETTE,
  refillGauge,
  TRANSPARENT_COLOR_INDEX,
  toCellKey,
  toStateOffset,
} from "@liveplace/domain";
import type { LiveMessage, Placement } from "@liveplace/domain/ports";
import type { Event } from "@liveplace/protocol";
import { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCanvasCore, createSignInWrites } from "./client";
import { buildCanvasKeys, HIST_DEPTH, userKey } from "./keys";

// Base 15 : jamais celle du dev. 127.0.0.1 : `localhost` peut tomber sur wslrelay en IPv6.
const redis = new Redis({ host: "127.0.0.1", db: 15, lazyConnect: true, retryStrategy: () => null });
// Une connexion abonnée à part : en mode subscribe, Redis n'accepte plus les autres commandes (§6.3).
const liveSubscriber = redis.duplicate();
const core = createCanvasCore(redis, liveSubscriber);

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
  liveSubscriber.disconnect();
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

describe("getCanvas (§6.1)", () => {
  // Renvoie null pour un canvas absent
  it("returns null for a missing canvas", async () => {
    expect(await core.getCanvas(uniqueCanvasId())).toBeNull();
  });

  // Renvoie null tant que le canvas n'est pas prêt (§5.5)
  it("returns null while the canvas is not ready", async () => {
    const canvasId = uniqueCanvasId();
    await core.createCanvas(canvasId, meta);
    await redis.hset(buildCanvasKeys(canvasId).meta, "ready", "0");

    expect(await core.getCanvas(canvasId)).toBeNull();
  });

  // Renvoie la meta d'un canvas prêt, nombres compris
  it("returns the meta of a ready canvas, numbers included", async () => {
    const canvasId = uniqueCanvasId();
    await core.createCanvas(canvasId, meta);

    expect(await core.getCanvas(canvasId)).toEqual(meta);
  });
});

describe("isModerator (§6.1)", () => {
  // Ne voit un modérateur qu'une fois ajouté à mods
  it("sees a moderator only once added to mods", async () => {
    const canvasId = uniqueCanvasId();
    await core.createCanvas(canvasId, meta);

    expect(await core.isModerator(canvasId, "moderator-1")).toBe(false);

    await redis.sadd(buildCanvasKeys(canvasId).mods, "moderator-1");

    expect(await core.isModerator(canvasId, "moderator-1")).toBe(true);
  });
});

describe("getGauge (§5.6, JOURNAL 2026-09-24)", () => {
  const now = 1_700_000_000_000;

  // Donne une jauge pleine à qui n'a jamais posé, sans l'écrire
  it("gives a full gauge to someone who never placed, without writing it", async () => {
    const canvasId = uniqueCanvasId();
    await core.createCanvas(canvasId, meta);

    const gauge = await core.getGauge(canvasId, "user-1", now);

    expect(gauge).toEqual({ charges: meta.gaugeMax, max: meta.gaugeMax, nextRefillAt: now + meta.refillMs });
    expect(await redis.exists(buildCanvasKeys(canvasId).gauge("user-1"))).toBe(0);
  });

  // Applique la recharge de place.lua à la jauge stockée, sans jamais la réécrire
  it("applies the place.lua refill to the stored gauge, without ever writing it back", async () => {
    const canvasId = uniqueCanvasId();
    const keys = buildCanvasKeys(canvasId);
    await core.createCanvas(canvasId, meta);
    const pixels = Array.from({ length: meta.gaugeMax }, (_, x) => ({ x, y: 0, colorIndex: 1 }));
    await core.place(canvasId, { userId: "user-1", requestId: randomUUID(), nowMs: now, pixels });
    const later = now + meta.refillMs * 1.5;
    const expected = refillGauge({ charges: 0, at: now }, later, meta);

    const gauge = await core.getGauge(canvasId, "user-1", later);

    expect(gauge).toEqual({
      charges: expected.charges,
      max: meta.gaugeMax,
      nextRefillAt: expected.at + meta.refillMs,
    });
    expect(await redis.hgetall(keys.gauge("user-1"))).toEqual({ charges: "0", at: String(now) });
  });
});

describe("getSnapshot (§6.1)", () => {
  const now = 1_700_000_000_000;

  // Lit l'état entier et la version qui va avec
  it("reads the whole state and the version that goes with it", async () => {
    const canvasId = uniqueCanvasId();
    await core.createCanvas(canvasId, meta);
    const pixel = { x: 3, y: 2, colorIndex: 5 };
    await core.place(canvasId, { userId: "user-1", requestId: randomUUID(), nowMs: now, pixels: [pixel] });

    const snapshot = await core.getSnapshot(canvasId);

    expect(snapshot.state).toHaveLength(meta.width * meta.height);
    expect(snapshot.state[toStateOffset(pixel.x, pixel.y, meta.width)]).toBe(pixel.colorIndex);
    expect(snapshot.version).toBe(1);
  });
});

describe("subscribe (§6.3)", () => {
  const now = 1_700_000_000_000;

  // Reçoit l'événement d'une pose, et plus rien après le désabonnement
  it("receives the event of a placement, and nothing after unsubscribing", async () => {
    const canvasId = uniqueCanvasId();
    await core.createCanvas(canvasId, meta);
    const pixel = { x: 3, y: 2, colorIndex: 5 };
    const received: LiveMessage[] = [];

    const unsubscribe = await core.subscribe(canvasId, (message) => received.push(message));
    await core.place(canvasId, { userId: "user-1", requestId: randomUUID(), nowMs: now, pixels: [pixel] });
    await delay(100);

    expect(received).toEqual([
      {
        e: {
          version: 1,
          kind: "place",
          authorId: "user-1",
          occurredAt: now,
          cells: [{ ...pixel, previousColorIndex: TRANSPARENT_COLOR_INDEX, placedAt: now }],
        },
      },
    ]);

    await unsubscribe();
    await core.place(canvasId, {
      userId: "user-1",
      requestId: randomUUID(),
      nowMs: now,
      pixels: [{ x: 4, y: 2, colorIndex: 5 }],
    });
    await delay(100);

    expect(received).toHaveLength(1);
  });
});

describe("createSignInWrites (§2, §5.1)", () => {
  const writes = createSignInWrites(redis);

  // Crée un canvas prêt sans charger de script, et ne réinitialise jamais un canvas existant
  it("creates a ready canvas without any script, and never resets an existing one", async () => {
    const canvasId = uniqueCanvasId();
    const keys = buildCanvasKeys(canvasId);

    await writes.createCanvas(canvasId, meta);
    await redis.setrange(keys.state, 0, "\x05");
    await writes.createCanvas(canvasId, meta);

    expect(await redis.hget(keys.meta, "ready")).toBe("1");
    expect((await redis.getBuffer(keys.state))?.[0]).toBe(5);
  });

  // Écrit le miroir user:<userId> sans expiration, et le remplace à la connexion suivante
  it("writes the user mirror without expiry, and replaces it on the next sign-in", async () => {
    const userId = `${runId}-user`;

    await writes.setUser({ userId, login: "fenysk", displayName: "Fenysk" });
    await writes.setUser({ userId, login: "fenysk_v2", displayName: "Fenysk V2" });

    expect(await redis.hgetall(userKey(userId))).toEqual({ login: "fenysk_v2", displayName: "Fenysk V2" });
    expect(await redis.ttl(userKey(userId))).toBe(-1);
    await redis.del(userKey(userId));
  });

  // Écrit l'avatar dans le miroir quand Twitch en donne un (JOURNAL 2026-09-24)
  it("writes the avatar in the user mirror when Twitch gives one", async () => {
    const userId = `${runId}-avatar`;
    const avatarUrl = "https://static-cdn.jtvnw.net/fenysk.png";

    await writes.setUser({ userId, login: "fenysk", displayName: "Fenysk", avatarUrl });

    expect(await redis.hget(userKey(userId), "avatarUrl")).toBe(avatarUrl);
    await redis.del(userKey(userId));
  });
});

describe("inspect (§5.6, JOURNAL 2026-09-24)", () => {
  const now = 1_700_000_000_000;
  const writes = createSignInWrites(redis);

  // Ne rend aucune entrée pour une case où personne n'a posé
  it("gives no entry for a cell nobody placed on", async () => {
    const canvasId = uniqueCanvasId();
    await core.createCanvas(canvasId, meta);

    expect(await core.inspect(canvasId, 3, 2)).toBeNull();
  });

  // Rend l'auteur du pixel visible, lu en tête de sa pile, avec son miroir et son avatar
  it("gives the author of the visible pixel, read at the head of its history, with its mirror and avatar", async () => {
    const canvasId = uniqueCanvasId();
    await core.createCanvas(canvasId, meta);
    const [first, second] = [`${runId}-first`, `${runId}-second`];
    const avatarUrl = "https://static-cdn.jtvnw.net/second.png";
    await writes.setUser({ userId: second, login: "second", displayName: "Second", avatarUrl });
    const placeAs = (userId: string, colorIndex: number, nowMs: number) =>
      core.place(canvasId, { userId, requestId: randomUUID(), nowMs, pixels: [{ x: 3, y: 2, colorIndex }] });
    await placeAs(first, 5, now);
    await placeAs(second, 7, now + 1000);

    expect(await core.inspect(canvasId, 3, 2)).toEqual({
      userId: second,
      login: "second",
      displayName: "Second",
      avatarUrl,
      colorIndex: 7,
      placedAt: now + 1000,
    });
    await redis.del(userKey(second));
  });

  // Laisse avatarUrl de côté pour un auteur qui n'en a pas
  it("leaves avatarUrl out for an author who has none", async () => {
    const canvasId = uniqueCanvasId();
    await core.createCanvas(canvasId, meta);
    const userId = `${runId}-plain`;
    await writes.setUser({ userId, login: "plain", displayName: "Plain" });
    await core.place(canvasId, {
      userId,
      requestId: randomUUID(),
      nowMs: now,
      pixels: [{ x: 1, y: 1, colorIndex: 4 }],
    });

    const entry = await core.inspect(canvasId, 1, 1);

    expect(entry).toMatchObject({ userId, login: "plain", displayName: "Plain", colorIndex: 4 });
    expect(entry).not.toHaveProperty("avatarUrl");
    await redis.del(userKey(userId));
  });
});

describe("listEvents, the resync (§4.5)", () => {
  const now = 1_700_000_000_000;

  const canvasWithThreeEvents = async () => {
    const canvasId = uniqueCanvasId();
    await core.createCanvas(canvasId, meta);
    for (const x of [1, 2, 3])
      await core.place(canvasId, {
        userId: "user-1",
        requestId: randomUUID(),
        nowMs: now,
        pixels: [{ x, y: 0, colorIndex: 1 }],
      });
    return canvasId;
  };

  // Rend les événements depuis fromVersion, dans l'ordre, et une liste vide quand rien n'a été manqué
  it("gives the events from fromVersion in order, and an empty list when nothing was missed", async () => {
    const canvasId = await canvasWithThreeEvents();

    expect((await core.listEvents(canvasId, 2, 2000))?.map((event) => event.version)).toEqual([2, 3]);
    expect(await core.listEvents(canvasId, 4, 2000)).toEqual([]);
  });

  // Rend null au-delà de maxCount, quand le stream ne remonte plus jusque-là, ou quand le client est en avance
  it("gives null past maxCount, when the stream no longer reaches back, or when the client is ahead", async () => {
    const canvasId = await canvasWithThreeEvents();

    expect(await core.listEvents(canvasId, 1, 2)).toBeNull();
    expect(await core.listEvents(canvasId, 10, 2000)).toBeNull();
    await redis.xtrim(buildCanvasKeys(canvasId).events, "MAXLEN", 1);
    expect(await core.listEvents(canvasId, 2, 2000)).toBeNull();
    expect((await core.listEvents(canvasId, 3, 2000))?.map((event) => event.version)).toEqual([3]);
  });
});

describe("listRecentEvents, the recent of the OBS view (§5.6, §9.5)", () => {
  const now = 1_700_000_000_000;

  // Rend les événements depuis sinceMs, du plus ancien au plus récent, et rien d'avant
  it("gives the events since sinceMs, oldest first, and nothing before", async () => {
    const canvasId = uniqueCanvasId();
    await core.createCanvas(canvasId, meta);
    for (const [x, age] of [
      [1, 8000],
      [2, 3000],
      [3, 1000],
    ] as const)
      await core.place(canvasId, {
        userId: "user-1",
        requestId: randomUUID(),
        nowMs: now - age,
        pixels: [{ x, y: 0, colorIndex: 1 }],
      });

    const recent = await core.listRecentEvents(canvasId, now - 5000);

    expect(recent.map((event) => event.version)).toEqual([2, 3]);
  });
});

describe("setObsDelay (JOURNAL 2026-09-25)", () => {
  // Écrit le délai dans meta et le publie aux pages du canvas, sans créer de version
  it("writes the delay in meta and publishes it to the canvas pages, without a version", async () => {
    const canvasId = uniqueCanvasId();
    await core.createCanvas(canvasId, meta);
    const received: LiveMessage[] = [];
    const unsubscribe = await core.subscribe(canvasId, (message) => received.push(message));

    await core.setObsDelay(canvasId, 60_000);
    await delay(100);
    await unsubscribe();

    expect((await core.getCanvas(canvasId))?.obsDelayMs).toBe(60_000);
    expect(received).toEqual([{ ctl: { t: "obsDelay", obsDelayMs: 60_000 } }]);
    expect(await redis.get(buildCanvasKeys(canvasId).version)).toBe("0");
  });
});
