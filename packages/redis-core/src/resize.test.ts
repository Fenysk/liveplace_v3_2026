import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { type CanvasMeta, toStateOffset } from "@liveplace/domain";
import type { LiveMessage, Moderation, Pixel } from "@liveplace/domain/ports";
import { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCanvasCore } from "./client";
import { buildCanvasKeys } from "./keys";

// Base 15 : jamais celle du dev. 127.0.0.1 : `localhost` peut tomber sur wslrelay en IPv6.
const redis = new Redis({ host: "127.0.0.1", db: 15, lazyConnect: true, retryStrategy: () => null });
const liveSubscriber = redis.duplicate();
const core = createCanvasCore(redis, liveSubscriber);

const runId = randomUUID();
let canvasCount = 0;

const OWNER = "owner-1";
const now = 1_700_000_000_000;

const meta: CanvasMeta = {
  ownerId: OWNER,
  width: 100,
  height: 100,
  gaugeMaxStart: 100,
  gaugeMaxCeiling: 150,
  refillMs: 1000,
  refillCharges: 1,
  obsDelayMs: 10_000,
  obsBackground: "transparent",
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

const readyCanvas = async () => {
  const canvasId = `${runId}-${++canvasCount}`;
  await core.createCanvas(canvasId, meta);
  return { canvasId, keys: buildCanvasKeys(canvasId) };
};

const placeAs = async (canvasId: string, userId: string, pixels: Pixel[]) => {
  const result = await core.place(canvasId, {
    userId,
    requestId: randomUUID(),
    placementId: `p${randomUUID().replaceAll("-", "").slice(0, 15)}`,
    nowMs: now,
    pixels,
  });
  if (!result.ok) throw new Error("canvas absent");
  return result.value;
};

const resize = async (canvasId: string, width: number, height: number, by = OWNER) =>
  core.resizeCanvas(canvasId, { by, width, height });

const colorAt = async (canvasId: string, x: number, y: number, width: number) =>
  (await redis.getBuffer(buildCanvasKeys(canvasId).state))?.[toStateOffset(x, y, width)];

describe("resizeCanvas (JOURNAL 2026-09-29)", () => {
  // Rétrécir garde les pixels hors du cadre, invisibles ; ré-agrandir les rend, là où ils étaient
  it("shrinking keeps the pixels outside the frame, invisible; growing again brings them back where they were", async () => {
    const { canvasId, keys } = await readyCanvas();
    await placeAs(canvasId, "author-a", [
      { x: 10, y: 10, colorIndex: 5 },
      { x: 80, y: 20, colorIndex: 6 },
      { x: 20, y: 70, colorIndex: 7 },
    ]);

    expect(await resize(canvasId, 50, 50)).toEqual({ ok: true, value: undefined });
    expect(await redis.strlen(keys.state)).toBe(2500);
    expect(await colorAt(canvasId, 10, 10, 50)).toBe(5);
    expect(await core.listPixels(canvasId, "author-a")).toEqual([
      expect.objectContaining({ x: 10, y: 10, colorIndex: 5 }),
    ]);

    await resize(canvasId, 100, 100);

    expect(await redis.strlen(keys.state)).toBe(10_000);
    expect(await colorAt(canvasId, 10, 10, 100)).toBe(5);
    expect(await colorAt(canvasId, 80, 20, 100)).toBe(6);
    expect(await colorAt(canvasId, 20, 70, 100)).toBe(7);
  });

  // Refuse une pose hors du cadre, et un autre que le streamer
  it("refuses a pixel outside the frame, and anyone but the owner", async () => {
    const { canvasId } = await readyCanvas();
    await resize(canvasId, 64, 36);

    const ack = await placeAs(canvasId, "author-a", [
      { x: 63, y: 35, colorIndex: 5 },
      { x: 64, y: 0, colorIndex: 5 },
      { x: 0, y: 36, colorIndex: 5 },
    ]);

    expect(ack.accepted).toBe(1);
    expect(ack.rejected.map(({ reason }) => reason)).toEqual(["invalid", "invalid"]);
    expect(await resize(canvasId, 50, 50, "author-a")).toEqual({ ok: false, error: "forbidden" });
  });

  // Prévient les pages, marque la version, et force un snapshot à toute reprise d'avant
  it("tells the pages, marks the version, and forces a snapshot on any resync from before", async () => {
    const { canvasId, keys } = await readyCanvas();
    await placeAs(canvasId, "author-a", [{ x: 1, y: 1, colorIndex: 5 }]);
    const received: LiveMessage[] = [];
    const unsubscribe = await core.subscribe(canvasId, (message) => received.push(message));

    await resize(canvasId, 128, 72);
    await delay(100);
    await unsubscribe();
    await placeAs(canvasId, "author-a", [{ x: 2, y: 1, colorIndex: 6 }]);

    expect(received).toEqual([{ ctl: { t: "resize" } }]);
    expect(await redis.hmget(keys.meta, "width", "height", "resizedAtVersion")).toEqual(["128", "72", "2"]);
    expect(await core.listEvents(canvasId, 2, 100)).toBeNull();
    expect(await core.listEvents(canvasId, 3, 100)).toHaveLength(1);
    expect(await core.listRecentEvents(canvasId, 0)).toEqual([expect.objectContaining({ version: 3 })]);
  });

  // Un retrait qui touche une case hors du cadre ne l'écrit ni ne l'émet : `state` reste intact
  it("a clear that reaches a cell outside the frame neither writes nor sends it: `state` stays intact", async () => {
    const { canvasId, keys } = await readyCanvas();
    await placeAs(canvasId, "troll", [
      { x: 1, y: 0, colorIndex: 5 },
      { x: 60, y: 0, colorIndex: 6 },
    ]);
    await placeAs(canvasId, "author-a", [{ x: 10, y: 1, colorIndex: 9 }]);
    await resize(canvasId, 50, 50);
    const before = await redis.getBuffer(keys.state);

    const clear: Moderation = {
      by: OWNER,
      nowMs: now,
      action: { action: "clearUser", target: "troll" },
      slice: "first",
    };
    expect(await core.moderate(canvasId, clear)).toEqual({
      ok: true,
      value: { version: 4, cells: 1, isDone: true },
    });

    const after = await redis.getBuffer(keys.state);
    expect(after?.[toStateOffset(1, 0, 50)]).toBe(0);
    expect(after?.[toStateOffset(10, 1, 50)]).toBe(9);
    expect(before?.filter((_, offset) => offset !== toStateOffset(1, 0, 50))).toEqual(
      after?.filter((_, offset) => offset !== toStateOffset(1, 0, 50)),
    );
  });
});
