-- Signalement d'une pose (JOURNAL 2026-09-28), et de ses voisines dans une plage d'heures (JOURNAL 2026-09-29).
-- Ordre des KEYS et ARGV : client.ts. `openPile` et `parseEntry` viennent de pile.lua.

local metaKey, versionKey, eventsKey, bansKey, offStreamKey, reportedKey, approvedKey =
  KEYS[1], KEYS[2], KEYS[3], KEYS[4], KEYS[5], KEYS[6], KEYS[7]
local histPrefix, cellsPrefix, clearingPrefix, reportsPrefix, liveChannel =
  ARGV[1], ARGV[2], ARGV[3], ARGV[4], ARGV[5]
local reporterId, cellKey, placementId = ARGV[6], ARGV[7], ARGV[8]
local threshold, nowMs, cellStride, eventsMaxlen = tonumber(ARGV[9]), tonumber(ARGV[10]), tonumber(ARGV[11]), ARGV[12]
-- Vides sans plage : la pose seule.
local rangeFrom, rangeTo = tonumber(ARGV[13]), tonumber(ARGV[14])

-- 0. Canvas prêt, comme place.lua.
local meta = redis.call("HMGET", metaKey, "ready", "ownerId", "width", "height")
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

-- 3. Les poses visées : celle-ci, et avec une plage, chaque pose de l'auteur dont un pixel visible y tombe.
local placements, seen = { entry.placement }, { [entry.placement] = true }
if rangeFrom then
  local author = entry.author
  for _, visibleCellKey in ipairs(redis.call("SUNION", cellsPrefix .. author, clearingPrefix .. author)) do
    local raw = redis.call("LINDEX", histPrefix .. visibleCellKey, 0)
    local visible = raw and parseEntry(raw)
    local isNeighbour = visible
      and visible.author == author
      and not seen[visible.placement]
      and visible.placedAt >= rangeFrom
      and visible.placedAt <= rangeTo
    if isNeighbour and redis.call("SISMEMBER", approvedKey, visible.placement) == 0 then
      seen[visible.placement] = true
      placements[#placements + 1] = visible.placement
    end
  end
end

-- 4. Une fois par compte et par pose : un second signalement ne change rien. Chacune se cache à son seuil.
local hidden = 0
for _, placement in ipairs(placements) do
  local reportsKey = reportsPrefix .. placement
  if redis.call("SADD", reportsKey, reporterId) == 1 then
    redis.call("ZADD", reportedKey, "NX", nowMs, placement)
    if redis.call("SCARD", reportsKey) >= threshold then
      hidden = hidden + redis.call("SADD", offStreamKey, placement)
    end
  end
end

-- 5. Une pose de plus hors du stream : chaque case où une pose cachée est visible montre ce qu'il y a dessous.
if hidden > 0 then
  local pile = openPile({
    cleared = KEYS[8],
    clearedPlacements = KEYS[9],
    clearedRanges = KEYS[10],
    offStream = offStreamKey,
    histPrefix = histPrefix,
    cellsPrefix = cellsPrefix,
    clearingPrefix = clearingPrefix,
    cellStride = cellStride,
    width = tonumber(meta[3]),
    height = tonumber(meta[4]),
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
