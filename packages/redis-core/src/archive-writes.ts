// Écart §15 (JOURNAL 2026-10-06) : ce que le web écrit dans Redis pour archiver, rouvrir et supprimer un canvas.
// Jamais un pixel ni un script (§2) : des clés qu'on copie, qu'on vide, qu'on marque. Le web n'en importe que du
// TypeScript, jamais un fichier `.lua` : rien ici ne les lit.

import { randomUUID } from "node:crypto";
import type { ArchiveWrites, CanvasImage, LiveMessage } from "@liveplace/domain/ports";
import type { Redis } from "ioredis";
import { getCanvasMeta } from "./client";
import { buildCanvasKeys, OWNER_LOCK_TTL_MS, ownerLockKey } from "./keys";

const SCAN_COUNT = 500;
const UNLINK_BATCH = 500;

// Rendre le verrou à qui le tient seulement : un verrou expiré, repris par un autre, ne se rend pas à sa place.
const RELEASE_LOCK = `if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) end return 0`;

// Le classement d'un canvas suit ses bannis, avec la règle de moderate.lua : un banni sort de `scoreboard` et son score
// attend dans `scoreboard:banned` ; un débanni revient avec le même. KEYS : `bans`, `scoreboard`, `scoreboard:banned`.
const FOLLOW_BANS = `
for _, userId in ipairs(redis.call("SMEMBERS", KEYS[1])) do
  local score = redis.call("ZSCORE", KEYS[2], userId)
  if score then
    redis.call("ZREM", KEYS[2], userId)
    redis.call("HSET", KEYS[3], userId, score)
  end
end
local held = redis.call("HGETALL", KEYS[3])
for index = 1, #held, 2 do
  if redis.call("SISMEMBER", KEYS[1], held[index]) == 0 then
    redis.call("ZADD", KEYS[2], held[index + 1], held[index])
    redis.call("HDEL", KEYS[3], held[index])
  end
end
return 1`;

// Les champs de `meta` qui sont ceux du streamer, pas d'un canvas : le délai et le fond de la vue OBS, la synchro Twitch.
const SHARED_META_FIELDS = ["obsDelayMs", "obsBackground", "twitchSync", "twitchSyncedAt"] as const;

// Un identifiant de canvas est un UUID : tout ce qui pourrait se lire comme un motif SCAN est refusé, pour qu'un
// identifiant vide ou `*` ne balaie jamais les canvas des autres.
const CANVAS_ID = /^[\w-]+$/;

const canvasKeysOf = (canvasId: string) => {
  if (!CANVAS_ID.test(canvasId)) throw new Error(`identifiant de canvas invalide : « ${canvasId} »`);
  return buildCanvasKeys(canvasId);
};

const scanKeys = async (redis: Redis, pattern: string): Promise<string[]> => {
  const found = new Set<string>();
  for await (const names of redis.scanStream({ match: pattern, count: SCAN_COUNT }))
    for (const name of names) found.add(name);
  return [...found];
};

const unlinkAll = async (redis: Redis, keys: readonly string[]): Promise<void> => {
  for (let first = 0; first < keys.length; first += UNLINK_BATCH)
    await redis.unlink(...keys.slice(first, first + UNLINK_BATCH));
};

