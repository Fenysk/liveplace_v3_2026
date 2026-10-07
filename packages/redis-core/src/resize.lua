-- Changer la taille d'un canvas (JOURNAL 2026-09-29) : `state` refait d'un coup, les piles intactes. Ordre des KEYS et
-- ARGV : client.ts. `parseEntry` vient de pile.lua.

local metaKey, stateKey, versionKey = KEYS[1], KEYS[2], KEYS[3]
local histPrefix, liveChannel, by = ARGV[1], ARGV[2], ARGV[3]
local width, height, cellStride = tonumber(ARGV[4]), tonumber(ARGV[5]), tonumber(ARGV[6])

-- 0. Canvas prêt, et le streamer seul. Le gateway vérifie aussi. Écart §15 (JOURNAL 2026-10-06) : une archive ne reçoit plus rien.
local meta = redis.call("HMGET", metaKey, "ready", "ownerId", "width", "height", "archivedAt")
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
if width == oldWidth and height == oldHeight then
  return { "resized", tonumber(redis.call("GET", versionKey)) or 0 }
end

-- Une case hors de l'ancien cadre : la tête de sa pile, gardée pendant qu'elle était cachée.
local function headColor(x, y)
  local raw = redis.call("LINDEX", histPrefix .. (y * cellStride + x), 0)
  return raw and parseEntry(raw).colorIndex or 0
end

-- 1. Le nouveau `state`, ligne par ligne : l'ancien là où il reste dans le cadre, les piles ailleurs.
local oldState = redis.call("GET", stateKey) or ""
local rows = {}
for y = 0, height - 1 do
  local row = {}
  local kept = 0
  if y < oldHeight then
    kept = math.min(width, oldWidth)
    row[1] = string.sub(oldState, y * oldWidth + 1, y * oldWidth + kept)
  end
  for x = kept, width - 1 do
    row[#row + 1] = string.char(headColor(x, y))
  end
  rows[#rows + 1] = table.concat(row)
end
redis.call("SET", stateKey, table.concat(rows))

-- 2. Une version sans événement : le trou force un snapshot à toute reprise d'avant la nouvelle taille.
local version = redis.call("INCR", versionKey)
redis.call("HSET", metaKey, "width", width, "height", height, "resizedAtVersion", version)
redis.call("PUBLISH", liveChannel, cjson.encode({ ctl = { t = "resize" } }))
return { "resized", version }
