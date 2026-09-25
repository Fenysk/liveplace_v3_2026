import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  type CanvasMeta,
  TRANSPARENT_COLOR_INDEX,
  toCellKey,
  toStateOffset,
} from "@liveplace/domain";
import type { LiveMessage, Moderation, ModerationSlice, Pixel } from "@liveplace/domain/ports";
import type { Event } from "@liveplace/protocol";
import { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCanvasCore, createSignInWrites } from "./client";
import { buildCanvasKeys, CLEAR_SLICE_CELLS, userKey } from "./keys";

// Base 15 : jamais celle du dev. 127.0.0.1 : `localhost` peut tomber sur wslrelay en IPv6.
const redis = new Redis({ host: "127.0.0.1", db: 15, lazyConnect: true, retryStrategy: () => null });
const liveSubscriber = redis.duplicate();
const core = createCanvasCore(redis, liveSubscriber);
const writes = createSignInWrites(redis);

const runId = randomUUID();
let canvasCount = 0;

const OWNER = "owner-1";
const now = 1_700_000_000_000;
const later = now + 60_000;

// Une grande jauge : un troll de plus de 4096 pixels se pose en quelques lots.
const meta: CanvasMeta = {
  ownerId: OWNER,
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  gaugeMax: 10_000,
  refillMs: 1000,
  refillCharges: 1,
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
  for await (const names of redis.scanStream({ match: `user:${runId}-*`, count: 1000 })) found.push(...names);
  if (found.length > 0) await redis.del(...found);
  liveSubscriber.disconnect();
  await redis.quit();
});

const readyCanvas = async () => {
  const canvasId = `${runId}-${++canvasCount}`;
  await core.createCanvas(canvasId, meta);
  return { canvasId, keys: buildCanvasKeys(canvasId) };
};

const placeAs = async (canvasId: string, userId: string, pixels: readonly Pixel[], nowMs = now) => {
  for (let start = 0; start < pixels.length; start += 64) {
    const batch = pixels.slice(start, start + 64);
    const result = await core.place(canvasId, { userId, requestId: randomUUID(), nowMs, pixels: batch });
    if (!result.ok || result.value.accepted !== batch.length) throw new Error(`pose refusée pour ${userId}`);
  }
};

const moderateOnce = async (canvasId: string, moderation: Moderation): Promise<ModerationSlice> => {
  const result = await core.moderate(canvasId, moderation);
  if (!result.ok) throw new Error(result.error);
  return result.value;
};

// Ce que fait le gateway : la première tranche, puis les suivantes jusqu'à la fin (§5.4).
const moderateAll = async (canvasId: string, by: string, action: Moderation["action"]) => {
  const slices = [await moderateOnce(canvasId, { by, nowMs: later, action, slice: "first" })];
  while (!slices.at(-1)?.isDone)
    slices.push(await moderateOnce(canvasId, { by, nowMs: later, action, slice: "next" }));
  return slices;
};

const clearUser = (target: string) => ({ action: "clearUser", target }) as const;
const ban = (target: string) => ({ action: "ban", target }) as const;
const unban = (target: string) => ({ action: "unban", target }) as const;

const colorAt = async (canvasId: string, x: number, y: number) =>
  (await redis.getBuffer(buildCanvasKeys(canvasId).state))?.[toStateOffset(x, y, meta.width)];

const eventAt = async (events: string, version: number): Promise<Event> => {
  const entries = await redis.xrange(events, `${version}-0`, `${version}-0`);
  return JSON.parse(entries[0]?.[1][1] ?? "null");
};

// `count` cases distinctes, ligne après ligne, toutes de la même couleur.
const squareOf = (count: number, colorIndex: number): Pixel[] =>
  Array.from({ length: count }, (_, index) => ({
    x: index % meta.width,
    y: Math.floor(index / meta.width),
    colorIndex,
  }));

