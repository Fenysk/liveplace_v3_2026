// Client typé du noyau Redis (§5.6).

import { readFileSync } from "node:fs";
import { CELL_STRIDE, type GaugeParams, PALETTE, type Timestamp } from "@liveplace/domain";
import { type ClientFrame, decodeServerFrame, type ServerFrame } from "@liveplace/protocol";
import type { Result } from "@liveplace/shared";
import type { Redis, Result as RedisResult } from "ioredis";
import { canvasKeys, EVENTS_MAXLEN, GAUGE_TTL_SECONDS, HIST_DEPTH, REQ_TTL_SECONDS } from "./keys";

declare module "ioredis" {
  interface RedisCommander<Context> {
    place(...args: (string | number)[]): RedisResult<[status: string, ack?: string], Context>;
  }
}

export type CanvasMeta = GaugeParams & { ownerId: string; width: number; height: number; obsDelayMs: number };

export type Placement = {
  userId: string;
  requestId: string;
  nowMs: Timestamp;
  pixels: Extract<ClientFrame, { t: "place" }>["pixels"];
};

export type AckFrame = Extract<ServerFrame, { t: "ack" }>;

export function createCanvasCore(redis: Redis) {
  redis.defineCommand("place", {
    numberOfKeys: 7,
    lua: readFileSync(new URL("./place.lua", import.meta.url), "utf8"),
  });

  return {
    // `NX` partout : idempotent, et `ready` n'est jamais remis à 1 sur un canvas en cours de restore.
    async createCanvas(canvasId: string, meta: CanvasMeta): Promise<void> {
      const keys = canvasKeys(canvasId);
      const transaction = redis.multi();
      for (const [field, value] of Object.entries(meta)) transaction.hsetnx(keys.meta, field, value);
      await transaction
        .set(keys.state, Buffer.alloc(meta.width * meta.height), "NX")
        .set(keys.version, 0, "NX")
        .hsetnx(keys.meta, "ready", 1)
        .exec();
    },

    // L'ordre des arguments est celui que lit place.lua.
    async place(canvasId: string, placement: Placement): Promise<Result<AckFrame, "canvas_not_found">> {
      const { userId, requestId, nowMs, pixels } = placement;
      const keys = canvasKeys(canvasId);
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
  };
}
