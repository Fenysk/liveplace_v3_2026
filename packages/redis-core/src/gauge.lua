-- La jauge d'un joueur (§5.3). §5.3 : collé devant place.lua et claim.lua, comme pile.lua.
-- Les formules de `refillGauge`, `playerGaugeMax` et `claimableRewards` (domain) : les deux côtés comptent pareil.

-- §5.1 : sans TTL, une progression ne se perd jamais.
local function readProgress(progressKey)
  local fields = redis.call("HMGET", progressKey, "counted", "day", "dayCounted", "claimed")
  return {
    counted = tonumber(fields[1]) or 0,
    day = fields[2] or "",
    dayCounted = tonumber(fields[3]) or 0,
    claimed = tonumber(fields[4]) or 0,
  }
end

-- Un plafond baissé rabote, mais ne reprend rien de ce qui a été réclamé.
local function playerGaugeMax(limits, claimed)
  return math.min(limits.start + claimed, limits.ceiling)
end

local function claimableOf(limits, progress, growthFactor)
  local earned = math.floor(growthFactor * math.sqrt(progress.counted))
  local room = limits.ceiling - limits.start - progress.claimed
  return math.max(0, math.min(earned - progress.claimed, room))
end

-- Recharge paresseuse. Une jauge rabotée redescend au max, sans perdre d'autre charge (piège 2).
local function refillGauge(gaugeKey, gaugeMax, refillMs, refillCharges, nowMs)
  local gauge = redis.call("HMGET", gaugeKey, "charges", "at")
  local charges, at = tonumber(gauge[1]), tonumber(gauge[2])
  if not charges then
    return gaugeMax, nowMs
  end
  -- §5.3 : `max(0, …)`, une horloge qui recule ne vide pas la jauge.
  local refills = math.max(0, math.floor((nowMs - at) / refillMs))
  charges = math.min(gaugeMax, charges + refills * refillCharges)
  at = at + refills * refillMs
  -- §5.3 : pleine, elle n'avance plus ; la recharge repart de la première charge dépensée.
  if charges >= gaugeMax then
    at = nowMs
  end
  return charges, at
end
