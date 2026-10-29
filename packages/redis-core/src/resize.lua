-- Changer la taille d'un canvas (JOURNAL 2026-09-29), en rapprochant les dessins avant de couper (Écart §5.3, JOURNAL 2026-10-24).
-- Le plan vient de `planResize` (domain) ; ici il s'applique d'un coup, si la version lue pour le calculer n'a pas bougé.
-- Ordre des KEYS et ARGV : client.ts. `parseEntry` vient de pile.lua, `openMoves` de pile-moves.lua, `applyResizePlan` de resize-plan.lua.

local metaKey, stateKey, versionKey = KEYS[1], KEYS[2], KEYS[3]
local histPrefix, liveChannel, by = ARGV[1], ARGV[2], ARGV[3]
local width, height, cellStride = tonumber(ARGV[4]), tonumber(ARGV[5]), tonumber(ARGV[6])
local cellsPrefix, clearingPrefix = ARGV[7], ARGV[8]
local expectedVersion, planJson = tonumber(ARGV[9]), ARGV[10]

-- 0. Canvas prêt, et le streamer seul. Le gateway vérifie aussi. Écart §15 (JOURNAL 2026-10-06) : une archive ne reçoit plus rien.
local meta = redis.call("HMGET", metaKey, "ready", "ownerId", "width", "height", "archivedAt", "dynamicSize")
if meta[1] ~= "1" then
  return { "canvas_not_found" }
end
if meta[5] then
  return { "canvas_archived" }
end
-- Écart §5.3 (JOURNAL 2026-10-28) : une taille dynamique se règle seule, jamais par un format.
if by ~= meta[2] or meta[6] == "1" then
  return { "forbidden" }
end
local oldWidth, oldHeight = tonumber(meta[3]), tonumber(meta[4])
if width == oldWidth and height == oldHeight then
  return { "resized", tonumber(redis.call("GET", versionKey)) or 0 }
end

-- 1. Le plan a été calculé sur une version : une pose ou une modération depuis, et il est périmé. Le client relit.
if (tonumber(redis.call("GET", versionKey)) or 0) ~= expectedVersion then
  return { "stale" }
end
local version = applyResizePlan({
  metaKey = metaKey,
  stateKey = stateKey,
  versionKey = versionKey,
  liveChannel = liveChannel,
  histPrefix = histPrefix,
  cellsPrefix = cellsPrefix,
  clearingPrefix = clearingPrefix,
  cellStride = cellStride,
  width = oldWidth,
  height = oldHeight,
}, cjson.decode(planJson), width, height)
return { "resized", version }
