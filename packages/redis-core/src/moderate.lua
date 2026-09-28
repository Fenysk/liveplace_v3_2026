-- Modération d'un canvas (§5.4) : clearUser, clearPlacement, approvePlacement, ban, unban. Ordre des KEYS et ARGV :
-- client.ts. `openPile` et `parseEntry` viennent de pile.lua.

local metaKey, stateKey, versionKey, eventsKey, bansKey, modsKey, clearedKey, clearingKey, targetCellsKey, banKey =
  KEYS[1], KEYS[2], KEYS[3], KEYS[4], KEYS[5], KEYS[6], KEYS[7], KEYS[8], KEYS[9], KEYS[10]
local bansTwitchKey = KEYS[11]
-- Écart §5.1 (JOURNAL 2026-09-28) : les pierres tombales d'une pose et d'une plage, et les poses signalées.
local clearedPlacementsKey, clearedRangesKey, offStreamKey, reportedKey, approvedKey =
  KEYS[12], KEYS[13], KEYS[14], KEYS[15], KEYS[16]
-- Écart §5.4 (JOURNAL 2026-09-29) : ce qu'un retrait vient d'ôter à la cible, la preuve d'un ban qui suivrait.
local recentlyClearedKey = KEYS[17]
local histPrefix, cellsPrefix, liveChannel, by, action, target, slice =
  ARGV[1], ARGV[2], ARGV[3], ARGV[4], ARGV[5], ARGV[6], ARGV[7]
local nowMs, cellStride, sliceCells, eventsMaxlen = tonumber(ARGV[8]), tonumber(ARGV[9]), tonumber(ARGV[10]), ARGV[11]
-- Écart §5.4 (JOURNAL 2026-09-27) : `liveplace` ou `twitch`, l'origine d'un ban et d'un déban.
local source = ARGV[12]
-- Écart §5.4 (JOURNAL 2026-09-28) : la pose visée et la plage d'heures qui l'étend, vides sinon.
local placementId, rangeFrom, rangeTo = ARGV[13], tonumber(ARGV[14]), tonumber(ARGV[15])
local clearingPrefix, reportsPrefix, recentlyClearedTtl = ARGV[16], ARGV[17], ARGV[18]
local placement = target .. ":" .. placementId

-- 0. Canvas prêt. Écart §5.5 (JOURNAL 2026-09-15), comme place.lua.
local meta = redis.call("HMGET", metaKey, "ready", "width", "ownerId", "height")
if meta[1] ~= "1" then
  return { "canvas_not_found" }
end
local width, ownerId, height = tonumber(meta[2]), meta[3], tonumber(meta[4])

-- 1. Les droits : le propriétaire ou un modérateur, et jamais contre le propriétaire. Le gateway vérifie aussi.
if (by ~= ownerId and redis.call("SISMEMBER", modsKey, by) == 0) or target == ownerId then
  return { "forbidden" }
end

local function stateOffsetOf(cellKey)
  return math.floor(cellKey / cellStride) * width + cellKey % cellStride
end

-- Chaque action est une version et entre dans le stream, ban et unban compris (§5.4).
-- cjson encode une table vide en `{}`, or `cells` est un tableau. Écart §5.4 (JOURNAL 2026-09-25) : pas de champ `r`.
local function publish(version, cells, kind)
  local moderation = { action = action, target = target }
  if placementId ~= "" then
    moderation.placementId = placementId
  end
  local event = cjson.encode({
    version = version,
    kind = kind,
    authorId = by,
    occurredAt = nowMs,
    cells = cells,
    moderation = moderation,
  })
  event = string.gsub(event, '"cells":{}', '"cells":[]')
  redis.call("XADD", eventsKey, "MAXLEN", "~", eventsMaxlen, version .. "-0", "e", event)
  redis.call("PUBLISH", liveChannel, '{"e":' .. event .. "}")
end

-- Le gateway prévient les sockets de la cible (JOURNAL 2026-09-25).
local function control(t)
  redis.call("PUBLISH", liveChannel, cjson.encode({ ctl = { t = t, userId = target } }))
end

local function openCanvasPile()
  return openPile({
    cleared = clearedKey,
    clearedPlacements = clearedPlacementsKey,
    clearedRanges = clearedRangesKey,
    offStream = offStreamKey,
    histPrefix = histPrefix,
    cellsPrefix = cellsPrefix,
    clearingPrefix = clearingPrefix,
    cellStride = cellStride,
    width = width,
    height = height,
  })
