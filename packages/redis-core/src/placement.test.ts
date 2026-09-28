import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { type CanvasMeta, TRANSPARENT_COLOR_INDEX, toCellKey, toStateOffset } from "@liveplace/domain";
import type { LiveMessage, Moderation, Pixel, Report } from "@liveplace/domain/ports";
import type { Event } from "@liveplace/protocol";
import { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCanvasCore } from "./client";
import { buildCanvasKeys, toPlacementKey } from "./keys";

// Base 15 : jamais celle du dev. 127.0.0.1 : `localhost` peut tomber sur wslrelay en IPv6.
const redis = new Redis({ host: "127.0.0.1", db: 15, lazyConnect: true, retryStrategy: () => null });
const liveSubscriber = redis.duplicate();
const core = createCanvasCore(redis, liveSubscriber);

const runId = randomUUID();
let canvasCount = 0;

const OWNER = "owner-1";
const now = 1_700_000_000_000;
const later = now + 3_600_000;

const meta: CanvasMeta = {
  ownerId: OWNER,
  width: 16,
  height: 16,
  gaugeMax: 1000,
  refillMs: 1000,
  refillCharges: 1,
  obsDelayMs: 10_000,
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

// Une pose : tous ses lots portent la même `placementId`, 64 pixels au plus par lot.
const placeAs = async (
  canvasId: string,
  userId: string,
  placementId: string,
  pixels: Pixel[],
  nowMs = now,
) => {
  for (let start = 0; start < pixels.length; start += 64) {
    const batch = pixels.slice(start, start + 64);
    const result = await core.place(canvasId, {
      userId,
      requestId: randomUUID(),
      placementId,
      nowMs,
      pixels: batch,
    });
    if (!result.ok || result.value.accepted !== batch.length) throw new Error(`pose refusée pour ${userId}`);
  }
};

const moderateAll = async (canvasId: string, action: Moderation["action"]) => {
  const slice = async (which: "first" | "next") => {
    const result = await core.moderate(canvasId, { by: OWNER, nowMs: later, action, slice: which });
    if (!result.ok) throw new Error(result.error);
    return result.value;
  };
  let last = await slice("first");
  while (!last.isDone) last = await slice("next");
};

const colorAt = async (canvasId: string, x: number, y: number) =>
  (await redis.getBuffer(buildCanvasKeys(canvasId).state))?.[toStateOffset(x, y, meta.width)];

const lastEvent = async (canvasId: string): Promise<Event> => {
  const [entry] = await redis.xrevrange(buildCanvasKeys(canvasId).events, "+", "-", "COUNT", 1);
  return JSON.parse(entry?.[1][1] ?? "null");
};

const row = (y: number, from: number, to: number, colorIndex: number): Pixel[] =>
  Array.from({ length: to - from + 1 }, (_, index) => ({ x: from + index, y, colorIndex }));

const report = (canvasId: string, overrides: Partial<Report> & Pick<Report, "reporterId">) =>
  core.report(canvasId, { x: 0, y: 0, placementId: "ptroll001", threshold: 1, nowMs: now, ...overrides });

describe("clearPlacement (JOURNAL 2026-09-28)", () => {
  // Retire la pose seule, tous ses lots compris, et laisse les autres poses de l'auteur
  it("clears the placement alone, all its batches included, and keeps the author's other placements", async () => {
    const { canvasId } = await readyCanvas();
    await placeAs(canvasId, "author-a", "pbelow001", [{ x: 0, y: 5, colorIndex: 3 }]);
    await placeAs(canvasId, "troll", "pkept0001", [{ x: 1, y: 5, colorIndex: 9 }]);
    const troll = [...row(0, 0, 15, 4), ...row(1, 0, 15, 4), ...row(2, 0, 15, 4), ...row(3, 0, 15, 4)];
    await placeAs(canvasId, "troll", "ptroll001", [...troll, { x: 0, y: 5, colorIndex: 4 }]);

    await moderateAll(canvasId, { action: "clearPlacement", target: "troll", placementId: "ptroll001" });

    expect(await colorAt(canvasId, 15, 3)).toBe(TRANSPARENT_COLOR_INDEX);
    expect(await colorAt(canvasId, 0, 5)).toBe(3);
    expect(await colorAt(canvasId, 1, 5)).toBe(9);
    expect(await core.listPixels(canvasId, "troll")).toEqual([
      { x: 1, y: 5, colorIndex: 9, placedAt: now, placementId: "pkept0001" },
    ]);
  });

  // Une plage d'heures étend le retrait aux poses voisines, et pas au-delà
  it("extends to neighbouring placements within the range, and no further", async () => {
    const { canvasId } = await readyCanvas();
    await placeAs(canvasId, "troll", "pbefore01", [{ x: 0, y: 0, colorIndex: 4 }], now - 120_000);
    await placeAs(canvasId, "troll", "pnear0001", [{ x: 1, y: 0, colorIndex: 4 }], now - 30_000);
    await placeAs(canvasId, "troll", "ptroll001", [{ x: 2, y: 0, colorIndex: 4 }], now);

    await moderateAll(canvasId, {
      action: "clearPlacement",
      target: "troll",
      placementId: "ptroll001",
      range: { from: now - 60_000, to: now + 60_000 },
    });

    expect(await colorAt(canvasId, 0, 0)).toBe(4);
    expect(await colorAt(canvasId, 1, 0)).toBe(TRANSPARENT_COLOR_INDEX);
    expect(await colorAt(canvasId, 2, 0)).toBe(TRANSPARENT_COLOR_INDEX);
  });

  // Un pixel de la pose, enterré sous un autre, ne revient jamais, même quand on retire ce qui le couvrait
  it("never brings back a buried pixel of the placement, even once its cover is cleared", async () => {
    const { canvasId } = await readyCanvas();
    await placeAs(canvasId, "author-a", "pbelow001", [{ x: 3, y: 3, colorIndex: 2 }]);
    await placeAs(canvasId, "troll", "ptroll001", [{ x: 3, y: 3, colorIndex: 4 }]);
    await placeAs(canvasId, "author-c", "pcover001", [{ x: 3, y: 3, colorIndex: 6 }]);

    await moderateAll(canvasId, { action: "clearPlacement", target: "troll", placementId: "ptroll001" });
    await moderateAll(canvasId, { action: "clearUser", target: "author-c" });

    expect(await colorAt(canvasId, 3, 3)).toBe(2);
  });

  // Un pixel d'avant le protocole 6 a pour pose sa version : il s'inspecte et se retire par elle
  it("names a pixel from before protocol 6 by its version, to inspect and clear it", async () => {
    const { canvasId, keys } = await readyCanvas();
    await redis.lpush(keys.hist(toCellKey(4, 4)), `troll:7:${now}:42`);
    await redis.sadd(keys.cells("troll"), String(toCellKey(4, 4)));
    await redis.setrange(keys.state, toStateOffset(4, 4, meta.width), String.fromCharCode(7));

    expect(await core.inspect(canvasId, 4, 4)).toMatchObject({ userId: "troll", placementId: "42" });
    await moderateAll(canvasId, { action: "clearPlacement", target: "troll", placementId: "42" });

    expect(await colorAt(canvasId, 4, 4)).toBe(TRANSPARENT_COLOR_INDEX);
  });
});

describe("report (JOURNAL 2026-09-28)", () => {
  // Refuse une case qui ne montre plus cette pose, et ce qui ne se signale pas
  it("refuses a cell that no longer shows the placement, and what cannot be reported", async () => {
    const { canvasId, keys } = await readyCanvas();
    await placeAs(canvasId, "troll", "ptroll001", [{ x: 0, y: 0, colorIndex: 4 }]);
    await placeAs(canvasId, OWNER, "powner001", [{ x: 1, y: 0, colorIndex: 4 }]);
    await redis.sadd(keys.bans, "banned-1");

    expect(await report(canvasId, { reporterId: "viewer-1", placementId: "pother001" })).toEqual({
      ok: false,
      error: "changed",
    });
    expect(await report(canvasId, { reporterId: "viewer-1", x: 5 })).toEqual({ ok: false, error: "changed" });
    expect(await report(canvasId, { reporterId: "troll" })).toEqual({ ok: false, error: "forbidden" });
    expect(await report(canvasId, { reporterId: "banned-1" })).toEqual({ ok: false, error: "forbidden" });
    expect(await report(canvasId, { reporterId: "viewer-1", x: 1, placementId: "powner001" })).toEqual({
      ok: false,
      error: "forbidden",
    });
  });

  // Sous le seuil, la pose attend un modérateur sans quitter le stream ; un second signalement du même compte ne compte pas
  it("below the threshold, waits for a moderator without leaving the stream; a second report by the same account does not count", async () => {
    const { canvasId, keys } = await readyCanvas();
    await placeAs(canvasId, "troll", "ptroll001", [{ x: 0, y: 0, colorIndex: 4 }]);

    expect(await report(canvasId, { reporterId: "viewer-1", threshold: 2 })).toEqual({
      ok: true,
      value: undefined,
    });
    expect(await report(canvasId, { reporterId: "viewer-1", threshold: 2 })).toEqual({
      ok: true,
      value: undefined,
    });

    const placementKey = toPlacementKey({ authorId: "troll", placementId: "ptroll001" });
    expect(await redis.scard(keys.reports(placementKey))).toBe(1);
    expect(await redis.sismember(keys.offStream, placementKey)).toBe(0);
    expect(await core.getReportCount(canvasId)).toBe(1);
    expect(await core.canReport(canvasId, { authorId: "troll", placementId: "ptroll001" }, "viewer-1")).toBe(
      false,
    );
    expect(await core.canReport(canvasId, { authorId: "troll", placementId: "ptroll001" }, "viewer-2")).toBe(
      true,
    );
  });

  // Au seuil, un `hide` montre au stream ce qu'il y a sous la pose, sans rien changer à la page
  it("at the threshold, a hide shows the stream what lies below the placement, and changes nothing for the page", async () => {
    const { canvasId } = await readyCanvas();
    await placeAs(canvasId, "author-a", "pbelow001", [{ x: 0, y: 0, colorIndex: 3 }], now - 5000);
    await placeAs(canvasId, "troll", "ptroll001", [
      { x: 0, y: 0, colorIndex: 4 },
      { x: 1, y: 0, colorIndex: 4 },
    ]);
    const received: LiveMessage[] = [];
    const unsubscribe = await core.subscribe(canvasId, (message) => received.push(message));

    await report(canvasId, { reporterId: "viewer-1" });
    await delay(100);
    await unsubscribe();

    const hide = await lastEvent(canvasId);
    expect(hide).toMatchObject({ kind: "hide", authorId: null });
    expect(hide.cells).toEqual(
      expect.arrayContaining([
        {
          x: 0,
          y: 0,
          colorIndex: 4,
          previousColorIndex: 4,
          placedAt: now,
          obs: { colorIndex: 3, previousColorIndex: 4, placedAt: now - 5000 },
        },
        {
          x: 1,
          y: 0,
          colorIndex: 4,
          previousColorIndex: 4,
          placedAt: now,
          obs: { colorIndex: 0, previousColorIndex: 4, placedAt: 0 },
        },
      ]),
    );
    expect(await colorAt(canvasId, 0, 0)).toBe(4);
    expect(received.at(-1)).toEqual({ ctl: { t: "reports", count: 1 } });
    expect(await core.listOffStreamCells(canvasId)).toEqual(
      expect.arrayContaining([
        { x: 0, y: 0, colorIndex: 3 },
        { x: 1, y: 0, colorIndex: 0 },
      ]),
    );
  });

  // Signalée avant son dernier lot : ses lots suivants n'atteignent jamais le stream
  it("reported before its last batch: its next batches never reach the stream", async () => {
    const { canvasId } = await readyCanvas();
    await placeAs(canvasId, "author-a", "pbelow001", [{ x: 2, y: 0, colorIndex: 3 }], now - 5000);
    await placeAs(canvasId, "troll", "ptroll001", [{ x: 0, y: 0, colorIndex: 4 }]);
    await report(canvasId, { reporterId: "viewer-1" });

    await placeAs(canvasId, "troll", "ptroll001", [{ x: 2, y: 0, colorIndex: 4 }]);

    expect((await lastEvent(canvasId)).cells).toEqual([
      {
        x: 2,
        y: 0,
        colorIndex: 4,
        previousColorIndex: 3,
        placedAt: now,
        obs: { colorIndex: 3, previousColorIndex: 3, placedAt: now - 5000 },
      },
    ]);
  });

  // Un pixel posé sur une pose cachée dit au stream ce qu'il montrait avant lui : jamais la pose cachée
  it("a pixel placed over a hidden placement tells the stream what it showed before: never the hidden placement", async () => {
    const { canvasId } = await readyCanvas();
    await placeAs(canvasId, "troll", "ptroll001", [{ x: 0, y: 0, colorIndex: 4 }]);
    await report(canvasId, { reporterId: "viewer-1" });

    await placeAs(canvasId, "author-a", "pcover001", [{ x: 0, y: 0, colorIndex: 8 }], now + 1000);

    expect((await lastEvent(canvasId)).cells).toEqual([
      {
        x: 0,
        y: 0,
        colorIndex: 8,
        previousColorIndex: 4,
        placedAt: now + 1000,
        obs: { colorIndex: 8, previousColorIndex: 0, placedAt: now + 1000 },
      },
    ]);
  });

  // Un pixel retiré sous une pose cachée quitte aussitôt le stream, qui le montrait
  it("a cleared pixel under a hidden placement leaves the stream at once, which was showing it", async () => {
    const { canvasId } = await readyCanvas();
    await placeAs(canvasId, "author-a", "pbelow001", [{ x: 0, y: 0, colorIndex: 3 }], now - 5000);
    await placeAs(canvasId, "troll", "ptroll001", [{ x: 0, y: 0, colorIndex: 4 }]);
    await report(canvasId, { reporterId: "viewer-1" });

    await moderateAll(canvasId, { action: "clearUser", target: "author-a" });

    expect((await lastEvent(canvasId)).cells).toContainEqual(
      expect.objectContaining({ x: 0, y: 0, colorIndex: 4, obs: expect.objectContaining({ colorIndex: 0 }) }),
    );
  });
});

describe("approvePlacement and the reports list (JOURNAL 2026-09-28)", () => {
  // Rétablir ramène la pose sur le stream, la sort des signalements, et elle ne se signale plus
  it("brings the placement back on the stream, out of the reports, never reportable again", async () => {
    const { canvasId } = await readyCanvas();
    await placeAs(canvasId, "troll", "ptroll001", [{ x: 0, y: 0, colorIndex: 4 }]);
    await report(canvasId, { reporterId: "viewer-1" });

    await moderateAll(canvasId, { action: "approvePlacement", target: "troll", placementId: "ptroll001" });

    const unhide = await lastEvent(canvasId);
    expect(unhide).toMatchObject({
      kind: "unhide",
      moderation: { action: "approvePlacement", target: "troll" },
    });
    expect(unhide.cells).toEqual([{ x: 0, y: 0, colorIndex: 4, previousColorIndex: 4, placedAt: now }]);
    expect(await core.listOffStreamCells(canvasId)).toEqual([]);
    expect(await core.getReportCount(canvasId)).toBe(0);
    expect(await report(canvasId, { reporterId: "viewer-2" })).toEqual({ ok: false, error: "forbidden" });
  });

  // Liste la pose signalée avec ses pixels visibles, puis l'oublie une fois retirée
  it("lists a reported placement with its visible pixels, then forgets it once cleared", async () => {
    const { canvasId, keys } = await readyCanvas();
    await redis.hset("user:troll", { login: "troll", displayName: "Troll" });
    await placeAs(canvasId, "troll", "ptroll001", [
      { x: 0, y: 0, colorIndex: 4 },
      { x: 1, y: 0, colorIndex: 5 },
    ]);
    await report(canvasId, { reporterId: "viewer-1" });

    expect(await core.listReports(canvasId)).toEqual([
      {
        userId: "troll",
        login: "troll",
        displayName: "Troll",
        hasAccount: true,
        placementId: "ptroll001",
        reportCount: 1,
        reportedAt: now,
        isOffStream: true,
        pixels: expect.arrayContaining([
          { x: 0, y: 0, colorIndex: 4 },
          { x: 1, y: 0, colorIndex: 5 },
        ]),
      },
    ]);
    await moderateAll(canvasId, { action: "clearPlacement", target: "troll", placementId: "ptroll001" });

    expect(await core.listReports(canvasId)).toEqual([]);
    expect(await redis.exists(keys.offStream, keys.reported)).toBe(0);
    await redis.del("user:troll");
  });

  // Élague une pose signalée qui n'a plus aucun pixel visible
  it("prunes a reported placement that no longer has a visible pixel", async () => {
    const { canvasId } = await readyCanvas();
    await placeAs(canvasId, "troll", "ptroll001", [{ x: 0, y: 0, colorIndex: 4 }]);
    await report(canvasId, { reporterId: "viewer-1", threshold: 5 });
    await placeAs(canvasId, "author-a", "pcover001", [{ x: 0, y: 0, colorIndex: 8 }], now + 1000);

    expect(await core.listReports(canvasId)).toEqual([]);
    expect(await core.getReportCount(canvasId)).toBe(0);
  });
});

describe("reporting a time range, and the proof of a ban after a clear (JOURNAL 2026-09-29)", () => {
  // Une plage signale chaque pose de l'auteur qui y tombe, et chacune quitte le stream à son seuil
  it("a range reports each of the author's placements inside it, and each leaves the stream at its threshold", async () => {
    const { canvasId, keys } = await readyCanvas();
    await placeAs(canvasId, "troll", "pbefore01", [{ x: 1, y: 0, colorIndex: 4 }], now - 3 * 60_000);
    await placeAs(canvasId, "troll", "pafter001", [{ x: 2, y: 0, colorIndex: 4 }], now + 20 * 60_000);
    await placeAs(canvasId, "troll", "ptroll001", [{ x: 0, y: 0, colorIndex: 4 }]);

    await report(canvasId, {
      reporterId: "viewer-1",
      range: { from: now - 5 * 60_000, to: now + 5 * 60_000 },
    });

    const placementKey = (placementId: string) => toPlacementKey({ authorId: "troll", placementId });
    expect(await redis.zrange(keys.reported, "0", "-1")).toEqual(
      [placementKey("pbefore01"), placementKey("ptroll001")].sort(),
    );
    expect((await core.listOffStreamCells(canvasId)).map(({ x }) => x).sort()).toEqual([0, 1]);
    expect(await core.canReport(canvasId, { authorId: "troll", placementId: "pafter001" }, "viewer-1")).toBe(
      true,
    );
  });

  // Une pose rétablie reste hors de la plage signalée
  it("an approved placement stays out of a reported range", async () => {
    const { canvasId } = await readyCanvas();
    await placeAs(canvasId, "troll", "pbefore01", [{ x: 1, y: 0, colorIndex: 4 }], now - 60_000);
    await placeAs(canvasId, "troll", "ptroll001", [{ x: 0, y: 0, colorIndex: 4 }]);
    await moderateAll(canvasId, { action: "approvePlacement", target: "troll", placementId: "pbefore01" });

    await report(canvasId, { reporterId: "viewer-1", range: { from: now - 5 * 60_000, to: now } });

    expect((await core.listOffStreamCells(canvasId)).map(({ x }) => x)).toEqual([0]);
  });

  // Donne les pixels de l'auteur d'une pose sans son identifiant, et rien quand la case a changé
  it("gives the pixels of a placement's author without their id, and nothing once the cell has changed", async () => {
    const { canvasId } = await readyCanvas();
    await placeAs(canvasId, "troll", "pbefore01", [{ x: 1, y: 0, colorIndex: 4 }], now - 60_000);
    await placeAs(canvasId, "troll", "ptroll001", [{ x: 0, y: 0, colorIndex: 5 }]);

    expect(await core.listAuthorPixels(canvasId, 0, 0, "ptroll001")).toEqual(
      expect.arrayContaining([
        { x: 0, y: 0, colorIndex: 5, placedAt: now, placementId: "ptroll001" },
        { x: 1, y: 0, colorIndex: 4, placedAt: now - 60_000, placementId: "pbefore01" },
      ]),
    );
    expect(await core.listAuthorPixels(canvasId, 0, 0, "pother001")).toBeNull();
    expect(await core.listAuthorPixels(canvasId, 5, 5, "ptroll001")).toBeNull();
  });

  // Un ban qui suit un retrait garde en preuve la pose retirée, sous ses pixels encore visibles
  it("a ban after a clear keeps the cleared placement as proof, under the pixels still visible", async () => {
    const { canvasId, keys } = await readyCanvas();
    await placeAs(canvasId, "troll", "pkept0001", [{ x: 3, y: 0, colorIndex: 9 }], now - 60_000);
    await placeAs(canvasId, "troll", "ptroll001", [
      { x: 0, y: 0, colorIndex: 4 },
      { x: 1, y: 0, colorIndex: 4 },
    ]);
    await moderateAll(canvasId, { action: "clearPlacement", target: "troll", placementId: "ptroll001" });
    expect(await redis.ttl(keys.recentlyCleared("troll"))).toBeGreaterThan(3000);

    await moderateAll(canvasId, { action: "ban", target: "troll" });

    expect(await core.listPixels(canvasId, "troll")).toEqual(
      expect.arrayContaining([
        { x: 0, y: 0, colorIndex: 4 },
        { x: 1, y: 0, colorIndex: 4 },
        { x: 3, y: 0, colorIndex: 9 },
      ]),
    );
    expect(await redis.exists(keys.recentlyCleared("troll"))).toBe(0);
  });
});