describe("clearUser (§5.4)", () => {
  // Rend la couleur et l'auteur du dessous, et une case vide quand l'auteur était seul
  it("restores the color and author below, and empties a cell the author was alone on", async () => {
    const { canvasId, keys } = await readyCanvas();
    await placeAs(canvasId, "author-a", [{ x: 3, y: 2, colorIndex: 5 }], now);
    await placeAs(canvasId, "troll", [
      { x: 3, y: 2, colorIndex: 6 },
      { x: 4, y: 2, colorIndex: 7 },
    ]);

    const slices = await moderateAll(canvasId, OWNER, clearUser("troll"));

    expect(slices).toEqual([{ version: 3, cells: 2, isDone: true }]);
    expect(await colorAt(canvasId, 3, 2)).toBe(5);
    expect(await colorAt(canvasId, 4, 2)).toBe(TRANSPARENT_COLOR_INDEX);
    expect(await core.inspect(canvasId, 3, 2)).toMatchObject({ userId: "author-a", colorIndex: 5 });
    expect(await core.inspect(canvasId, 4, 2)).toBeNull();
    expect(await redis.exists(keys.hist(toCellKey(4, 2)), keys.cells("troll"), keys.clearing("troll"))).toBe(
      0,
    );
    expect(await redis.smembers(keys.cells("author-a"))).toEqual([String(toCellKey(3, 2))]);
    expect(await redis.hget(keys.cleared, "troll")).toBe("3");
    const event = await eventAt(keys.events, 3);
    expect(event).toMatchObject({
      version: 3,
      kind: "clear",
      authorId: OWNER,
      occurredAt: later,
      moderation: { action: "clearUser", target: "troll" },
    });
    expect(event.cells).toEqual(
      expect.arrayContaining([
        { x: 3, y: 2, colorIndex: 5, previousColorIndex: 6, placedAt: now },
        { x: 4, y: 2, colorIndex: TRANSPARENT_COLOR_INDEX, previousColorIndex: 7, placedAt: later },
      ]),
    );
  });

  // Ne fait jamais revenir un pixel enterré d'un auteur retiré, même quand on retire celui qui le couvrait (D-16)
  it("never brings back a buried pixel of a cleared author, even once its cover is cleared", async () => {
    const { canvasId, keys } = await readyCanvas();
    const cell = { x: 8, y: 9 };
    await placeAs(canvasId, "author-a", [{ ...cell, colorIndex: 2 }]);
    await placeAs(canvasId, "troll", [{ ...cell, colorIndex: 3 }]);
    await placeAs(canvasId, "author-c", [{ ...cell, colorIndex: 4 }]);

    // Le troll n'est plus visible ici : rien ne change à l'écran, mais la version avance quand même.
    expect(await moderateAll(canvasId, OWNER, clearUser("troll"))).toEqual([
      { version: 4, cells: 0, isDone: true },
    ]);
    expect(await colorAt(canvasId, cell.x, cell.y)).toBe(4);

    await moderateAll(canvasId, OWNER, clearUser("author-c"));

    expect(await colorAt(canvasId, cell.x, cell.y)).toBe(2);
    expect(await core.inspect(canvasId, cell.x, cell.y)).toMatchObject({ userId: "author-a" });
    expect(await redis.lrange(keys.hist(toCellKey(cell.x, cell.y)), 0, -1)).toEqual([`author-a:2:${now}:1`]);
  });

  // Fait revenir le pixel qu'un coup de gomme retiré avait effacé
  it("brings back the pixel that a cleared eraser had wiped", async () => {
    const { canvasId } = await readyCanvas();
    await placeAs(canvasId, "author-a", [{ x: 1, y: 1, colorIndex: 9 }]);
    await placeAs(canvasId, "troll", [{ x: 1, y: 1, colorIndex: TRANSPARENT_COLOR_INDEX }]);

    await moderateAll(canvasId, OWNER, clearUser("troll"));

    expect(await colorAt(canvasId, 1, 1)).toBe(9);
  });

  // Retire plus de 4096 cases en plusieurs tranches, sans en oublier une
  it("clears more than 4096 cells in several slices without missing one", async () => {
    const { canvasId, keys } = await readyCanvas();
    const pixels = squareOf(CLEAR_SLICE_CELLS + 4, 6);
    await placeAs(canvasId, "troll", pixels);

    const slices = await moderateAll(canvasId, OWNER, clearUser("troll"));

    expect(slices.map(({ cells, isDone }) => ({ cells, isDone }))).toEqual([
      { cells: CLEAR_SLICE_CELLS, isDone: false },
      { cells: 4, isDone: true },
    ]);
    const state = await redis.getBuffer(keys.state);
    expect(pixels.filter(({ x, y }) => state?.[toStateOffset(x, y, meta.width)] !== 0)).toEqual([]);
    expect(await redis.exists(keys.clearing("troll"), keys.cells("troll"))).toBe(0);
  });

  // Garde les pixels que la cible pose après le début du retrait : retirer n'est pas bannir
  it("keeps the pixels the target places after the clear began", async () => {
    const { canvasId } = await readyCanvas();
    await placeAs(canvasId, "troll", squareOf(CLEAR_SLICE_CELLS + 4, 6));
    const first = await moderateOnce(canvasId, {
      by: OWNER,
      nowMs: later,
      action: clearUser("troll"),
      slice: "first",
    });
    await placeAs(
      canvasId,
      "troll",
      [
        { x: 0, y: 200, colorIndex: 7 },
        { x: 0, y: 0, colorIndex: 7 },
        { x: 3, y: 16, colorIndex: 7 },
      ],
      later + 1,
    );

    const next = await moderateOnce(canvasId, {
      by: OWNER,
      nowMs: later,
      action: clearUser("troll"),
      slice: "next",
    });

    expect(first.isDone).toBe(false);
    expect(next.isDone).toBe(true);
    expect(await colorAt(canvasId, 0, 200)).toBe(7);
    expect(await colorAt(canvasId, 0, 0)).toBe(7);
    expect(await colorAt(canvasId, 3, 16)).toBe(7);
    expect(await colorAt(canvasId, 1, 0)).toBe(TRANSPARENT_COLOR_INDEX);
  });

  // Reprend au clearUser suivant un retrait interrompu après sa première tranche
  it("resumes an interrupted clear on the next clearUser of the same target", async () => {
    const { canvasId, keys } = await readyCanvas();
    const pixels = squareOf(CLEAR_SLICE_CELLS + 4, 6);
    await placeAs(canvasId, "troll", pixels);
    await moderateOnce(canvasId, { by: OWNER, nowMs: later, action: clearUser("troll"), slice: "first" });

    expect(await redis.scard(keys.clearing("troll"))).toBe(4);
    await moderateAll(canvasId, OWNER, clearUser("troll"));

    const state = await redis.getBuffer(keys.state);
    expect(pixels.filter(({ x, y }) => state?.[toStateOffset(x, y, meta.width)] !== 0)).toEqual([]);
    expect(await redis.exists(keys.clearing("troll"))).toBe(0);
  });
});

