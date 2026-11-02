// CDC §8, Supprimer son compte : ce que Redis efface d'un compte et de tout ce qui le nomme (JOURNAL 2026-11-01). Jamais un
// pixel du jeu (§2) : des clés qu'on parcourt, qu'on réécrit, qu'on vide. Les scripts Lua sont ici, en texte : le web, qui
// lance la suppression, n'importe jamais un fichier `.lua`. Chaque étape est idempotente, c'est ainsi qu'un effacement
// interrompu reprend : on relance le même parcours.

import { DELETED_ACCOUNT_TTL_SECONDS, DELETED_AUTHOR } from "@liveplace/domain";
import type { AccountPurge, PendingDeletion } from "@liveplace/domain/ports";
import type { Redis } from "ioredis";
import { createArchiveWrites, scanKeys, unlinkAll } from "./archive-writes";
import { toDeletedAccountFingerprint, toDeletedAccountKey } from "./deleted-accounts";
import {
  ACTIVITY_GONE_TTL_SECONDS,
  buildActivityKeys,
  buildCanvasKeys,
  DELETED_ACCOUNTS_CHANNEL,
  DELETED_MARKS_SYNCED_KEY,
  deletedAccountKey,
  ownerLockKey,
  PENDING_DELETIONS_KEY,
  REWRITE_AOF_KEY,
  TWITCH_COMMANDS_KEY,
  twitchLiveKey,
  userKey,
  WITHOUT_DISCOVERED_VIA,
} from "./keys";

const HIST_SCAN_COUNT = 2000; // des clés `hist:` examinées par appel du script : Redis reprend la main entre deux
const STREAM_SLICE = 500; // des entrées d'un flux recopiées par appel du script
const CANVAS_OF_META = /^cv:(.+):meta$/;
const REQ_OR_REPORTS = /^(cv:[^:]+:)(req|reports):(.+)$/;
const ACCOUNT_ID = /^[\w-]+$/;

// Un identifiant d'un autre genre que celui d'un compte ne doit jamais entrer dans un motif ni dans un script.
const assertAccountId = (userId: string): void => {
  if (!ACCOUNT_ID.test(userId) || userId === DELETED_AUTHOR)
    throw new Error(`identifiant de compte invalide : « ${userId} »`);
};

// Marque l'effacement et l'empreinte de la session d'un seul bloc : l'un sans l'autre laisserait un compte sans refus.
// KEYS : l'effacement en cours, l'empreinte ; ARGV : le compte, l'effacement, l'instant, la durée de l'empreinte.
const BEGIN = `if redis.call("HSETNX", KEYS[1], ARGV[1], ARGV[2]) == 1 then
  redis.call("SET", KEYS[2], ARGV[3], "EX", ARGV[4])
end
return 1`;

// Les piles `hist:` (§5.1) de toutes les fresques que le web a nommées : un SCAN par page, le curseur rendu à l'appelant.
// Une entrée du compte devient celle de `deleted` ; celle qu'une pierre tombale couvre part, sauf en tête de pile (le
// pixel visible ne change pas). ARGV : le curseur, le compte, l'auteur qui le remplace, la taille d'une page, et en JSON
// les pierres tombales du compte par préfixe de fresque (`{version?, ranges, placements}`). Le motif d'une entrée est
// celui de pile.lua.
const PURGE_PILES = `local cursor, userId, sentinel, count = ARGV[1], ARGV[2], ARGV[3], tonumber(ARGV[4])
local tombstones = cjson.decode(ARGV[5])

local function parseEntry(entry)
  local author, _, placedAt, version, placementId = string.match(entry, "^(.*):(%d+):(%d+):(%d+):(%a%w*)$")
  if not author then
    author, _, placedAt, version = string.match(entry, "^(.*):(%d+):(%d+):(%d+)$")
    placementId = version
  end
  return author, tonumber(placedAt), tonumber(version), placementId
end

local function isCovered(tombstone, placedAt, version, placementId)
  if tombstone.version and version <= tombstone.version then
    return true
  end
  if tombstone.placements[placementId] then
    return true
  end
  for _, range in ipairs(tombstone.ranges) do
    if placedAt >= range[1] and placedAt <= range[2] then
      return true
    end
  end
  return false
end

local reply = redis.call("SCAN", cursor, "MATCH", "cv:*:hist:*", "COUNT", count)
local rewritten = 0
for _, key in ipairs(reply[2]) do
  local prefix = string.match(key, "^(cv:.*:)hist:%d+$")
  local tombstone = prefix and tombstones[prefix]
  if tombstone then
    local kept, isChanged = {}, false
    for position, entry in ipairs(redis.call("LRANGE", key, 0, -1)) do
      local author, placedAt, version, placementId = parseEntry(entry)
      if author ~= userId then
        kept[#kept + 1] = entry
      elseif position > 1 and isCovered(tombstone, placedAt, version, placementId) then
        isChanged = true
      else
        kept[#kept + 1] = sentinel .. string.sub(entry, #userId + 1)
        isChanged = true
        if position == 1 then
          redis.call("SADD", prefix .. "cells:" .. sentinel, string.match(key, "(%d+)$"))
        end
      end
    end
    if isChanged then
      redis.call("DEL", key)
      redis.call("RPUSH", key, unpack(kept))
      rewritten = rewritten + 1
    end
  end
end
return { reply[1], rewritten }`;

