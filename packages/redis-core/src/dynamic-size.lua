-- Activer ou retirer la taille dynamique d'un canvas (Écart §5.3, JOURNAL 2026-10-28 et 2026-10-29). Ordre des KEYS et ARGV :
-- client.ts. `reframe` vient de reframe.lua, `applyResizePlan` de resize-plan.lua. Activée, la fresque se resserre sur ses dessins
-- (`reframe`). Retirée, elle revient à la taille fixe par défaut par le plan de taille d'un format, comme un choix manuel : le réglage
-- et la taille changent d'un seul script, aucune pose ne grandit la fresque entre les deux. Dans les deux cas, le plan a été
-- calculé sur une version, et ne s'applique que si elle n'a pas bougé.

local metaKey, stateKey, versionKey = KEYS[1], KEYS[2], KEYS[3]
local bansKey, clearedKey, clearedPlacementsKey, clearedRangesKey = KEYS[4], KEYS[5], KEYS[6], KEYS[7]
local histPrefix, cellsPrefix, clearingPrefix, banPrefix, recentlyClearedPrefix, liveChannel =
  ARGV[1], ARGV[2], ARGV[3], ARGV[4], ARGV[5], ARGV[6]
local cellStride, by, isDynamic = tonumber(ARGV[7]), ARGV[8], ARGV[9] == "1"
local expectedVersion, dx, dy, width, height =
  tonumber(ARGV[10]), tonumber(ARGV[11]), tonumber(ARGV[12]), tonumber(ARGV[13]), tonumber(ARGV[14])
local resizePlanJson = ARGV[15]

-- 0. Canvas prêt, et le streamer seul. Le gateway vérifie aussi. Une archive ne reçoit plus rien (Écart §15, JOURNAL 2026-10-06).
local meta = redis.call("HMGET", metaKey, "ready", "ownerId", "width", "height", "archivedAt", "dynamicSize", "originX", "originY")
if meta[1] ~= "1" then
  return { "canvas_not_found" }
end
if meta[5] then
  return { "canvas_archived" }
end
if by ~= meta[2] then
  return { "forbidden" }
end
local oldWidth, oldHeight = tonumber(meta[3]), tonumber(meta[4])
local env = {
  metaKey = metaKey,
  stateKey = stateKey,
  versionKey = versionKey,
  liveChannel = liveChannel,
  histPrefix = histPrefix,
  cellsPrefix = cellsPrefix,
  clearingPrefix = clearingPrefix,
  banPrefix = banPrefix,
  recentlyClearedPrefix = recentlyClearedPrefix,
  bansKey = bansKey,
  clearedKey = clearedKey,
  clearedPlacementsKey = clearedPlacementsKey,
  clearedRangesKey = clearedRangesKey,
  cellStride = cellStride,
  width = oldWidth,
  height = oldHeight,
  originX = tonumber(meta[7]) or 0,
  originY = tonumber(meta[8]) or 0,
}

-- 1. Déjà dans l'état demandé : rien à faire.
if (meta[6] == "1") == isDynamic then
  return { "set", tonumber(redis.call("GET", versionKey)) or 0 }
end

-- 2. Le plan a été calculé sur une version : une pose ou une modération depuis, et il est périmé. Le client relit.
if (tonumber(redis.call("GET", versionKey)) or 0) ~= expectedVersion then
  return { "stale" }
end
if not (dx and dy and width and height) then
  return redis.error_reply("dynamic-size : pas de plan")
end

-- 3. Le retrait : le réglage part, puis la fresque revient à la taille fixe par défaut par le plan d'un format (`width`, `height`). Déjà
-- à cette taille, seul le réglage change ; les pages en reprennent un `welcome`, qui le porte.
if not isDynamic then
  redis.call("HDEL", metaKey, "dynamicSize")
  if width == oldWidth and height == oldHeight then
    redis.call("PUBLISH", liveChannel, cjson.encode({ ctl = { t = "resize" } }))
    return { "set", expectedVersion }
  end
  return { "set", applyResizePlan(env, cjson.decode(resizePlanJson), width, height) }
end

-- 4. L'activation : le réglage vient avant le resserrement, que les pages lisent ensuite dans leur `welcome`.
redis.call("HSET", metaKey, "dynamicSize", 1)
if dx == 0 and dy == 0 and width == oldWidth and height == oldHeight then
  redis.call("PUBLISH", liveChannel, cjson.encode({ ctl = { t = "resize" } }))
  return { "set", expectedVersion }
end
return { "set", reframe(env, dx, dy, width, height) }
