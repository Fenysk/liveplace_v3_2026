-- Les modérateurs d'un canvas et leur origine (JOURNAL 2026-09-27). Ordre des KEYS et ARGV : client.ts.
-- `mods` reste le seul ensemble lu (§5.1) : l'union de ce que Twitch et LivePlace ont nommé.

local metaKey, modsKey, twitchKey, liveplaceKey = KEYS[1], KEYS[2], KEYS[3], KEYS[4]
local liveChannel, userId, source, isModerator = ARGV[1], ARGV[2], ARGV[3], ARGV[4] == "1"

-- Écart §15 (JOURNAL 2026-10-06) : une archive ne reçoit plus rien.
local meta = redis.call("HMGET", metaKey, "ready", "ownerId", "archivedAt")
if meta[1] ~= "1" then
  return "canvas_not_found"
end
if meta[3] then
  return "canvas_archived"
end
-- Le streamer a déjà tous les droits sur son canvas : il n'en est jamais modérateur.
if userId == meta[2] then
  return "forbidden"
end

local sourceKey, otherKey = twitchKey, liveplaceKey
if source == "liveplace" then
  sourceKey, otherKey = liveplaceKey, twitchKey
end

if isModerator then
  redis.call("SADD", sourceKey, userId)
  redis.call("SADD", modsKey, userId)
else
  redis.call("SREM", sourceKey, userId)
  if redis.call("SISMEMBER", otherKey, userId) == 0 then
    redis.call("SREM", modsKey, userId)
  end
end

-- Le gateway recalcule le rôle des sockets de cette personne, et le leur envoie.
redis.call("PUBLISH", liveChannel, cjson.encode({ ctl = { t = "role", userId = userId } }))
return "ok"