// Tout le reste d'une fresque qui nomme le compte, d'un seul bloc : classement, bannis, modérateurs, pierres tombales,
// jauge, progression, noms Twitch, et les signalements (JOURNAL 2026-11-01). Rend le nombre de choses retirées ou
// renommées. ARGV : le préfixe de la fresque, le compte, l'auteur qui le remplace, puis les clés `reports:` de la fresque.
const PURGE_CANVAS = `local prefix, userId, sentinel = ARGV[1], ARGV[2], ARGV[3]
local userPrefix, sentinelPrefix = userId .. ":", sentinel .. ":"
local reportsPrefix = prefix .. "reports:"
local changed = 0

-- Ses poses que cleared:placements couvre : elles partent, avec leurs signalements.
local clearedPlacements = {}
for _, member in ipairs(redis.call("SMEMBERS", prefix .. "cleared:placements")) do
  if string.sub(member, 1, #userPrefix) == userPrefix then
    clearedPlacements[member] = true
    changed = changed + redis.call("SREM", prefix .. "cleared:placements", member)
  end
end

-- Le nom d'une de ses poses une fois renommée ; nil : elle part.
local function movePlacement(placement)
  if string.sub(placement, 1, #userPrefix) ~= userPrefix then
    return placement
  end
  if clearedPlacements[placement] then
    return nil
  end
  return sentinelPrefix .. string.sub(placement, #userPrefix + 1)
end

for _, name in ipairs({ "offstream", "approved" }) do
  for _, member in ipairs(redis.call("SMEMBERS", prefix .. name)) do
    local moved = movePlacement(member)
    if moved ~= member then
      redis.call("SREM", prefix .. name, member)
      if moved then
        redis.call("SADD", prefix .. name, moved)
      end
      changed = changed + 1
    end
  end
end

local reported = redis.call("ZRANGE", prefix .. "reported", 0, -1, "WITHSCORES")
for index = 1, #reported, 2 do
  local moved = movePlacement(reported[index])
  if moved ~= reported[index] then
    redis.call("ZREM", prefix .. "reported", reported[index])
    if moved then
      redis.call("ZADD", prefix .. "reported", "NX", reported[index + 1], moved)
    end
    changed = changed + 1
  end
end

-- Chaque ensemble de signaleurs : il en sort, et s'il portait sa pose, il prend le nom de l'auteur supprimé. Une pose
-- cachée du stream dont plus personne ne répond garde un signaleur anonyme, une autre n'est plus signalée.
for index = 4, #ARGV do
  local reportsKey = ARGV[index]
  local placement = string.sub(reportsKey, #reportsPrefix + 1)
  local wasReporter = redis.call("SREM", reportsKey, userId) == 1
  local moved = movePlacement(placement)
  local currentKey = reportsKey
  if moved ~= placement then
    if moved then
      currentKey = reportsPrefix .. moved
      redis.call("SUNIONSTORE", currentKey, currentKey, reportsKey)
    end
    redis.call("DEL", reportsKey)
    changed = changed + 1
  end
  if wasReporter then
    changed = changed + 1
    if moved and redis.call("EXISTS", currentKey) == 0 then
      if redis.call("SISMEMBER", prefix .. "offstream", moved) == 1 then
        redis.call("SADD", currentKey, sentinel)
      else
        redis.call("ZREM", prefix .. "reported", moved)
      end
    end
  end
end

for _, name in ipairs({ "cells:", "clearing:", "gauge:", "progress:", "ban:", "cleared:recent:" }) do
  changed = changed + redis.call("DEL", prefix .. name .. userId)
end
for _, name in ipairs({ "bans", "bans:twitch", "mods", "mods:twitch", "mods:liveplace" }) do
  changed = changed + redis.call("SREM", prefix .. name, userId)
end
for _, name in ipairs({ "cleared", "cleared:ranges", "scoreboard:banned", "twitch:users" }) do
  changed = changed + redis.call("HDEL", prefix .. name, userId)
end
changed = changed + redis.call("ZREM", prefix .. "scoreboard", userId)

-- Les pages de la fresque rafraîchissent leur classement et les listes de qui modère, et le nombre de signalements.
if changed > 0 then
  redis.call("PUBLISH", prefix .. "live", cjson.encode({ ctl = { t = "tracesPurged" } }))
  local count = redis.call("ZCARD", prefix .. "reported")
  redis.call("PUBLISH", prefix .. "live", cjson.encode({ ctl = { t = "reports", count = count } }))
end
return changed`;