end

-- Écart §5.1 (JOURNAL 2026-09-28) : une pose tranchée quitte les signalements, et les modérateurs l'apprennent.
local function settleReports(placements)
  local settled = 0
  for _, settledPlacement in ipairs(placements) do
    settled = settled + redis.call("ZREM", reportedKey, settledPlacement)
    settled = settled + redis.call("SREM", offStreamKey, settledPlacement)
    redis.call("DEL", reportsPrefix .. settledPlacement)
  end
  if settled > 0 then
    local count = redis.call("ZCARD", reportedKey)
    redis.call("PUBLISH", liveChannel, cjson.encode({ ctl = { t = "reports", count = count } }))
  end
end

-- Les poses signalées ou cachées d'un auteur.
local function listReportedPlacements(author)
  local found, seen, prefix = {}, {}, author .. ":"
  local members = redis.call("ZRANGE", reportedKey, 0, -1)
  for _, member in ipairs(redis.call("SMEMBERS", offStreamKey)) do
    members[#members + 1] = member
  end
  for _, member in ipairs(members) do
    if not seen[member] and string.sub(member, 1, #prefix) == prefix then
      seen[member] = true
      found[#found + 1] = member
    end
  end
  return found
end

-- 2. ban : ne touche à aucun pixel, l'interface enchaîne ensuite clearUser (§5.4).
if action == "ban" then
  -- Écart §5.1 (JOURNAL 2026-09-25) : la preuve, ses pixels visibles, avant que clearUser ne les retire.
  -- Seulement au premier ban : un second la viderait. Écart §5.4 (JOURNAL 2026-09-29) : ce qu'un retrait vient de
  -- lui ôter d'abord, ses pixels visibles par-dessus.
  if redis.call("SADD", bansKey, target) == 1 then
    local recentlyCleared = redis.call("HGETALL", recentlyClearedKey)
    for index = 1, #recentlyCleared, 2 do
      redis.call("HSET", banKey, recentlyCleared[index], recentlyCleared[index + 1])
    end
    redis.call("DEL", recentlyClearedKey)
    for _, cellKey in ipairs(redis.call("SUNION", targetCellsKey, clearingKey)) do
      if isInside(cellKey, cellStride, width, height) then
        local stateOffset = stateOffsetOf(tonumber(cellKey))
        redis.call("HSET", banKey, cellKey, string.byte(redis.call("GETRANGE", stateKey, stateOffset, stateOffset)))
      end
    end
    -- Un ban déjà posé ici reste à LivePlace : Twitch ne pourra pas le lever.
    if source == "twitch" then
      redis.call("SADD", bansTwitchKey, target)
    end
  end
  local version = redis.call("INCR", versionKey)
  publish(version, {}, "clear")
  control("banned")
  return { "moderated", version, 0, 1 }
end

-- 3. unban : la pierre tombale reste, ses pixels retirés ne reviennent jamais. Sa preuve part avec le ban.
if action == "unban" then
  -- Un déban Twitch ne lève qu'un ban venu de Twitch. Sinon rien : la version reste celle du canvas.
  if source == "twitch" and redis.call("SISMEMBER", bansTwitchKey, target) == 0 then
    return { "moderated", tonumber(redis.call("GET", versionKey)) or 0, 0, 1 }
  end
  redis.call("SREM", bansKey, target)
  redis.call("SREM", bansTwitchKey, target)
  redis.call("DEL", banKey)
  local version = redis.call("INCR", versionKey)
  publish(version, {}, "clear")
  control("unbanned")
  return { "moderated", version, 0, 1 }
end

-- 4. approvePlacement (Rétablir) : la pose revient sur le stream et ne se signale plus. En une fois.
if action == "approvePlacement" then
  local wasOffStream = redis.call("SISMEMBER", offStreamKey, placement) == 1
  settleReports({ placement })
  redis.call("SADD", approvedKey, placement)
  local cells = {}
  if wasOffStream then
    local pile = openCanvasPile()
    cells = pile.listPlacementCells(target, placement)
    -- Sous une autre pose cachée, le stream montrait ce qu'il y a sous celle-ci : il la montre désormais.
    for _, cell in ipairs(pile.listOffStreamCells()) do
      cells[#cells + 1] = cell
    end
  end
  local version = redis.call("INCR", versionKey)
  publish(version, cells, "unhide")
  return { "moderated", version, #cells, 1 }
end

-- 5. clearUser et clearPlacement. Le dépilage (D-16) : retirer de la pile toute entrée qu'une pierre tombale couvre,
-- pour que sa tête soit toujours l'auteur visible, puis écrire ce qui devient visible.
local version = redis.call("INCR", versionKey)

-- 5a. Première tranche : la pierre tombale, puis ses cases versées dans l'ensemble de travail (avec ce qu'une
-- coupure y a laissé). Écart §5.4 (JOURNAL 2026-09-25) : pas de curseur, ce qu'il pose ensuite reste à lui.
if slice == "first" and action == "clearUser" then
  redis.call("HSET", clearedKey, target, version)
  redis.call("SUNIONSTORE", clearingKey, clearingKey, targetCellsKey)
  redis.call("DEL", targetCellsKey)
elseif slice == "first" then
  -- Écart §5.4 (JOURNAL 2026-09-28) : la pose, et la plage qui l'étend. `cells:` garde ce qui reste à lui.
  redis.call("SADD", clearedPlacementsKey, placement)
  if rangeFrom then
    local raw = redis.call("HGET", clearedRangesKey, target)
    local ranges = raw and cjson.decode(raw) or {}
    ranges[#ranges + 1] = { rangeFrom, rangeTo }
    redis.call("HSET", clearedRangesKey, target, cjson.encode(ranges))
  end
  redis.call("SUNIONSTORE", clearingKey, clearingKey, targetCellsKey)
end

local pile = openCanvasPile()

-- Rend la case changée, ou nil si son pixel visible reste le même.
local function unstack(cellKey)
  local histKey = histPrefix .. cellKey
  local entries = redis.call("LRANGE", histKey, 0, -1)
  local kept = {}
  for _, entry in ipairs(entries) do
    if not pile.isCovered(parseEntry(entry)) then
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

  local previousAuthor = parseEntry(entries[1]).author
  redis.call("SREM", cellsPrefix .. previousAuthor, cellKey)
  -- Une pile vidée : la case devient transparente, à l'heure de l'action.
  local colorIndex, placedAt = 0, nowMs
  if kept[1] then
    local head = parseEntry(kept[1])
    colorIndex, placedAt = head.colorIndex, head.placedAt
    redis.call("SADD", cellsPrefix .. head.author, cellKey)
  end
  -- Écart §5.3 (JOURNAL 2026-09-29) : hors du cadre, la pile change, la case ne s'écrit ni ne s'émet.
  if not isInside(cellKey, cellStride, width, height) then
    return nil
  end
  local stateOffset = stateOffsetOf(tonumber(cellKey))
  local previousColorIndex = string.byte(redis.call("GETRANGE", stateKey, stateOffset, stateOffset))
  if previousAuthor == target then
    redis.call("HSET", recentlyClearedKey, cellKey, previousColorIndex)
  end
  redis.call("SETRANGE", stateKey, stateOffset, string.char(colorIndex))
  local key = tonumber(cellKey)
  local cell = {
    x = key % cellStride,
    y = math.floor(key / cellStride),
    colorIndex = colorIndex,
    previousColorIndex = previousColorIndex,
    placedAt = placedAt,
  }
  -- Écart §9.5 (JOURNAL 2026-09-28) : le pixel revenu peut appartenir à une pose cachée (piège 2).
  cell.obs = pile.streamCell(kept, cell)
  return cell
end

-- 5b. Chaque tranche : au plus 4096 cases, retirées de l'ensemble de travail.
local cells = {}
for _, cellKey in ipairs(redis.call("SPOP", clearingKey, sliceCells)) do
  local cell = unstack(cellKey)
  if cell then
    cells[#cells + 1] = cell
  end
end
-- Écart §9.5 (JOURNAL 2026-09-28) : un pixel retiré sous une pose cachée, le stream le montrait.
if slice == "first" then
  for _, cell in ipairs(pile.listOffStreamCells()) do
    cells[#cells + 1] = cell
  end
end
publish(version, cells, "clear")
if redis.call("EXISTS", recentlyClearedKey) == 1 then
  redis.call("EXPIRE", recentlyClearedKey, recentlyClearedTtl)
end

-- 5c. La dernière tranche : ses poses signalées sont tranchées.
local isDone = redis.call("EXISTS", clearingKey) == 0
if isDone then
  settleReports(action == "clearUser" and listReportedPlacements(target) or { placement })
end
return { "moderated", version, #cells, isDone and 1 or 0 }
