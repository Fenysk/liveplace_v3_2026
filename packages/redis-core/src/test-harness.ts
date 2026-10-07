import { randomUUID } from "node:crypto";
import { type CanvasMeta, toStateOffset } from "@liveplace/domain";
import type { Pixel } from "@liveplace/domain/ports";
import { Redis } from "ioredis";
import { afterAll, beforeAll } from "vitest";
import { createCanvasCore } from "./client";
import { buildActivityKeys, buildCanvasKeys, buildCapacityKeys } from "./keys";

// Hors de `index.ts` : réservé aux tests. Une fabrique par fichier, jamais d'état de module : chaque fichier a son `runId`.
export function createRedisHarness() {
  // Base 15 : jamais celle du dev. 127.0.0.1 : `localhost` peut tomber sur wslrelay en IPv6.
  const redis = new Redis({ host: "127.0.0.1", db: 15, lazyConnect: true, retryStrategy: () => null });
  // Une connexion abonnée à part : en mode subscribe, Redis n'accepte plus les autres commandes (§6.3).
  const liveSubscriber = redis.duplicate();
  const core = createCanvasCore(redis, liveSubscriber);

  // Un préfixe par exécution : le nettoyage ne touche que les clés de ce fichier.
  const runId = randomUUID();
  let canvasCount = 0;
  const uniqueCanvasId = () => `${runId}-${++canvasCount}`;
  // L'activité n'a pas de canvas pour la séparer : un préfixe par appel (écart §5.1, JOURNAL 2026-10-06).
  const uniqueActivityKeys = () => buildActivityKeys(`activity:${uniqueCanvasId()}-`);
  // La capacité non plus (écart §5.1, JOURNAL 2026-10-07).
  const uniqueCapacityKeys = () => buildCapacityKeys(`capacity:${uniqueCanvasId()}-`);

  beforeAll(async () => {
    await redis.connect().catch(() => {
      throw new Error("Redis absent : docker compose -f docker-compose.dev.yml up -d");
    });
  });

  afterAll(async () => {
    const found: string[] = [];
    for (const prefix of ["cv", "user", "lock:owner", "activity", "capacity", "twitch:live"])
      for await (const names of redis.scanStream({ match: `${prefix}:${runId}-*`, count: 1000 }))
        found.push(...names);
    if (found.length > 0) await redis.del(...found);
    liveSubscriber.disconnect();
    await redis.quit();
  });

  const readyCanvas = async (meta: CanvasMeta) => {
    const canvasId = uniqueCanvasId();
    await core.createCanvas(canvasId, meta);
    return { canvasId, keys: buildCanvasKeys(canvasId) };
  };

  const colorAt = async (canvasId: string, x: number, y: number, width: number) =>
    (await redis.getBuffer(buildCanvasKeys(canvasId).state))?.[toStateOffset(x, y, width)];

  // Une pose : tous ses lots portent la même `placementId`, 64 pixels au plus par lot.
  const placeInBatches = async (
    canvasId: string,
    userId: string,
    placementId: string,
    pixels: readonly Pixel[],
    nowMs: number,
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
      if (!result.ok || result.value.accepted !== batch.length)
        throw new Error(`pose refusée pour ${userId}`);
    }
  };

  return {
    redis,
    core,
    runId,
    uniqueCanvasId,
    uniqueActivityKeys,
    uniqueCapacityKeys,
    readyCanvas,
    colorAt,
    placeInBatches,
  };
}
