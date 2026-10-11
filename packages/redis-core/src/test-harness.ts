import { randomUUID } from "node:crypto";
import { type CanvasMeta, toStateOffset } from "@liveplace/domain";
import type { Pixel } from "@liveplace/domain/ports";
import { Redis } from "ioredis";
import { afterAll, beforeAll, inject } from "vitest";
import { createCanvasCore } from "./client";
import { buildActivityKeys, buildCanvasKeys, buildCapacityKeys } from "./keys";

// Hors de `index.ts` : réservé aux tests. Une fabrique par fichier, jamais d'état de module : chaque fichier a son `runId`.
export function createRedisHarness() {
  // Le Redis de ce lancement (test-global-setup.ts), base 15 : la 14 est celle du worker. 127.0.0.1 : `localhost` peut tomber sur wslrelay en IPv6.
  const redis = new Redis({
    host: "127.0.0.1",
    port: inject("redisPort"),
    db: 15,
    lazyConnect: true,
    retryStrategy: () => null,
  });
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
      throw new Error("Redis de test injoignable : son conteneur Docker s'est arrêté");
    });
  });

  afterAll(async () => {
    const found: string[] = [];
    for (const prefix of [
      "cv",
      "user",
      "lock:owner",
      "activity",
      "capacity",
      "twitch:live",
      "twitch:message",
    ])
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

  // Une pose : tous ses lots portent la même `placementId`, 64 pixels au plus par lot, envoyés d'un coup (une connexion : dans l'ordre).
  const placeInBatches = async (
    canvasId: string,
    userId: string,
    placementId: string,
    pixels: readonly Pixel[],
    nowMs: number,
  ) => {
    const batches = Array.from({ length: Math.ceil(pixels.length / 64) }, (_, index) =>
      pixels.slice(index * 64, (index + 1) * 64),
    );
    const results = await Promise.all(
      batches.map((batch) =>
        core.place(canvasId, { userId, requestId: randomUUID(), placementId, nowMs, pixels: batch }),
      ),
    );
    results.forEach((result, index) => {
      if (!result.ok || result.value.accepted !== batches[index]?.length)
        throw new Error(`pose refusée pour ${userId}`);
    });
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
