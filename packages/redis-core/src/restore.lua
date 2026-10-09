-- Remettre un canvas perdu (Écart §7.2, JOURNAL 2026-10-08). Ordre des KEYS et ARGV : recovery.ts. Les gros morceaux (piles
-- `hist:`, `cells:`, miroirs `user:`) sont déjà posés par le worker : ici le reste, d'un seul bloc, et `ready` en dernier.

local versionKey, metaKey, stateKey = KEYS[1], KEYS[2], KEYS[3]
local bansKey, bansTwitchKey, clearedKey, clearedPlacementsKey, clearedRangesKey =
  KEYS[4], KEYS[5], KEYS[6], KEYS[7], KEYS[8]
local modsKey, modsTwitchKey, modsLiveplaceKey, twitchUsersKey = KEYS[9], KEYS[10], KEYS[11], KEYS[12]
local reportedKey, offStreamKey, approvedKey, scoreboardKey, scoreboardBannedKey, liveChannel =
  KEYS[13], KEYS[14], KEYS[15], KEYS[16], KEYS[17], KEYS[18]
local prefix, version, nowMs, state = ARGV[1], ARGV[2], ARGV[3], ARGV[4]
local snapshot = cjson.decode(ARGV[5])
local snapshotVersion = ARGV[6]

-- 0. Seule une récupération entamée (`ready` à 0) se termine : ni un canvas prêt, ni le canvas neuf d'un archivage.
if redis.call("HGET", metaKey, "ready") ~= "0" then
  return "already_live"
end

local function addAll(key, members)
  for _, member in ipairs(members) do
    redis.call("SADD", key, member)
  end
end

local function setAll(key, fields)
  for field, value in pairs(fields) do
    redis.call("HSET", key, field, value)
  end
end

-- 1. La modération. Un nom Twitch noté depuis la perte (twitch:users) est plus récent que la sauvegarde : il reste.
addAll(bansKey, snapshot.bans)
addAll(bansTwitchKey, snapshot.bansTwitch)
for userId, proof in pairs(snapshot.banProofs) do
  setAll(prefix .. "ban:" .. userId, proof)
end
setAll(clearedKey, snapshot.cleared)
addAll(clearedPlacementsKey, snapshot.clearedPlacements)
setAll(clearedRangesKey, snapshot.clearedRanges)
addAll(modsKey, snapshot.mods)
addAll(modsTwitchKey, snapshot.modsTwitch)
addAll(modsLiveplaceKey, snapshot.modsLiveplace)
for userId, name in pairs(snapshot.twitchUsers) do
  redis.call("HSETNX", twitchUsersKey, userId, name)
end

-- 2. Les signalements, les poses cachées du stream et les poses rétablies.
for _, reported in ipairs(snapshot.reported) do
  redis.call("ZADD", reportedKey, reported[2], reported[1])
end
for placementKey, reporters in pairs(snapshot.reports) do
  addAll(prefix .. "reports:" .. placementKey, reporters)
end
addAll(offStreamKey, snapshot.offStream)
addAll(approvedKey, snapshot.approved)

-- 3. Le classement et les progressions des joueurs.
for userId, score in pairs(snapshot.scoreboard) do
  redis.call("ZADD", scoreboardKey, score, userId)
end
setAll(scoreboardBannedKey, snapshot.scoreboardBanned)
for userId, progress in pairs(snapshot.progress) do
  setAll(prefix .. "progress:" .. userId, progress)
end

-- 4. `meta` : ce qui est déjà là (écrit depuis la perte) l'emporte, sauf `ready` que la fin pose.
for field, value in pairs(snapshot.meta) do
  redis.call("HSETNX", metaKey, field, value)
end
-- `recoveredSnapshotVersion` : la version de la sauvegarde, que le saut de `version` ne dit pas quand le curseur la dépasse.
redis.call("HSET", metaKey, "recoveredAt", nowMs, "recoveredAtVersion", version, "recoveredSnapshotVersion", snapshotVersion)

-- 5. L'image, la version, puis `ready`. Les pages restées connectées reprennent un snapshot entier (ctl resize).
redis.call("SET", stateKey, state)
redis.call("SET", versionKey, version)
redis.call("HSET", metaKey, "ready", 1)
redis.call("PUBLISH", liveChannel, '{"ctl":{"t":"resize"}}')
return "restored"
