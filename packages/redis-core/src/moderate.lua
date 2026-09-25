-- Modération d'un canvas (§5.4) : clearUser, ban, unban. Ordre des KEYS et ARGV : client.ts.

local metaKey, stateKey, versionKey, eventsKey, bansKey, modsKey, clearedKey, clearingKey, targetCellsKey, banKey =
  KEYS[1], KEYS[2], KEYS[3], KEYS[4], KEYS[5], KEYS[6], KEYS[7], KEYS[8], KEYS[9], KEYS[10]
local histPrefix, cellsPrefix, liveChannel, by, action, target, slice =
  ARGV[1], ARGV[2], ARGV[3], ARGV[4], ARGV[5], ARGV[6], ARGV[7]
local nowMs, cellStride, sliceCells, eventsMaxlen = tonumber(ARGV[8]), tonumber(ARGV[9]), tonumber(ARGV[10]), ARGV[11]

-- Entrée d'une pile : `<userId>:<colorIndex>:<placedAt>:<version>`, lue par la fin (comme place.lua).
local ENTRY = "^(.*):(%d+):(%d+):(%d+)$"

-- 0. Canvas prêt. Écart §5.5 (JOURNAL 2026-09-15), comme place.lua.
local meta = redis.call("HMGET", metaKey, "ready", "width", "ownerId")
if meta[1] ~= "1" then
  return { "canvas_not_found" }
end
local width, ownerId = tonumber(meta[2]), meta[3]

-- 1. Les droits : le propriétaire ou un modérateur, et jamais contre le propriétaire. Le gateway vérifie aussi.
if (by ~= ownerId and redis.call("SISMEMBER", modsKey, by) == 0) or target == ownerId then
  return { "forbidden" }
end

local function stateOffsetOf(cellKey)
  return math.floor(cellKey / cellStride) * width + cellKey % cellStride
end

-- Chaque action est une version et entre dans le stream, ban et unban compris (§5.4).
-- cjson encode une table vide en `{}`, or `cells` est un tableau. Écart §5.4 (JOURNAL 2026-09-25) : pas de champ `r`.
local function publish(version, cells)
  local event = cjson.encode({
    version = version,
    kind = "clear",
    authorId = by,
    occurredAt = nowMs,
    cells = cells,
    moderation = { action = action, target = target },
  })
  event = string.gsub(event, '"cells":{}', '"cells":[]')
  redis.call("XADD", eventsKey, "MAXLEN", "~", eventsMaxlen, version .. "-0", "e", event)
  redis.call("PUBLISH", liveChannel, '{"e":' .. event .. "}")
end

-- Le gateway prévient les sockets de la cible (JOURNAL 2026-09-25).
local function control(t)
  redis.call("PUBLISH", liveChannel, cjson.encode({ ctl = { t = t, userId = target } }))
end

-- 2. ban : ne touche à aucun pixel, l'interface enchaîne ensuite clearUser (§5.4).
if action == "ban" then
  -- Écart §5.1 (JOURNAL 2026-09-25) : la preuve, ses pixels visibles, avant que clearUser ne les retire.
  -- Seulement au premier ban : un second la viderait.
  if redis.call("SADD", bansKey, target) == 1 then
    for _, cellKey in ipairs(redis.call("SUNION", targetCellsKey, clearingKey)) do
      local stateOffset = stateOffsetOf(tonumber(cellKey))
      redis.call("HSET", banKey, cellKey, string.byte(redis.call("GETRANGE", stateKey, stateOffset, stateOffset)))
    end
  end
  local version = redis.call("INCR", versionKey)
  publish(version, {})
  control("banned")
  return { "moderated", version, 0, 1 }
end

-- 3. unban : la pierre tombale reste, ses pixels retirés ne reviennent jamais. Sa preuve part avec le ban.
if action == "unban" then
  redis.call("SREM", bansKey, target)
  redis.call("DEL", banKey)
  local version = redis.call("INCR", versionKey)
  publish(version, {})
  control("unbanned")
  return { "moderated", version, 0, 1 }
end

-- 4. clearUser. Le dépilage (D-16) : retirer de la pile toute entrée qu'une pierre tombale couvre,
-- pour que sa tête soit toujours l'auteur visible, puis écrire ce qui devient visible.
-- Écrit à part : le retrait d'une pose le réutilisera (JOURNAL 2026-09-25).
local clearedVersions = {}
local function isCovered(author, version)
  if clearedVersions[author] == nil then
    clearedVersions[author] = tonumber(redis.call("HGET", clearedKey, author)) or false
  end
  return clearedVersions[author] ~= false and version <= clearedVersions[author]
end

-- Rend la case changée, ou nil si son pixel visible reste le même.
local function unstack(cellKey)
  local histKey = histPrefix .. cellKey
  local entries = redis.call("LRANGE", histKey, 0, -1)
  local kept = {}
  for _, entry in ipairs(entries) do
    local author, _, _, version = string.match(entry, ENTRY)
    if not isCovered(author, tonumber(version)) then
      kept[#kept + 1] = entry
    end
  end
  if #kept < #entries then
    redis.call("DEL", histKey)
    if #kept > 0 then
      redis.call("RPUSH", histKey, unpack(kept))
    end
  end
  if kept[1] == entries[1] then
    return nil
  end

  local stateOffset = stateOffsetOf(tonumber(cellKey))
  local previousColorIndex = string.byte(redis.call("GETRANGE", stateKey, stateOffset, stateOffset))
  local previousAuthor = string.match(entries[1], ENTRY)
  redis.call("SREM", cellsPrefix .. previousAuthor, cellKey)
  -- Une pile vidée : la case devient transparente, à l'heure de l'action.
  local colorIndex, placedAt = 0, nowMs
  if kept[1] then
    local author, headColorIndex, headPlacedAt = string.match(kept[1], ENTRY)
    colorIndex, placedAt = tonumber(headColorIndex), tonumber(headPlacedAt)
    redis.call("SADD", cellsPrefix .. author, cellKey)
  end
  redis.call("SETRANGE", stateKey, stateOffset, string.char(colorIndex))
  local key = tonumber(cellKey)
  return {
    x = key % cellStride,
    y = math.floor(key / cellStride),
    colorIndex = colorIndex,
    previousColorIndex = previousColorIndex,
    placedAt = placedAt,
  }
end

local version = redis.call("INCR", versionKey)

-- 4a. Première tranche : la pierre tombale, puis ses cases versées dans l'ensemble de travail (avec ce qu'une
-- coupure y a laissé). Écart §5.4 (JOURNAL 2026-09-25) : pas de curseur, ce qu'il pose ensuite reste à lui.
if slice == "first" then
  redis.call("HSET", clearedKey, target, version)
  redis.call("SUNIONSTORE", clearingKey, clearingKey, targetCellsKey)
  redis.call("DEL", targetCellsKey)
end

-- 4b. Chaque tranche : au plus 4096 cases, retirées de l'ensemble de travail.
local cells = {}
for _, cellKey in ipairs(redis.call("SPOP", clearingKey, sliceCells)) do
  local cell = unstack(cellKey)
  if cell then
    cells[#cells + 1] = cell
  end
end
publish(version, cells)
return { "moderated", version, #cells, redis.call("EXISTS", clearingKey) == 0 and 1 or 0 }