describe("ban and unban (§5.4, JOURNAL 2026-09-25)", () => {
  // Bannit : entre dans le stream sans case, publie l'événement puis le ctl, et place.lua refuse tout ensuite
  it("bans: enters the stream with no cell, publishes the event then the ctl, and place refuses everything", async () => {
    const { canvasId, keys } = await readyCanvas();
    const received: LiveMessage[] = [];
    const unsubscribe = await core.subscribe(canvasId, (message) => received.push(message));

    const slices = await moderateAll(canvasId, OWNER, ban("troll"));
    await delay(100);
    await unsubscribe();

    expect(slices).toEqual([{ version: 1, cells: 0, isDone: true }]);
    expect(await core.isBanned(canvasId, "troll")).toBe(true);
    expect(await core.isBanned(canvasId, "author-a")).toBe(false);
    const event = await eventAt(keys.events, 1);
    expect(event).toEqual({
      version: 1,
      kind: "clear",
      authorId: OWNER,
      occurredAt: later,
      cells: [],
      moderation: { action: "ban", target: "troll" },
    });
    expect(received).toEqual([{ e: event }, { ctl: { t: "banned", userId: "troll" } }]);
    const refused = await core.place(canvasId, {
      userId: "troll",
      requestId: randomUUID(),
      nowMs: later,
      pixels: [{ x: 0, y: 0, colorIndex: 1 }],
    });
    expect(refused.ok && refused.value.rejected).toEqual([{ index: 0, reason: "banned" }]);
  });

  // Garde la preuve du ban, ses pixels visibles, et ne la réécrit jamais par un second ban
  it("keeps the proof of a ban, the target's visible pixels, and never overwrites it with a second ban", async () => {
    const { canvasId } = await readyCanvas();
    await placeAs(canvasId, "troll", [
      { x: 1, y: 1, colorIndex: 4 },
      { x: 2, y: 1, colorIndex: 5 },
      { x: 3, y: 1, colorIndex: 6 },
    ]);
    await placeAs(canvasId, "author-a", [{ x: 3, y: 1, colorIndex: 8 }]);
    const proof = [
      { x: 1, y: 1, colorIndex: 4 },
      { x: 2, y: 1, colorIndex: 5 },
    ];

    expect(await core.listPixels(canvasId, "troll")).toEqual(expect.arrayContaining(proof));
    await moderateAll(canvasId, OWNER, ban("troll"));
    await moderateAll(canvasId, OWNER, clearUser("troll"));
    await moderateAll(canvasId, OWNER, ban("troll"));

    const listed = await core.listPixels(canvasId, "troll");
    expect(listed).toHaveLength(2);
    expect(listed).toEqual(expect.arrayContaining(proof));
    expect(await colorAt(canvasId, 1, 1)).toBe(TRANSPARENT_COLOR_INDEX);
  });

  // Débannit : il pose de nouveau, ses pixels retirés ne reviennent pas, sa preuve disparaît
  it("unbans: the target places again, its cleared pixels never return, and its proof is gone", async () => {
    const { canvasId, keys } = await readyCanvas();
    await placeAs(canvasId, "troll", [{ x: 5, y: 5, colorIndex: 4 }]);
    await moderateAll(canvasId, OWNER, ban("troll"));
    await moderateAll(canvasId, OWNER, clearUser("troll"));
    const received: LiveMessage[] = [];
    const unsubscribe = await core.subscribe(canvasId, (message) => received.push(message));

    await moderateAll(canvasId, OWNER, unban("troll"));
    await delay(100);
    await unsubscribe();
    await placeAs(canvasId, "troll", [{ x: 6, y: 5, colorIndex: 7 }], later + 1);

    expect(received.at(-1)).toEqual({ ctl: { t: "unbanned", userId: "troll" } });
    expect(await core.isBanned(canvasId, "troll")).toBe(false);
    expect(await redis.exists(keys.ban("troll"))).toBe(0);
    expect(await colorAt(canvasId, 5, 5)).toBe(TRANSPARENT_COLOR_INDEX);
    expect(await core.listPixels(canvasId, "troll")).toEqual([{ x: 6, y: 5, colorIndex: 7 }]);
  });

  // Liste les bannis avec leur miroir et le nombre de pixels de leur preuve
  it("lists the banned users with their mirror and the pixel count of their proof", async () => {
    const { canvasId } = await readyCanvas();
    const [troll, spammer] = [`${runId}-troll`, `${runId}-spammer`];
    await writes.setUser({
      userId: troll,
      login: "troll42",
      displayName: "Troll42",
      avatarUrl: "https://a/t.png",
    });
    await placeAs(canvasId, troll, squareOf(3, 4));
    await moderateAll(canvasId, OWNER, ban(troll));
    await moderateAll(canvasId, OWNER, ban(spammer));

    expect(await core.listBans(canvasId)).toEqual([
      { userId: spammer, login: spammer, displayName: spammer, pixelCount: 0 },
      {
        userId: troll,
        login: "troll42",
        displayName: "Troll42",
        avatarUrl: "https://a/t.png",
        pixelCount: 3,
      },
    ]);
    expect(await redis.exists(userKey(spammer))).toBe(0);
  });
});