export function createArchiveWrites(redis: Redis): ArchiveWrites {
  // Remplacer une clé : celle de l'entrant disparaît, puis reçoit celle du sortant si elle existe.
  const replaceKey = async (from: string, to: string): Promise<void> => {
    await redis.multi().del(to).copy(from, to).exec();
  };

  // Chaque clé `<famille>*` du sortant devient celle de l'entrant ; celles de l'entrant qui y ressemblaient partent.
  const replaceFamily = async (fromCanvasId: string, toCanvasId: string, family: string): Promise<void> => {
    const [fromPrefix, toPrefix] = [canvasKeysOf(fromCanvasId).prefix, canvasKeysOf(toCanvasId).prefix];
    await unlinkAll(redis, await scanKeys(redis, `${toPrefix}${family}*`));
    const copies = redis.pipeline();
    for (const key of await scanKeys(redis, `${fromPrefix}${family}*`))
      copies.copy(key, `${toPrefix}${key.slice(fromPrefix.length)}`);
    await copies.exec();
  };

  return {
    getCanvas: (canvasId) => getCanvasMeta(redis, canvasId),

    async acquireOwnerLock(ownerId) {
      const holderId = randomUUID();
      const taken = await redis.set(ownerLockKey(ownerId), holderId, "PX", OWNER_LOCK_TTL_MS, "NX");
      return taken === "OK" ? { ownerId, holderId } : null;
    },

    async releaseOwnerLock({ ownerId, holderId }) {
      await redis.eval(RELEASE_LOCK, 1, ownerLockKey(ownerId), holderId);
    },

    async prepareCanvas(canvasId, meta) {
      const keys = canvasKeysOf(canvasId);
      await redis
        .multi()
        .hset(keys.meta, meta)
        .set(keys.state, Buffer.alloc(meta.width * meta.height))
        .set(keys.version, 0)
        .exec();
    },

    async markReady(canvasId) {
      await redis.hset(canvasKeysOf(canvasId).meta, "ready", 1);
    },

    async markArchived(canvasId, { archivedAt, successorId }) {
      await redis.hset(canvasKeysOf(canvasId).meta, { archivedAt, successorId });
    },

    async markActive(canvasId) {
      await redis.hdel(canvasKeysOf(canvasId).meta, "archivedAt", "successorId");
    },

    async setSuccessor(canvasId, successorId) {
      const { meta } = canvasKeysOf(canvasId);
      if (successorId === null) await redis.hdel(meta, "successorId");
      else await redis.hset(meta, "successorId", successorId);
    },

    async copyShared(fromCanvasId, toCanvasId) {
      const [from, to] = [canvasKeysOf(fromCanvasId), canvasKeysOf(toCanvasId)];
      for (const key of ["bans", "bansTwitch", "mods", "modsTwitch", "modsLiveplace", "twitchUsers"] as const)
        await replaceKey(from[key], to[key]);
      await replaceFamily(fromCanvasId, toCanvasId, "ban:"); // la preuve de chaque banni
      // Écart §15 (JOURNAL 2026-10-06) : les bannis de l'entrant ont changé, son classement les suit. Un canvas neuf n'a
      // pas de classement : rien à faire. Le sortant et son classement ne bougent pas.
      await redis.eval(FOLLOW_BANS, 3, to.bans, to.scoreboard, to.scoreboardBanned);
      const values = await redis.hmget(from.meta, ...SHARED_META_FIELDS);
      const transaction = redis.multi();
      for (const [index, field] of SHARED_META_FIELDS.entries()) {
        const value = values[index];
        if (value === null || value === undefined) transaction.hdel(to.meta, field);
        else transaction.hset(to.meta, field, value);
      }
      await transaction.exec();
    },

    // Jamais `gauge:*` : une jauge absente est pleine, et celle de l'entrant reste la sienne.
    copyProgress: (fromCanvasId, toCanvasId) => replaceFamily(fromCanvasId, toCanvasId, "progress:"),

    async settleReports(canvasId) {
      const keys = canvasKeysOf(canvasId);
      const reports = await scanKeys(redis, `${keys.reportsPrefix}*`);
      await unlinkAll(redis, [keys.reported, keys.offStream, ...reports]);
    },

    async publishStatus(canvasId, status) {
      const control: LiveMessage = { ctl: { t: "canvasStatus", status } };
      await redis.publish(canvasKeysOf(canvasId).live, JSON.stringify(control));
    },

    async setTheme(canvasId, theme) {
      const { meta } = canvasKeysOf(canvasId);
      if (theme === undefined) await redis.hdel(meta, "theme");
      else await redis.hset(meta, "theme", theme);
    },

    async publishTheme(canvasId, theme) {
      const control: LiveMessage = { ctl: { t: "theme", ...(theme === undefined ? {} : { theme }) } };
      await redis.publish(canvasKeysOf(canvasId).live, JSON.stringify(control));
    },

    // L'image se pose par-dessus le fond, qui ne bouge pas, avec l'opacité qu'elle avait : ni l'un ni l'autre n'est touché.
    async setBackgroundImage(canvasId, at) {
      const keys = canvasKeysOf(canvasId);
      const control: LiveMessage = { ctl: { t: "backgroundImage", at } };
      await redis
        .multi()
        .hset(keys.meta, "backgroundImageAt", at)
        .publish(keys.live, JSON.stringify(control))
        .exec();
    },

    async clearBackgroundImage(canvasId) {
      const keys = canvasKeysOf(canvasId);
      const control: LiveMessage = { ctl: { t: "backgroundImage" } };
      await redis
        .multi()
        .hdel(keys.meta, "backgroundImageAt")
        .publish(keys.live, JSON.stringify(control))
        .exec();
    },

    async discardCanvas(canvasId) {
      await unlinkAll(redis, await scanKeys(redis, `${canvasKeysOf(canvasId).prefix}*`));
    },

    async getCanvasImage(canvasId): Promise<CanvasImage | null> {
      const keys = canvasKeysOf(canvasId);
      const [state, [width, height]] = await Promise.all([
        redis.getBuffer(keys.state),
        redis.hmget(keys.meta, "width", "height"),
      ]);
      if (!state || !width || !height) return null;
      return { width: Number(width), height: Number(height), state: Uint8Array.from(state) };
    },
  };
}
