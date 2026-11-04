-- Collé devant place.lua, moderate.lua et dynamic-size.lua, après pile.lua et pile-moves.lua (§5.8) :
-- la taille dynamique. `planGrowth` dit de combien une fresque grandit pour retrouver ses marges, `reframe` l'agrandit ou la resserre
-- et décale tout ce qui porte une coordonnée.

-- Les cases `cells` ({ x, y }) viennent d'être posées dans une fresque de `width` × `height` : de combien grandir, côté par côté, pour
-- garder `limits.margin` cases vides autour d'elles. Rend les cases ajoutées à gauche et en haut, puis la nouvelle taille ; rien s'il
-- n'y a rien à ajouter. Un axe au plafond (`limits.maxWidth`, `limits.maxHeight`) ne grandit plus : la gauche passe avant la droite.
local function planGrowth(cells, width, height, limits)
  local minX, maxX, minY, maxY = width, -1, height, -1
  for _, cell in ipairs(cells) do
    minX, maxX = math.min(minX, cell.x), math.max(maxX, cell.x)
    minY, maxY = math.min(minY, cell.y), math.max(maxY, cell.y)
  end
  if maxX < 0 then
    return nil
  end
  local function addedOn(low, high, length, max)
    local room = math.max(0, max - length)
    local before = math.min(math.max(0, limits.margin - low), room)
    local after = math.min(math.max(0, high + 1 + limits.margin - length), room - before)
    return before, after
  end
  local left, right = addedOn(minX, maxX, width, limits.maxWidth)
  local top, bottom = addedOn(minY, maxY, height, limits.maxHeight)
  if left + right + top + bottom == 0 then
    return nil
  end
  return left, top, width + left + right, height + top + bottom
end