describe("the rights of moderate (§5.4)", () => {
  // Refuse un viewer, et toute action qui vise le propriétaire, sans rien écrire
  it("refuses a viewer, and any action aimed at the owner, and writes nothing", async () => {
    const { canvasId, keys } = await readyCanvas();
    await placeAs(canvasId, "troll", [{ x: 0, y: 0, colorIndex: 3 }]);
    await redis.sadd(keys.mods, "moderator-1");

    const byViewer = { by: "viewer-1", nowMs: later, action: clearUser("troll"), slice: "first" } as const;
    const atOwner = { by: "moderator-1", nowMs: later, action: ban(OWNER), slice: "first" } as const;
    expect(await core.moderate(canvasId, byViewer)).toEqual({ ok: false, error: "forbidden" });
    expect(await core.moderate(canvasId, atOwner)).toEqual({ ok: false, error: "forbidden" });
    expect(await redis.get(keys.version)).toBe("1");
    expect(await redis.exists(keys.bans, keys.cleared)).toBe(0);

    await moderateAll(canvasId, "moderator-1", clearUser("troll"));
    expect(await colorAt(canvasId, 0, 0)).toBe(TRANSPARENT_COLOR_INDEX);
  });

  // Refuse un canvas pas prêt
  it("refuses a canvas that is not ready", async () => {
    const { canvasId, keys } = await readyCanvas();
    await redis.hset(keys.meta, "ready", "0");

    expect(
      await core.moderate(canvasId, { by: OWNER, nowMs: later, action: ban("troll"), slice: "first" }),
    ).toEqual({ ok: false, error: "canvas_not_found" });
  });
});
