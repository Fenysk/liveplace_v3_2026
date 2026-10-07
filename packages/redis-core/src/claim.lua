-- Réclamer une récompense (JOURNAL 2026-09-30). Ordre des KEYS et ARGV : client.ts. La jauge vient de gauge.lua.

local metaKey, bansKey, gaugeKey, progressKey, reqKey = KEYS[1], KEYS[2], KEYS[3], KEYS[4], KEYS[5]
local userId, requestId = ARGV[1], ARGV[2]
local nowMs, growthFactor = tonumber(ARGV[3]), tonumber(ARGV[4])
local gaugeTtlSeconds, reqTtlSeconds = ARGV[5], ARGV[6]

-- Écart §15 (JOURNAL 2026-10-06) : une archive ne reçoit plus rien.
local meta = redis.call(
  "HMGET",
  metaKey,
  "ready",
  "gaugeMaxStart",
  "gaugeMaxCeiling",
  "refillMs",
  "refillCharges",
  "archivedAt"
)
if meta[1] ~= "1" then
  return { "canvas_not_found" }
end
if meta[6] then
  return { "canvas_archived" }
end
local limits = { start = tonumber(meta[2]), ceiling = tonumber(meta[3]) }
local refillMs, refillCharges = tonumber(meta[4]), tonumber(meta[5])

-- Un claim rejoué, ou envoyé par deux onglets avec le même requestId, ne donne qu'un +1 (piège 5).
local stored = redis.call("GET", reqKey)
if stored then
  return { "ack", stored }
end

local progress = readProgress(progressKey)
local gaugeMax = playerGaugeMax(limits, progress.claimed)
local charges, at = refillGauge(gaugeKey, gaugeMax, refillMs, refillCharges, nowMs)
local claimable = claimableOf(limits, progress, growthFactor)
-- A4 : un banni garde sa progression, mais ne réclame rien.
if redis.call("SISMEMBER", bansKey, userId) == 1 then
  claimable = 0
end

local accepted = 0
if claimable > 0 then
  accepted = 1
  claimable = claimable - 1
  redis.call("HINCRBY", progressKey, "claimed", 1)
  gaugeMax = gaugeMax + 1
  -- La nouvelle charge arrive pleine.
  charges = charges + 1
  if charges >= gaugeMax then
    at = nowMs
  end
  redis.call("HSET", gaugeKey, "charges", charges, "at", at)
  redis.call("EXPIRE", gaugeKey, gaugeTtlSeconds)
end

-- `rejected` reste vide : un claim n'a pas de pixel. cjson encode une table vide en `{}`.
local ack = string.gsub(
  cjson.encode({
    t = "ack",
    requestId = requestId,
    accepted = accepted,
    rejected = {},
    gauge = { charges = charges, max = gaugeMax, nextRefillAt = at + refillMs, claimable = claimable },
  }),
  '"rejected":{}',
  '"rejected":[]'
)
redis.call("SET", reqKey, ack, "EX", reqTtlSeconds)
return { "ack", ack }
