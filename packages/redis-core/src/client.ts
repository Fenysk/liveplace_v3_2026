// Client typé du noyau Redis (§5.6).

import { readFileSync } from "node:fs";
import {
  type CanvasMeta,
  CELL_STRIDE,
  PALETTE,
  refillGauge,
  type Timestamp,
  toCell,
  toCellKey,
  toStateOffset,
} from "@liveplace/domain";
import type {
  AckFrame,
  BannedUser,
  CanvasCore,
  InspectEntry,
  LiveMessage,
  Moderation,
  ModerationSlice,
  Pixel,
  Placement,
  SignInWrites,
  Snapshot,
  Unsubscribe,
} from "@liveplace/domain/ports";
import { decodeServerFrame } from "@liveplace/protocol";
import type { Result } from "@liveplace/shared";
import type { Redis, Result as RedisResult } from "ioredis";
import {
  buildCanvasKeys,
  CLEAR_SLICE_CELLS,
  EVENTS_MAXLEN,
  GAUGE_TTL_SECONDS,
  HIST_DEPTH,
  REQ_TTL_SECONDS,
  userKey,
} from "./keys";

declare module "ioredis" {
  interface RedisCommander<Context> {
    place(...args: (string | number)[]): RedisResult<[status: string, ack?: string], Context>;
    moderate(
      ...args: (string | number)[]
    ): RedisResult<[status: string, version?: number, cells?: number, isDone?: number], Context>;
  }
}

const metaText = (fields: Record<string, string>, field: string): string => {
  const value = fields[field];
  if (value === undefined) throw new Error(`meta.${field} absent`);
  return value;
};

const metaNumber = (fields: Record<string, string>, field: string): number => {
  const value = Number(metaText(fields, field));
  if (!Number.isFinite(value)) throw new Error(`meta.${field} n'est pas un nombre`);
  return value;
};

// Une commande d'un MULTI : ioredis rend `[erreur, valeur]` par commande.
const unwrap = (entry: [Error | null, unknown] | undefined): unknown => {
  if (!entry) throw new Error("réponse MULTI incomplète");
  const [error, value] = entry;
  if (error) throw error;
  return value;
};

// Ce que le web écrit à la connexion (§2) : ni script ni connexion abonnée, il ne pose jamais un pixel.
export function createSignInWrites(redis: Redis): SignInWrites {
  return {
    // `NX` partout : idempotent, et `ready` n'est jamais remis à 1 sur un canvas en cours de restore.
    async createCanvas(canvasId: string, meta: CanvasMeta): Promise<void> {
      const keys = buildCanvasKeys(canvasId);
      const transaction = redis.multi();
      for (const [field, value] of Object.entries(meta)) transaction.hsetnx(keys.meta, field, value);
      await transaction
        .set(keys.state, Buffer.alloc(meta.width * meta.height), "NX")
        .set(keys.version, 0, "NX")
        .hsetnx(keys.meta, "ready", 1)
        .exec();
    },

    async setUser({ userId, login, displayName, avatarUrl }): Promise<void> {
      await redis.hset(userKey(userId), { login, displayName, ...(avatarUrl ? { avatarUrl } : {}) });
    },
  };
}