// Le flux d'une fresque nomme-t-il le compte ? Une lecture par tranches, sans rien écrire. KEYS : le flux ; ARGV : la valeur
// entre guillemets, telle que l'événement la porte, et la taille d'une tranche.
const EVENTS_HAS = `local from = "-"
local slice = tonumber(ARGV[2])
while true do
  local entries = redis.call("XRANGE", KEYS[1], from, "+", "COUNT", slice)
  for _, entry in ipairs(entries) do
    for index = 2, #entry[2], 2 do
      if string.find(entry[2][index], ARGV[1], 1, true) then
        return 1
      end
    end
  end
  if #entries < slice then
    return 0
  end
  from = "(" .. entries[#entries][1]
end`;

// La suite des deux scripts qui recopient un flux : chaque valeur y perd le compte, au profit de l'auteur supprimé.
const COPY_REPLACING = `local function replacePlain(text, needle, replacement)
  local parts, from = {}, 1
  while true do
    local start, stop = string.find(text, needle, from, true)
    if not start then
      break
    end
    parts[#parts + 1] = string.sub(text, from, start - 1)
    parts[#parts + 1] = replacement
    from = stop + 1
  end
  parts[#parts + 1] = string.sub(text, from)
  return table.concat(parts)
end

local function copyEntries(entries, target, needle, replacement)
  for _, entry in ipairs(entries) do
    local fields = entry[2]
    for index = 2, #fields, 2 do
      fields[index] = replacePlain(fields[index], needle, replacement)
    end
    redis.call("XADD", target, entry[1], unpack(fields))
  end
end`;

// Une tranche du flux, recopiée dans la clé de travail sous leurs identifiants, qui sont les versions. KEYS : le flux, la
// clé de travail ; ARGV : où reprendre (exclu), la taille, la valeur nommée et son remplacement. Rend le nombre recopié
// et le dernier identifiant.
const EVENTS_COPY = `${COPY_REPLACING}
local entries = redis.call("XRANGE", KEYS[1], ARGV[1], "+", "COUNT", ARGV[2])
copyEntries(entries, KEYS[2], ARGV[3], ARGV[4])
return { #entries, #entries > 0 and entries[#entries][1] or "" }`;

// La fin : ce que les poses ont ajouté depuis la dernière tranche, puis la clé de travail prend la place du flux d'un seul
// RENAME. KEYS et ARGV comme EVENTS_COPY, sans la taille.
const EVENTS_SWAP = `${COPY_REPLACING}
if redis.call("EXISTS", KEYS[1]) == 0 then
  redis.call("DEL", KEYS[2])
  return 0
end
local entries = redis.call("XRANGE", KEYS[1], ARGV[1], "+")
copyEntries(entries, KEYS[2], ARGV[2], ARGV[3])
if redis.call("EXISTS", KEYS[2]) == 1 then
  redis.call("RENAME", KEYS[2], KEYS[1])
end
return #entries`;