-- Le nouveau cadre de `width` × `height` : la case (x, y) devient (x + dx, y + dy). Une version sans événement force un snapshot à
-- toute page qui reprend d'avant. `env` : les clés et préfixes du canvas, sa taille (`width`, `height`) et son origine (`originX`,
-- `originY`) d'avant, et le plan (`maxWidth`, `maxHeight`) où vivent toutes les piles, cadre ou non (JOURNAL 2026-11-05). Toute pile
-- du plan suit le décalage ; seule celle qui sortirait du plan est perdue. Rend la version prise.
local function reframe(env, dx, dy, width, height)
  local oldWidth, oldHeight, cellStride, histPrefix = env.width, env.height, env.cellStride, env.histPrefix
  local maxWidth, maxHeight = env.maxWidth, env.maxHeight
  local isMoving = dx ~= 0 or dy ~= 0

  local function isInPlane(x, y)
    return x >= 0 and x < maxWidth and y >= 0 and y < maxHeight
  end

  -- 1. Les piles. Chaque pile du plan suit sa case, dans l'ordre où sa cible est libre.
  local moves = openMoves()
  if isMoving then
    local fromY, toY, stepY = 0, maxHeight - 1, 1
    if dy > 0 then
      fromY, toY, stepY = maxHeight - 1, 0, -1
    end
    local fromX, toX, stepX = 0, maxWidth - 1, 1
    if dx > 0 then
      fromX, toX, stepX = maxWidth - 1, 0, -1
    end
    for y = fromY, toY, stepY do
      local movedY = y + dy
      for x = fromX, toX, stepX do
        local movedX = x + dx
        local fromCellKey = y * cellStride + x
        local entries = redis.call("LRANGE", histPrefix .. fromCellKey, 0, -1)
        if #entries > 0 then
          if isInPlane(movedX, movedY) then
            local toCellKey = movedY * cellStride + movedX
            if redis.call("RENAMENX", histPrefix .. fromCellKey, histPrefix .. toCellKey) == 0 then
              error("reframe : la case " .. toCellKey .. " a déjà une pile")
            end
            moves.noteMove(entries, fromCellKey, toCellKey)
          else
            redis.call("DEL", histPrefix .. fromCellKey)
            moves.noteDrop(entries, fromCellKey)
          end
        end
      end
    end
  end
  moves.apply(env.cellsPrefix, env.clearingPrefix)

  -- 2. L'image : chaque ligne de l'ancien cadre, décalée dans le nouveau ; une case qui n'en vient pas prend la tête de sa pile
  -- d'aujourd'hui (une pile hors du cadre qui entre dans le nouveau cadre se montre), 0 sans pile.
  local function headsFrom(first, last, y)
    local colors = {}
    for x = first, last do
      local raw = redis.call("LINDEX", histPrefix .. (y * cellStride + x), 0)
      colors[#colors + 1] = raw and parseEntry(raw).colorIndex or 0
    end
    return #colors > 0 and string.char(unpack(colors)) or ""
  end
  local oldState = redis.call("GET", env.stateKey) or ""
  local firstColumn, endColumn = math.max(0, dx), math.min(width, oldWidth + dx)
  local rows = {}
  for y = 0, height - 1 do
    local oldY = y - dy
    if oldY >= 0 and oldY < oldHeight and endColumn > firstColumn then
      rows[y + 1] = headsFrom(0, firstColumn - 1, y)
        .. string.sub(oldState, oldY * oldWidth + firstColumn - dx + 1, oldY * oldWidth + endColumn - dx)
        .. headsFrom(endColumn, width - 1, y)
    else
      rows[y + 1] = headsFrom(0, width - 1, y)
    end
  end
  redis.call("SET", env.stateKey, table.concat(rows))

  -- 3. Les preuves de ban et ce qu'un retrait vient d'ôter (`cellKey` → `colorIndex`) : leurs cases suivent aussi, et gardent leur durée.
  if isMoving then
    local function reframeHash(key)
      local flat = redis.call("HGETALL", key)
      if #flat == 0 then
        return
      end
      local ttl = redis.call("PTTL", key)
      redis.call("DEL", key)
      for index = 1, #flat, 2 do
        local cellKey = tonumber(flat[index])
        local movedX, movedY = cellKey % cellStride + dx, math.floor(cellKey / cellStride) + dy
        if isInPlane(movedX, movedY) then
          redis.call("HSET", key, movedY * cellStride + movedX, flat[index + 1])
        end
      end
      if ttl > 0 then
        redis.call("PEXPIRE", key, ttl)
      end
    end
    for _, userId in ipairs(redis.call("SMEMBERS", env.bansKey)) do
      reframeHash(env.banPrefix .. userId)
    end
    -- Un retrait récent n'existe que pour un auteur dont une pierre tombale dit qu'il a été retiré.
    local cleared, seen = {}, {}
    local function addCleared(author)
      if author and not seen[author] then
        seen[author] = true
        cleared[#cleared + 1] = author
      end
    end
    for _, author in ipairs(redis.call("HKEYS", env.clearedKey)) do
      addCleared(author)
    end
    for _, author in ipairs(redis.call("HKEYS", env.clearedRangesKey)) do
      addCleared(author)
    end
    for _, placement in ipairs(redis.call("SMEMBERS", env.clearedPlacementsKey)) do
      addCleared(string.match(placement, "^(.*):[^:]+$"))
    end
    for _, author in ipairs(cleared) do
      reframeHash(env.recentlyClearedPrefix .. author)
    end
  end

  -- 4. La taille et l'origine, puis les pages : le `ctl` part avant tout événement de la même écriture.
  local version = redis.call("INCR", env.versionKey)
  redis.call(
    "HSET",
    env.metaKey,
    "width",
    width,
    "height",
    height,
    "resizedAtVersion",
    version,
    "originX",
    env.originX + dx,
    "originY",
    env.originY + dy
  )
  redis.call("PUBLISH", env.liveChannel, cjson.encode({ ctl = { t = "resize" } }))
  return version
end
