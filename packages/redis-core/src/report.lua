-- Signalement d'une pose (JOURNAL 2026-09-28), et de ses voisines dans une plage d'heures (JOURNAL 2026-09-29).
-- Ordre des KEYS et ARGV : client.ts. `openPile`, `openWindow` et `parseEntry` viennent de pile.lua.

local metaKey, versionKey, eventsKey, bansKey, offStreamKey, reportedKey, approvedKey =
  KEYS[1], KEYS[2], KEYS[3], KEYS[4], KEYS[5], KEYS[6], KEYS[7]
local histPrefix, cellsPrefix, clearingPrefix, reportsPrefix, liveChannel =
  ARGV[1], ARGV[2], ARGV[3], ARGV[4], ARGV[5]
-- La case du cadre que le signaleur a inspectée.
local reporterId, x, y, placementId = ARGV[6], tonumber(ARGV[7]), tonumber(ARGV[8]), ARGV[9]
local threshold, nowMs, cellStride, eventsMaxlen = tonumber(ARGV[10]), tonumber(ARGV[11]), tonumber(ARGV[12]), ARGV[13]
-- Vides sans plage : la pose seule.
local rangeFrom, rangeTo = tonumber(ARGV[14]), tonumber(ARGV[15])

-- 0. Canvas prêt, comme place.lua. §17.1 : une archive ne reçoit plus rien.
local meta = redis.call("HMGET", metaKey, "ready", "ownerId", "width", "height", "archivedAt", "cornerX", "cornerY")
if meta[1] ~= "1" then
  return "canvas_not_found"
end
if meta[5] then
  return "canvas_archived"
end

local window = openWindow(
  cellStride,
  tonumber(meta[6]) or 0,
  tonumber(meta[7]) or 0,
  tonumber(meta[3]),
  tonumber(meta[4])
)

-- 1. La case montre encore cette pose : le signaleur vise ce qu'il a inspecté, jamais ce qui l'a recouvert depuis.
local head = redis.call("LINDEX", histPrefix .. window.keyOf(x, y), 0)
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
-- CDC §8 : la pose d'un compte supprimé se signale seule. Sa plage réunirait les poses de tous les comptes supprimés.
if rangeFrom and entry.author == ARGV[16] then
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
    window = window,
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