// PURGE_PILES rend le curseur suivant puis le nombre de piles réécrites.
const toPage = (reply: unknown): [cursor: string, rewritten: number] => {
  const [cursor, rewritten] = Array.isArray(reply) ? reply : [];
  if (typeof cursor !== "string" || typeof rewritten !== "number")
    throw new Error("réponse Redis : un curseur et un nombre étaient attendus");
  return [cursor, rewritten];
};

// EVENTS_COPY rend le nombre d'entrées recopiées puis le dernier identifiant.
const toCopied = (reply: unknown): [count: number, last: string] => {
  const [count, last] = Array.isArray(reply) ? reply : [];
  if (typeof count !== "number" || typeof last !== "string")
    throw new Error("réponse Redis : un nombre et un identifiant étaient attendus");
  return [count, last];
};

const toCount = (reply: unknown): number => {
  if (typeof reply !== "number") throw new Error("réponse Redis : un nombre était attendu");
  return reply;
};

const listCanvasIds = async (redis: Redis): Promise<string[]> =>
  (await scanKeys(redis, buildCanvasKeys("*").meta)).flatMap((name) => {
    const canvasId = CANVAS_OF_META.exec(name)?.[1];
    return canvasId === undefined ? [] : [canvasId];
  });

// Où le compte a-t-il posé ? `progress:` n'a pas d'EXPIRE et naît avec la première pose acceptée ; sa jauge, ses cases et
// sa retombée en cours disent la même chose. Une pile ne peut pas le nommer sans l'un de ces quatre marqueurs.
const listPlayedCanvasIds = async (
  redis: Redis,
  canvasIds: readonly string[],
  userId: string,
): Promise<string[]> => {
  const pipeline = redis.pipeline();
  for (const canvasId of canvasIds) {
    const keys = buildCanvasKeys(canvasId);
    pipeline
      .exists(keys.progress(userId))
      .exists(keys.cells(userId))
      .exists(keys.clearing(userId))
      .exists(keys.gauge(userId));
  }
  const replies = canvasIds.length > 0 ? ((await pipeline.exec()) ?? []) : [];
  return canvasIds.filter((_, index) =>
    replies.slice(index * 4, index * 4 + 4).some(([error, found]) => {
      if (error) throw error;
      return found === 1;
    }),
  );
};

// Les pierres tombales du compte sur une fresque, lues avant d'être effacées : de quoi reconnaître une entrée de pile couverte.
const getTombstones = async (redis: Redis, canvasId: string, userId: string) => {
  const keys = buildCanvasKeys(canvasId);
  const [version, ranges, placements] = await Promise.all([
    redis.hget(keys.cleared, userId),
    redis.hget(keys.clearedRanges, userId),
    redis.smembers(keys.clearedPlacements),
  ]);
  const userPrefix = `${userId}:`;
  return {
    ...(version === null ? {} : { version: Number(version) }),
    ranges: ranges === null ? [] : JSON.parse(ranges),
    // Les poses du compte par leur seul identifiant : c'est ce qu'une entrée de pile porte.
    placements: Object.fromEntries(
      placements
        .filter((member) => member.startsWith(userPrefix))
        .map((member) => [member.slice(userPrefix.length), true]),
    ),
  };
};

// Un seul balayage de toutes les piles du serveur, pour les fresques où le compte a posé : un SCAN coûte autant d'une
// fresque que de dix.
const purgePiles = async (redis: Redis, canvasIds: readonly string[], userId: string): Promise<void> => {
  const played = await listPlayedCanvasIds(redis, canvasIds, userId);
  if (played.length === 0) return;
  const tombstones = Object.fromEntries(
    await Promise.all(
      played.map(async (canvasId) => [
        buildCanvasKeys(canvasId).prefix,
        await getTombstones(redis, canvasId, userId),
      ]),
    ),
  );
  const argument = JSON.stringify(tombstones);
  let cursor = "0";
  do {
    [cursor] = toPage(
      await redis.eval(PURGE_PILES, 0, cursor, userId, DELETED_AUTHOR, HIST_SCAN_COUNT, argument),
    );
  } while (cursor !== "0");
};

