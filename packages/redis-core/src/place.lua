-- Pose d'un lot de pixels (§5.3). Ordre des KEYS et ARGV : client.ts.

local metaKey, stateKey, versionKey, eventsKey, bansKey, gaugeKey, reqKey =
  KEYS[1], KEYS[2], KEYS[3], KEYS[4], KEYS[5], KEYS[6], KEYS[7]
local histPrefix, cellsPrefix, liveChannel, userId, requestId = ARGV[1], ARGV[2], ARGV[3], ARGV[4], ARGV[5]
local nowMs, paletteSize, cellStride, histDepth =
  tonumber(ARGV[6]), tonumber(ARGV[7]), tonumber(ARGV[8]), tonumber(ARGV[9])
local eventsMaxlen, gaugeTtlSeconds, reqTtlSeconds = ARGV[10], ARGV[11], ARGV[12]
local firstPixelArg = 13
local pixelCount = (#ARGV - firstPixelArg + 1) / 3

-- cjson encode une table vide en `{}`, or `rejected` est un tableau.
local function encodeAck(ack)
  return (string.gsub(cjson.encode(ack), '"rejected":{}', '"rejected":[]'))
end

-- 0. Canvas prêt. Écart §5.5 (JOURNAL 2026-09-15) : le script ne se fie pas au seul gateway.
local meta = redis.call("HMGET", metaKey, "ready", "width", "height", "gaugeMax", "refillMs", "refillCharges")
if meta[1] ~= "1" then
  return { "canvas_not_found" }
end
local width, height = tonumber(meta[2]), tonumber(meta[3])
local gaugeMax, refillMs, refillCharges = tonumber(meta[4]), tonumber(meta[5]), tonumber(meta[6])

-- 1. Idempotence.
local stored = redis.call("GET", reqKey)
if stored then
  return { "ack", stored }
end

-- 4. Recharge paresseuse, calculée avant le ban : l'ack d'un banni porte aussi la jauge.
local gauge = redis.call("HMGET", gaugeKey, "charges", "at")
local charges, at = tonumber(gauge[1]), tonumber(gauge[2])
if not charges then
  charges, at = gaugeMax, nowMs
else
  -- Écart §5.3 (JOURNAL 2026-09-15) : `max(0, …)`, une horloge qui recule ne vide pas la jauge.
  local refills = math.max(0, math.floor((nowMs - at) / refillMs))
  charges = math.min(gaugeMax, charges + refills * refillCharges)
  at = at + refills * refillMs
end

-- 2. Ban.
if redis.call("SISMEMBER", bansKey, userId) == 1 then
  local rejected = {}
  for index = 0, pixelCount - 1 do
    rejected[#rejected + 1] = { index = index, reason = "banned" }
  end
  local gaugeFrame = { charges = charges, max = gaugeMax, nextRefillAt = at + refillMs }
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

  -- 7. Écriture (D-15 : stateOffset pour `state`, cellKey pour tout le reste).
  local cells = {}
  for i, pixel in ipairs(accepted) do
    local stateOffset = pixel.y * width + pixel.x
    local cellKey = pixel.y * cellStride + pixel.x
    local histKey = histPrefix .. cellKey
    local previousColorIndex = string.byte(redis.call("GETRANGE", stateKey, stateOffset, stateOffset))
    local head = redis.call("LINDEX", histKey, 0)
    redis.call("SETRANGE", stateKey, stateOffset, string.char(pixel.colorIndex))
    redis.call("LPUSH", histKey, userId .. ":" .. pixel.colorIndex .. ":" .. nowMs .. ":" .. version)
    redis.call("LTRIM", histKey, 0, histDepth - 1)
    if head then
      -- Entrée `<userId>:<colorIndex>:<placedAt>:<version>`.
      local previousAuthor = string.match(head, "^(.*):[^:]*:[^:]*:[^:]*$")
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
  end
  charges = charges - #accepted

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
  gauge = { charges = charges, max = gaugeMax, nextRefillAt = at + refillMs },
})
redis.call("SET", reqKey, ack, "EX", reqTtlSeconds)
return { "ack", ack }