export function createCanvasCore(redis: Redis, liveSubscriber: Redis): CanvasCore {
  redis.defineCommand("place", {
    numberOfKeys: 7,
    lua: readFileSync(new URL("./place.lua", import.meta.url), "utf8"),
  });
  redis.defineCommand("moderate", {
    numberOfKeys: 10,
    lua: readFileSync(new URL("./moderate.lua", import.meta.url), "utf8"),
  });

  // Un seul rappel par canal, sur la seule connexion abonnée du process (§6.3).
  const listeners = new Map<string, (message: LiveMessage) => void>();
  liveSubscriber.on("message", (channel: string, raw: string) => {
    // Publié par nos scripts Lua ; la forme est couverte par les tests.
    const message: LiveMessage = JSON.parse(raw);
    listeners.get(channel)?.(message);
  });

  const isBanned = async (canvasId: string, userId: string): Promise<boolean> =>
    (await redis.sismember(buildCanvasKeys(canvasId).bans, userId)) === 1;

  return {
    ...createSignInWrites(redis),

    // `null` tant que `ready` n'est pas à 1 : on ne sert jamais un canvas en cours de restore (§5.5).
    async getCanvas(canvasId: string): Promise<CanvasMeta | null> {
      const fields = await redis.hgetall(buildCanvasKeys(canvasId).meta);
      if (fields.ready !== "1") return null;
      return {
        ownerId: metaText(fields, "ownerId"),
        width: metaNumber(fields, "width"),
        height: metaNumber(fields, "height"),
        gaugeMax: metaNumber(fields, "gaugeMax"),
        refillMs: metaNumber(fields, "refillMs"),
        refillCharges: metaNumber(fields, "refillCharges"),
        obsDelayMs: metaNumber(fields, "obsDelayMs"),
      };
    },

    async isModerator(canvasId: string, userId: string): Promise<boolean> {
      return (await redis.sismember(buildCanvasKeys(canvasId).mods, userId)) === 1;
    },

    // Un seul MULTI : entre deux commandes, une pose donnerait un état d'avant et une version d'après (§6.1).
    async getSnapshot(canvasId: string): Promise<Snapshot> {
      const keys = buildCanvasKeys(canvasId);
      const results = await redis.multi().getBuffer(keys.state).get(keys.version).exec();
      if (!results) throw new Error(`getSnapshot ${canvasId} : transaction annulée`);
      const state = unwrap(results[0]);
      const version = unwrap(results[1]);
      if (!Buffer.isBuffer(state) || typeof version !== "string")
        throw new Error(`getSnapshot ${canvasId} : état ou version illisible`);
      return { state, version: Number(version) };
    },

    // La formule de place.lua, sans jamais écrire : seul le script modifie une jauge.
    async getGauge(canvasId: string, userId: string, nowMs: Timestamp): Promise<AckFrame["gauge"]> {
      const keys = buildCanvasKeys(canvasId);
      const [fields, [charges, at]] = await Promise.all([
        redis.hgetall(keys.meta),
        redis.hmget(keys.gauge(userId), "charges", "at"),
      ]);
      const params = {
        gaugeMax: metaNumber(fields, "gaugeMax"),
        refillMs: metaNumber(fields, "refillMs"),
        refillCharges: metaNumber(fields, "refillCharges"),
      };
      const stored = charges && at ? { charges: Number(charges), at: Number(at) } : undefined;
      const gauge = refillGauge(stored, nowMs, params);
      return { charges: gauge.charges, max: params.gaugeMax, nextRefillAt: gauge.at + params.refillMs };
    },

    // L'ordre des arguments est celui que lit place.lua.
    async place(canvasId: string, placement: Placement): Promise<Result<AckFrame, "canvas_not_found">> {
      const { userId, requestId, nowMs, pixels } = placement;
      const keys = buildCanvasKeys(canvasId);
      const [status, ack] = await redis.place(
        keys.meta,
        keys.state,
        keys.version,
        keys.events,
        keys.bans,
        keys.gauge(userId),
        keys.req(userId, requestId),
        keys.histPrefix,
        keys.cellsPrefix,
        keys.live,
        userId,
        requestId,
        nowMs,
        PALETTE.length, // Écart §5.3 (JOURNAL 2026-09-15) : pas dans `meta`
        CELL_STRIDE,
        HIST_DEPTH,
        EVENTS_MAXLEN,
        GAUGE_TTL_SECONDS,
        REQ_TTL_SECONDS,
        ...pixels.flatMap(({ x, y, colorIndex }) => [x, y, colorIndex]),
      );
      if (status === "canvas_not_found") return { ok: false, error: "canvas_not_found" };
      const frame = decodeServerFrame(JSON.parse(ack ?? "null"));
      if (frame.ok && frame.value.t === "ack") return { ok: true, value: frame.value };
      throw new Error(`place.lua a renvoyé un ack invalide : ${ack}`);
    },

    // La tête de `hist:` est le pixel visible (§5.1). L'entrée se lit par la fin, comme dans place.lua.
    async inspect(canvasId: string, x: number, y: number): Promise<InspectEntry | null> {
      const head = await redis.lindex(buildCanvasKeys(canvasId).hist(toCellKey(x, y)), 0);
      if (head === null) return null;
      const [, userId, colorIndex, placedAt] = /^(.*):(\d+):(\d+):\d+$/.exec(head) ?? [];
      if (userId === undefined || colorIndex === undefined || placedAt === undefined)
        throw new Error(`inspect ${canvasId} : entrée d'historique illisible (${head})`);
      // Sans miroir, l'auteur garde au moins son identifiant : le miroir n'expire jamais, c'est un filet.
      const user = await redis.hgetall(userKey(userId));
      return {
        userId,
        login: user.login ?? userId,
        displayName: user.displayName ?? userId,
        ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
        colorIndex: Number(colorIndex),
        placedAt: Number(placedAt),
      };
    },

    // L'ordre des arguments est celui que lit moderate.lua.
    async moderate(
      canvasId: string,
      { by, nowMs, action: { action, target }, slice }: Moderation,
    ): Promise<Result<ModerationSlice, "canvas_not_found" | "forbidden">> {
      const keys = buildCanvasKeys(canvasId);
      const [status, version, cells, isDone] = await redis.moderate(
        keys.meta,
        keys.state,
        keys.version,
        keys.events,
        keys.bans,
        keys.mods,
        keys.cleared,
        keys.clearing(target),
        keys.cells(target),
        keys.ban(target),
        keys.histPrefix,
        keys.cellsPrefix,
        keys.live,
        by,
        action,
        target,
        slice,
        nowMs,
        CELL_STRIDE,
        CLEAR_SLICE_CELLS,
        EVENTS_MAXLEN,
      );
      if (status === "canvas_not_found" || status === "forbidden") return { ok: false, error: status };
      if (status !== "moderated" || version === undefined || cells === undefined)
        throw new Error(`moderate.lua a renvoyé une réponse invalide : ${status}`);
      return { ok: true, value: { version, cells, isDone: isDone === 1 } };
    },

    isBanned,

    // Un banni : sa preuve, figée au ban (§5.1). Sinon : les cases dont il est l'auteur visible, retrait interrompu compris.
    async listPixels(canvasId: string, userId: string): Promise<Pixel[]> {
      const keys = buildCanvasKeys(canvasId);
      if (await isBanned(canvasId, userId)) {
        const proof = await redis.hgetall(keys.ban(userId));
        return Object.entries(proof).map(([cellKey, colorIndex]) => ({
          ...toCell(Number(cellKey)),
          colorIndex: Number(colorIndex),
        }));
      }
      const results = await redis
        .multi()
        .sunion(keys.cells(userId), keys.clearing(userId))
        .getBuffer(keys.state)
        .hget(keys.meta, "width")
        .exec();
      if (!results) throw new Error(`listPixels ${canvasId} : transaction annulée`);
      const [cellKeys, state, width] = results.map(unwrap);
      if (!Array.isArray(cellKeys) || !Buffer.isBuffer(state) || typeof width !== "string")
        throw new Error(`listPixels ${canvasId} : cases, état ou largeur illisibles`);
      return cellKeys.map((cellKey) => {
        const cell = toCell(Number(cellKey));
        return { ...cell, colorIndex: state[toStateOffset(cell.x, cell.y, Number(width))] ?? 0 };
      });
    },

    // Triés par nom d'affichage. Sans miroir, l'identifiant sert de nom, comme pour `inspect`.
    async listBans(canvasId: string): Promise<BannedUser[]> {
      const keys = buildCanvasKeys(canvasId);
      const userIds = await redis.smembers(keys.bans);
      const users = await Promise.all(
        userIds.map(async (userId): Promise<BannedUser> => {
          const [user, pixelCount] = await Promise.all([
            redis.hgetall(userKey(userId)),
            redis.hlen(keys.ban(userId)),
          ]);
          return {
            userId,
            login: user.login ?? userId,
            displayName: user.displayName ?? userId,
            ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
            pixelCount,
          };
        }),
      );
      return users.sort((left, right) => left.displayName.localeCompare(right.displayName));
    },

    // Le comptage des abonnés appartient au gateway : premier client → abonnement, dernier → départ (§6.3).
    async subscribe(canvasId: string, onMessage: (message: LiveMessage) => void): Promise<Unsubscribe> {
      const channel = buildCanvasKeys(canvasId).live;
      listeners.set(channel, onMessage);
      await liveSubscriber.subscribe(channel);
      return async () => {
        if (listeners.get(channel) !== onMessage) return; // un abonnement plus récent a repris le canal
        listeners.delete(channel);
        await liveSubscriber.unsubscribe(channel);
      };
    },
  };
}