// Les clés de signalements de toutes les fresques, par préfixe ; les accusés de pose du compte (`req:`) partent ici.
const listReportKeys = async (redis: Redis, userId: string): Promise<Map<string, string[]>> => {
  const reports = new Map<string, string[]>();
  const requests: string[] = [];
  for (const name of await scanKeys(redis, "cv:*:re[qp]*")) {
    const [, prefix, kind, rest] = REQ_OR_REPORTS.exec(name) ?? [];
    if (prefix === undefined || rest === undefined) continue;
    if (kind === "req" && rest.startsWith(`${userId}:`)) requests.push(name);
    if (kind === "reports") reports.set(prefix, [...(reports.get(prefix) ?? []), name]);
  }
  await unlinkAll(redis, requests);
  return reports;
};

// Le flux d'une fresque qui nomme le compte est recopié ailleurs puis remplacé d'un coup : un flux ne se réécrit pas
// en place, et en retirer des entrées ferait des trous (JOURNAL 2026-11-01).
const purgeEvents = async (redis: Redis, canvasId: string, userId: string): Promise<boolean> => {
  const { events } = buildCanvasKeys(canvasId);
  const needle = JSON.stringify(userId);
  if (toCount(await redis.eval(EVENTS_HAS, 1, events, needle, STREAM_SLICE)) !== 1) return false;
  const rewrite = `${events}:rewrite`;
  const replacement = JSON.stringify(DELETED_AUTHOR);
  await redis.del(rewrite);
  let from = "-";
  for (;;) {
    const [count, last] = toCopied(
      await redis.eval(EVENTS_COPY, 2, events, rewrite, from, STREAM_SLICE, needle, replacement),
    );
    if (count === 0) break;
    from = `(${last}`;
    if (count < STREAM_SLICE) break;
  }
  await redis.eval(EVENTS_SWAP, 2, events, rewrite, from, needle, replacement);
  return true;
};

// Ses actions Twitch en attente : une action acquittée reste dans la file, `XACK` ne l'efface pas.
const purgeTwitchCommands = async (redis: Redis, userId: string): Promise<void> => {
  const needle = JSON.stringify(userId);
  let from = "-";
  for (;;) {
    const entries = await redis.xrange(TWITCH_COMMANDS_KEY, from, "+", "COUNT", STREAM_SLICE);
    const named = entries
      .filter(([, fields]) => fields.some((field) => field.includes(needle)))
      .map(([id]) => id);
    if (named.length > 0) await redis.xdel(TWITCH_COMMANDS_KEY, ...named);
    const last = entries.at(-1)?.[0];
    if (last === undefined || entries.length < STREAM_SLICE) return;
    from = `(${last}`;
  }
};

// Les nouveaux comptes d'un jour comptent le streamer d'origine par son identifiant : ils passent à « sans origine ».
const moveSignupOrigin = async (redis: Redis, userId: string): Promise<void> => {
  for (const key of await scanKeys(redis, buildActivityKeys().signups("*"))) {
    const count = await redis.hget(key, userId);
    if (count === null) continue;
    await redis.multi().hincrby(key, WITHOUT_DISCOVERED_VIA, Number(count)).hdel(key, userId).exec();
  }
};

// Ses statistiques par fresque : les compteurs d'un jour n'expirent jamais.
const purgeCanvasActivity = async (redis: Redis, canvasIds: readonly string[]): Promise<void> => {
  if (canvasIds.length === 0) return;
  const { canvasPrefix, seen, gone } = buildActivityKeys();
  const owned = new Set(canvasIds);
  // D'abord inscrites : une minute que le gateway écrit pendant le balayage passe déjà son chemin (JOURNAL 2026-11-02).
  await redis
    .multi()
    .sadd(gone, ...canvasIds)
    .expire(gone, ACTIVITY_GONE_TTL_SECONDS)
    .exec();
  const names = (await scanKeys(redis, `${canvasPrefix}*`)).filter((name) =>
    owned.has(name.slice(canvasPrefix.length).split(":")[0] ?? ""),
  );
  await unlinkAll(redis, names);
  await redis.hdel(seen, ...canvasIds);
};

const isRewriteRunning = (error: unknown): boolean =>
  error instanceof Error && /already in progress/i.test(error.message);

