import { randomUUID } from "node:crypto";
import { type CanvasMeta, CELL_STRIDE, toStateOffset } from "@liveplace/domain";
import type { Pixel } from "@liveplace/domain/ports";
import { Redis } from "ioredis";
import { afterAll, beforeAll, inject } from "vitest";
import { createCanvasCore } from "./client";
import { buildActivityKeys, buildCanvasKeys, buildCapacityKeys } from "./keys";

// Un dessin plein : la couleur d'une case dit sa place dans le dessin, donc une déchirure se voit.
export const patternAt = (dx: number, dy: number): number => 1 + ((dx + 7 * dy) % 40);

export const drawing = (x0: number, y0: number, width: number, height: number): Pixel[] =>
  Array.from({ length: width * height }, (_, index) => {
    const [dx, dy] = [index % width, Math.floor(index / width)];
    return { x: x0 + dx, y: y0 + dy, colorIndex: patternAt(dx, dy) };
  });

type Piles = Map<number, { author: string; colorIndex: number; depth: number }>;

// Le `drawing` d'un auteur dans les piles : son coin haut gauche, ses cases colorées, et celles qui ne sont pas à leur place.
export const locateIn = (piles: Piles, author: string, width: number, height: number) => {
  const cells = [...piles]
    .filter(([, pile]) => pile.author === author && pile.colorIndex !== 0)
    .map(([cellKey, { colorIndex }]) => ({
      x: cellKey % CELL_STRIDE,
      y: Math.floor(cellKey / CELL_STRIDE),
      colorIndex,
    }));
  const [x, y] = [Math.min(...cells.map((cell) => cell.x)), Math.min(...cells.map((cell) => cell.y))];
  const isTorn = (cell: (typeof cells)[number]): boolean =>
    cell.x - x >= width || cell.y - y >= height || cell.colorIndex !== patternAt(cell.x - x, cell.y - y);
  return { x, y, count: cells.length, torn: cells.filter(isTorn).length };
};

// Un générateur à graine : le scénario est le même à chaque lancement.
export const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let mixed = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
  return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
};

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
  // L'activité n'a pas de canvas pour la séparer : un préfixe par appel (§16.2).
  const uniqueActivityKeys = () => buildActivityKeys(`activity:${uniqueCanvasId()}-`);
  // La capacité non plus (§16.3).
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

  // Le secret des sessions des tests : l'empreinte d'un compte supprimé en découle (deleted-accounts.ts).
  const secret = "un-secret-de-session-de-plus-de-32-octets";

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

  // Toutes les piles d'un canvas, par case : la tête (auteur et couleur) et la profondeur, cadre et hors du cadre.
  const listPiles = async (canvasId: string) => {
    const { histPrefix } = buildCanvasKeys(canvasId);
    const piles: Piles = new Map();
    for await (const names of redis.scanStream({ match: `${histPrefix}*`, count: 1000 }))
      for (const name of names) {
        const entries = await redis.lrange(name, 0, -1);
        const [author, colorIndex] = entries[0]?.split(":") ?? [];
        piles.set(Number(name.slice(histPrefix.length)), {
          author: author ?? "",
          colorIndex: Number(colorIndex),
          depth: entries.length,
        });
      }
    return piles;
  };

  const locateDrawing = async (canvasId: string, author: string, width: number, height: number) =>
    locateIn(await listPiles(canvasId), author, width, height);

  return {
    redis,
    core,
    runId,
    secret,
    uniqueCanvasId,
    uniqueActivityKeys,
    uniqueCapacityKeys,
    readyCanvas,
    colorAt,
    placeInBatches,
    listPiles,
    locateDrawing,
  };
}
