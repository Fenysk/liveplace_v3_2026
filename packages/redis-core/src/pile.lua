-- Collé devant place.lua, moderate.lua, report.lua et stream-view.lua par client.ts (JOURNAL 2026-09-28) :
-- la lecture d'une pile (§5.1), les pierres tombales (D-16) et ce que montre le stream quand une pose est cachée.

-- `<userId>:<colorIndex>:<placedAt>:<version>`, puis `:<placementId>` depuis le protocole 6, lue par la fin.
-- Un pixel plus ancien a pour pose sa version. Une pose se nomme `<userId>:<placementId>` (keys.ts).
local function parseEntry(entry)
  local author, colorIndex, placedAt, version, placementId =
    string.match(entry, "^(.*):(%d+):(%d+):(%d+):(%a%w*)$")
  if not author then
    author, colorIndex, placedAt, version = string.match(entry, "^(.*):(%d+):(%d+):(%d+)$")
    placementId = version
  end
  return {
    author = author,
    colorIndex = tonumber(colorIndex),
    placedAt = tonumber(placedAt),
    version = tonumber(version),
    placementId = placementId,
    placement = author .. ":" .. placementId,
  }
end

-- §5.3 : une case hors du cadre garde sa pile, mais ne s'écrit, ne s'émet ni ne se liste.
local function isInside(cellKey, cellStride, width, height)
  local key = tonumber(cellKey)
  return key % cellStride < width and math.floor(key / cellStride) < height
end

local function toSet(members)
  local set = {}
  for _, member in ipairs(members) do
    set[member] = true
  end
  return set
end

-- `keys` : cleared, clearedPlacements, clearedRanges, offStream, histPrefix, cellsPrefix, clearingPrefix, cellStride,
-- et la taille du canvas (width, height) pour qui liste des cases visibles.
-- Chaque lecture est gardée le temps du script : l'ouvrir après avoir écrit une pierre tombale ou `offstream`.
local function openPile(keys)
  local clearedVersions, clearedRanges = {}, {}
  local clearedPlacements, offStreamPlacements
  local hasOffStream = redis.call("SCARD", keys.offStream) > 0

  local function isInRange(author, placedAt)
    if clearedRanges[author] == nil then
      local raw = redis.call("HGET", keys.clearedRanges, author)
      clearedRanges[author] = raw and cjson.decode(raw) or false
    end
    for _, range in ipairs(clearedRanges[author] or {}) do
      if placedAt >= range[1] and placedAt <= range[2] then
        return true
      end
    end
    return false
  end

  -- Une pierre tombale le couvre : son auteur retiré (jusqu'à une version), sa pose, ou une plage d'heures.
  local function isCovered(entry)
    if clearedVersions[entry.author] == nil then
      clearedVersions[entry.author] = tonumber(redis.call("HGET", keys.cleared, entry.author)) or false
    end
    local clearedVersion = clearedVersions[entry.author]
    if clearedVersion and entry.version <= clearedVersion then
      return true
    end
    clearedPlacements = clearedPlacements or toSet(redis.call("SMEMBERS", keys.clearedPlacements))
    return clearedPlacements[entry.placement] == true or isInRange(entry.author, entry.placedAt)
  end

  local function isOffStream(entry)
    if not hasOffStream then
      return false
    end
    offStreamPlacements = offStreamPlacements or toSet(redis.call("SMEMBERS", keys.offStream))
    return offStreamPlacements[entry.placement] == true
  end

  -- Ce que montre le stream : la première entrée qui n'est ni retirée ni cachée, sinon le transparent.
  local function streamHead(entries)
    for _, raw in ipairs(entries) do
      local entry = parseEntry(raw)
      if not isCovered(entry) and not isOffStream(entry) then
        return entry.colorIndex, entry.placedAt
      end
    end
    return 0, 0
  end

  -- La case vue par le stream après un changement de sa pile, seulement si elle diffère de la page. `before`, la pile
  -- d'avant, quand ses pierres tombales n'ont pas bougé : la vue OBS y revient au rechargement (§9.5, règle 3).
  local function streamCell(after, cell, before)
    if not hasOffStream then
      return nil
    end
    local colorIndex, placedAt = streamHead(after)
    local previousColorIndex = before and streamHead(before) or cell.previousColorIndex
    if colorIndex == cell.colorIndex and previousColorIndex == cell.previousColorIndex then
      return nil
    end
    return { colorIndex = colorIndex, previousColorIndex = previousColorIndex, placedAt = placedAt }
  end

  local function toCell(cellKey, head)
    local key = tonumber(cellKey)
    return {
      x = key % keys.cellStride,
      y = math.floor(key / keys.cellStride),
      colorIndex = head.colorIndex,
      previousColorIndex = head.colorIndex,
      placedAt = head.placedAt,
    }
  end

  -- Les cases où `author` est visible et où `matches` retient sa tête : au plus toutes ses cases (JOURNAL 2026-09-28).
  local function listVisibleCells(author, matches, seen, found)
    for _, cellKey in ipairs(redis.call("SUNION", keys.cellsPrefix .. author, keys.clearingPrefix .. author)) do
      local histKey = keys.histPrefix .. cellKey
      local raw = redis.call("LINDEX", histKey, 0)
      local head = raw and parseEntry(raw)
      local isListed = head and head.author == author and not seen[cellKey]
      if isListed and isInside(cellKey, keys.cellStride, keys.width, keys.height) and matches(head) then
        seen[cellKey] = true
        found[#found + 1] = { cell = toCell(cellKey, head), histKey = histKey }
      end
    end
    return found
  end

  -- Les cases visibles d'une pose, telles que la page les voit.
  local function listPlacementCells(author, placement)
    local cells = {}
    local matches = function(head)
      return head.placement == placement
    end
    for _, found in ipairs(listVisibleCells(author, matches, {}, {})) do
      cells[#cells + 1] = found.cell
    end
    return cells
  end

  -- Chaque case où une pose cachée est visible, avec ce que le stream y montre à la place.
  local function listOffStreamCells()
    local authors, seen, found = {}, {}, {}
    for _, placement in ipairs(redis.call("SMEMBERS", keys.offStream)) do
      local author = string.match(placement, "^(.*):[^:]+$")
      if not authors[author] then
        authors[author] = true
        listVisibleCells(author, isOffStream, seen, found)
      end
    end
    local cells = {}
    for _, item in ipairs(found) do
      local colorIndex, placedAt = streamHead(redis.call("LRANGE", item.histKey, 0, -1))
      item.cell.obs = { colorIndex = colorIndex, previousColorIndex = item.cell.colorIndex, placedAt = placedAt }
      cells[#cells + 1] = item.cell
    end
    return cells
  end

  return {
    hasOffStream = hasOffStream,
    isCovered = isCovered,
    isOffStream = isOffStream,
    streamHead = streamHead,
    streamCell = streamCell,
    listPlacementCells = listPlacementCells,
    listOffStreamCells = listOffStreamCells,
  }
end