// `secret` : celui des sessions. L'empreinte qui en découle est la seule trace du compte qui survive à l'effacement.
export function createAccountPurge(redis: Redis, secret: string): AccountPurge {
  const archive = createArchiveWrites(redis);

  const getPending = async (userId: string): Promise<PendingDeletion | null> => {
    const raw = await redis.hget(PENDING_DELETIONS_KEY, userId);
    // Écrit par `begin` ; la forme est couverte par les tests.
    return raw === null ? null : { userId, ...JSON.parse(raw) };
  };

  return {
    getPending,

    async listPending() {
      const stored = await redis.hgetall(PENDING_DELETIONS_KEY);
      return Object.entries(stored).map(([userId, raw]) => ({ userId, ...JSON.parse(raw) }));
    },

    async begin({ userId, ...deletion }) {
      assertAccountId(userId);
      await redis.eval(
        BEGIN,
        2,
        PENDING_DELETIONS_KEY,
        toDeletedAccountKey(secret, userId),
        userId,
        JSON.stringify(deletion),
        deletion.startedAt,
        DELETED_ACCOUNT_TTL_SECONDS,
      );
      await redis.publish(DELETED_ACCOUNTS_CHANNEL, userId);
    },

    // Les pages ouvertes l'apprennent avant que les clés partent (comme pour une archive supprimée).
    async purgeOwnedCanvases(ownerId, canvasIds) {
      assertAccountId(ownerId);
      for (const canvasId of canvasIds) {
        await archive.publishStatus(canvasId, "discarded");
        await archive.discardCanvas(canvasId);
      }
      await purgeCanvasActivity(redis, canvasIds);
      await redis.unlink(ownerLockKey(ownerId));
    },

    async purgeTraces(userId) {
      assertAccountId(userId);
      const canvasIds = await listCanvasIds(redis);
      // Les piles d'abord : leurs pierres tombales sont lues avant d'être effacées avec le reste.
      await purgePiles(redis, canvasIds, userId);
      const reportKeys = await listReportKeys(redis, userId);
      let touched = 0;
      for (const canvasId of canvasIds) {
        const { prefix } = buildCanvasKeys(canvasId);
        const changed = toCount(
          await redis.eval(
            PURGE_CANVAS,
            0,
            prefix,
            userId,
            DELETED_AUTHOR,
            ...(reportKeys.get(prefix) ?? []),
          ),
        );
        const isEventsRewritten = await purgeEvents(redis, canvasId, userId);
        if (changed > 0 || isEventsRewritten) touched += 1;
      }
      return touched;
    },

    async purgeAccountKeys(userId) {
      assertAccountId(userId);
      await redis.unlink(userKey(userId), twitchLiveKey(userId));
      await purgeTwitchCommands(redis, userId);
      await moveSignupOrigin(redis, userId);
    },

    // Plus rien ne nomme le compte. Le marqueur dit qu'une réécriture de l'AOF reste à faire : un arrêt ici la reprendrait au démarrage.
    async finish(userId) {
      await redis.multi().hdel(PENDING_DELETIONS_KEY, userId).set(REWRITE_AOF_KEY, 1).exec();
      await redis.publish(DELETED_ACCOUNTS_CHANNEL, userId);
    },

    getFingerprint: (userId) => toDeletedAccountFingerprint(secret, userId),

    areMarksRestored: async () => (await redis.exists(DELETED_MARKS_SYNCED_KEY)) === 1,

    // `NX` : une empreinte posée depuis la perte (une suppression récente) garde son heure. Une empreinte plus vieille que la vie
    // d'un jeton ne refuserait plus rien, elle n'est pas remise.
    async restoreMarks(marks, nowMs) {
      const transaction = redis.multi();
      for (const { fingerprint, deletedAt } of marks) {
        const remaining = DELETED_ACCOUNT_TTL_SECONDS - Math.floor((nowMs - deletedAt) / 1000);
        if (remaining > 0) transaction.set(deletedAccountKey(fingerprint), deletedAt, "EX", remaining, "NX");
      }
      transaction.set(DELETED_MARKS_SYNCED_KEY, nowMs);
      await transaction.exec();
    },

    async rewriteAppendOnlyFile() {
      if ((await redis.exists(REWRITE_AOF_KEY)) === 0) return true;
      try {
        await redis.bgrewriteaof();
      } catch (error) {
        // Une réécriture déjà en cours a commencé avant nos dernières écritures : le marqueur reste pour la suivante.
        if (isRewriteRunning(error)) return false;
        throw error;
      }
      await redis.del(REWRITE_AOF_KEY);
      return true;
    },
  };
}
