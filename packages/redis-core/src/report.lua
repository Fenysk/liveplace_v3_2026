-- Signalement d'une pose (JOURNAL 2026-09-28). Ordre des KEYS et ARGV : client.ts. `openPile` et `parseEntry`
-- viennent de pile.lua.

local metaKey, versionKey, eventsKey, bansKey, offStreamKey, reportedKey, approvedKey =
  KEYS[1], KEYS[2], KEYS[3], KEYS[4], KEYS[5], KEYS[6], KEYS[7]
local histPrefix, cellsPrefix, clearingPrefix, reportsPrefix, liveChannel =
  ARGV[1], ARGV[2], ARGV[3], ARGV[4], ARGV[5]
local reporterId, cellKey, placementId = ARGV[6], ARGV[7], ARGV[8]
local threshold, nowMs, cellStride, eventsMaxlen = tonumber(ARGV[9]), tonumber(ARGV[10]), tonumber(ARGV[11]), ARGV[12]

-- 0. Canvas prêt, comme place.lua.
local meta = redis.call("HMGET", metaKey, "ready", "ownerId")
if meta[1] ~= "1" then
  return "canvas_not_found"
end

-- 1. La case montre encore cette pose : le signaleur vise ce qu'il a inspecté, jamais ce qui l'a recouvert depuis.
local head = redis.call("LINDEX", histPrefix .. cellKey, 0)
if not head then
  return "changed"
end
local entry = parseEntry(head)
if entry.placementId ~= placementId then
  return "changed"
end

-- 2. Ni un banni, ni sa propre pose, ni celle du streamer, ni une pose rétablie.
local isRefused = redis.call("SISMEMBER", bansKey, reporterId) == 1
  or entry.author == reporterId
  or entry.author == meta[2]
  or redis.call("SISMEMBER", approvedKey, entry.placement) == 1
if isRefused then
  return "forbidden"
end

-- 3. Une fois par compte : un second signalement ne change rien.
local reportsKey = reportsPrefix .. entry.placement
if redis.call("SADD", reportsKey, reporterId) == 0 then
  return "reported"
end
redis.call("ZADD", reportedKey, "NX", nowMs, entry.placement)

-- 4. Au seuil, la pose quitte le stream : chaque case où elle est visible montre ce qu'il y a dessous.
if redis.call("SCARD", reportsKey) >= threshold and redis.call("SADD", offStreamKey, entry.placement) == 1 then
  local pile = openPile({
    cleared = KEYS[8],
    clearedPlacements = KEYS[9],
    clearedRanges = KEYS[10],
    offStream = offStreamKey,
    histPrefix = histPrefix,
    cellsPrefix = cellsPrefix,
    clearingPrefix = clearingPrefix,
    cellStride = cellStride,
  })
  local version = redis.call("INCR", versionKey)
  local event = cjson.encode({
    version = version,
    kind = "hide",
    authorId = cjson.null,
    occurredAt = nowMs,
    cells = pile.listOffStreamCells(),
  })
  event = string.gsub(event, '"cells":{}', '"cells":[]')
  redis.call("XADD", eventsKey, "MAXLEN", "~", eventsMaxlen, version .. "-0", "e", event)
  redis.call("PUBLISH", liveChannel, '{"e":' .. event .. "}")
end

local count = redis.call("ZCARD", reportedKey)
redis.call("PUBLISH", liveChannel, cjson.encode({ ctl = { t = "reports", count = count } }))
return "reported"
