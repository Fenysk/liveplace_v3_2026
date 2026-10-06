-- Pose d'un lot de pixels (§5.3). Ordre des KEYS et ARGV : client.ts. `openPile` vient de pile.lua, la jauge de gauge.lua.

local metaKey, stateKey, versionKey, eventsKey, bansKey, gaugeKey, reqKey =
  KEYS[1], KEYS[2], KEYS[3], KEYS[4], KEYS[5], KEYS[6], KEYS[7]
local histPrefix, cellsPrefix, liveChannel, userId, requestId = ARGV[1], ARGV[2], ARGV[3], ARGV[4], ARGV[5]
local nowMs, paletteSize, cellStride, histDepth =
  tonumber(ARGV[6]), tonumber(ARGV[7]), tonumber(ARGV[8]), tonumber(ARGV[9])
local eventsMaxlen, gaugeTtlSeconds, reqTtlSeconds = ARGV[10], ARGV[11], ARGV[12]
-- §5.1 : la pose dont ce lot fait partie.
local placementId = ARGV[13]
-- §5.3 : la progression, comptée au jour de Paris.
local progressKey = KEYS[12]
local day, growthFactor, countedPixelsPerDay = ARGV[14], tonumber(ARGV[15]), tonumber(ARGV[16])
-- §5.1 : le classement, et l'encodage de son score (keys.ts).
local scoreboardKey = KEYS[13]
local scoreTieSpan, scoreMaxPixels, transparentColorIndex = tonumber(ARGV[17]), tonumber(ARGV[18]), tonumber(ARGV[19])
local firstPixelArg = 20
local pixelCount = (#ARGV - firstPixelArg + 1) / 3

-- cjson encode une table vide en `{}`, or `rejected` est un tableau.
local function encodeAck(ack)
  return (string.gsub(cjson.encode(ack), '"rejected":{}', '"rejected":[]'))
end

-- 0. Canvas prêt. §5.5 : le script ne se fie pas au seul gateway.
local meta = redis.call(
  "HMGET",
  metaKey,
  "ready",
  "width",
  "height",
  "gaugeMaxStart",
  "gaugeMaxCeiling",
  "refillMs",
  "refillCharges"
)
if meta[1] ~= "1" then
  return { "canvas_not_found" }
end
local width, height = tonumber(meta[2]), tonumber(meta[3])
local limits = { start = tonumber(meta[4]), ceiling = tonumber(meta[5]) }
local refillMs, refillCharges = tonumber(meta[6]), tonumber(meta[7])

-- 1. Idempotence.
local stored = redis.call("GET", reqKey)
if stored then
  return { "ack", stored }
end

-- 4. Recharge paresseuse, calculée avant le ban : l'ack d'un banni porte aussi la jauge.
local progress = readProgress(progressKey)
local gaugeMax = playerGaugeMax(limits, progress.claimed)
local charges, at = refillGauge(gaugeKey, gaugeMax, refillMs, refillCharges, nowMs)

-- 2. Ban.
if redis.call("SISMEMBER", bansKey, userId) == 1 then
  local rejected = {}
  for index = 0, pixelCount - 1 do
    rejected[#rejected + 1] = { index = index, reason = "banned" }
  end
  -- A4 : un banni ne réclame rien.
  local gaugeFrame = { charges = charges, max = gaugeMax, nextRefillAt = at + refillMs, claimable = 0 }
  return { "ack", encodeAck({ t = "ack", requestId = requestId, accepted = 0, rejected = rejected, gauge = gaugeFrame }) }
end

-- 3 et 5. Validation par pixel, puis budget sur les pixels valides.
local accepted, rejected = {}, {}
for index = 0, pixelCount - 1 do
  local arg = firstPixelArg + index * 3
  local x, y, colorIndex = tonumber(ARGV[arg]), tonumber(ARGV[arg + 1]), tonumber(ARGV[arg + 2])
  if x < 0 or x >= width or y < 0 or y >= height or colorIndex < 0 or colorIndex >= paletteSize then
    rejected[#rejected + 1] = { index = index, reason = "invalid" }
  elseif #accepted >= charges then
    rejected[#rejected + 1] = { index = index, reason = "gauge" }
  else
    accepted[#accepted + 1] = { x = x, y = y, colorIndex = colorIndex }
  end
end

local version
if #accepted > 0 then
  -- 6. Version.
  version = redis.call("INCR", versionKey)
  -- §9.5 : sans pose cachée, aucune pile n'est relue en entier.
  local pile = openPile({
    cleared = KEYS[8],
    clearedPlacements = KEYS[9],
    clearedRanges = KEYS[10],
    offStream = KEYS[11],
    cellStride = cellStride,
  })

  -- 7. Écriture (D-15 : stateOffset pour `state`, cellKey pour tout le reste).
  local cells = {}
  for i, pixel in ipairs(accepted) do
    local stateOffset = pixel.y * width + pixel.x
    local cellKey = pixel.y * cellStride + pixel.x
    local histKey = histPrefix .. cellKey
    local previousColorIndex = string.byte(redis.call("GETRANGE", stateKey, stateOffset, stateOffset))
    local before = pile.hasOffStream and redis.call("LRANGE", histKey, 0, -1) or nil
    local head = redis.call("LINDEX", histKey, 0)
    local entry = userId .. ":" .. pixel.colorIndex .. ":" .. nowMs .. ":" .. version .. ":" .. placementId
    redis.call("SETRANGE", stateKey, stateOffset, string.char(pixel.colorIndex))
    redis.call("LPUSH", histKey, entry)
    redis.call("LTRIM", histKey, 0, histDepth - 1)
    if head then
      local previousAuthor = parseEntry(head).author
      if previousAuthor ~= userId then
        redis.call("SREM", cellsPrefix .. previousAuthor, cellKey)
      end
    end
    redis.call("SADD", cellsPrefix .. userId, cellKey)
    cells[i] = {
      x = pixel.x,
      y = pixel.y,
      colorIndex = pixel.colorIndex,
      previousColorIndex = previousColorIndex,
      placedAt = nowMs,
    }
    if before then
      -- Une pose cachée en jeu : ce pixel en fait partie (signalée avant son dernier envoi), ou il en recouvre une.
      cells[i].obs = pile.streamCell({ entry, unpack(before) }, cells[i], before)
    end
  end
  charges = charges - #accepted

  -- §5.3 : chaque pixel accepté compte, au plus `countedPixelsPerDay` par jour.
  if progress.day ~= day then
    progress.day, progress.dayCounted = day, 0
  end
  local counted = math.min(#accepted, math.max(0, countedPixelsPerDay - progress.dayCounted))
  progress.counted = progress.counted + counted
  progress.dayCounted = progress.dayCounted + counted
  redis.call("HSET", progressKey, "counted", progress.counted, "day", day, "dayCounted", progress.dayCounted)

  -- §5.1 : le classement compte chaque pixel accepté, sans plafond, la gomme exceptée. À égalité, la plus petite version
  -- (le premier arrivé) reste devant.
  local placed = 0
  for _, pixel in ipairs(accepted) do
    if pixel.colorIndex ~= transparentColorIndex then
      placed = placed + 1
    end
  end
  if placed > 0 then
    local pixels = math.floor((tonumber(redis.call("ZSCORE", scoreboardKey, userId)) or 0) / scoreTieSpan)
    local score = math.min(pixels + placed, scoreMaxPixels) * scoreTieSpan + math.max(0, scoreTieSpan - 1 - version)
    redis.call("ZADD", scoreboardKey, score, userId)
  end

  -- 9. Publication. MAXLEN se place avant l'ID.
  local event = cjson.encode({ version = version, kind = "place", authorId = userId, occurredAt = nowMs, cells = cells })
  redis.call("XADD", eventsKey, "MAXLEN", "~", eventsMaxlen, version .. "-0", "e", event)
  redis.call("PUBLISH", liveChannel, '{"e":' .. event .. "}")
end

-- 8. Jauge.
redis.call("HSET", gaugeKey, "charges", charges, "at", at)
redis.call("EXPIRE", gaugeKey, gaugeTtlSeconds)

-- 10. Mémoire de la réponse.
local ack = encodeAck({
  t = "ack",
  requestId = requestId,
  version = version,
  accepted = #accepted,
  rejected = rejected,
  gauge = {
    charges = charges,
    max = gaugeMax,
    nextRefillAt = at + refillMs,
    claimable = claimableOf(limits, progress, growthFactor),
  },
})
redis.call("SET", reqKey, ack, "EX", reqTtlSeconds)
return { "ack", ack }
