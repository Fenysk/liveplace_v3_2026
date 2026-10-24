-- Changer la taille d'un canvas (JOURNAL 2026-09-29), en rapprochant les dessins avant de couper (Écart §5.3, JOURNAL 2026-10-24).
-- Le plan vient de `planResize` (domain) ; ici il s'applique d'un coup, si la version lue pour le calculer n'a pas bougé.
-- Ordre des KEYS et ARGV : client.ts. `parseEntry` vient de pile.lua.

local metaKey, stateKey, versionKey = KEYS[1], KEYS[2], KEYS[3]
local histPrefix, liveChannel, by = ARGV[1], ARGV[2], ARGV[3]
local width, height, cellStride = tonumber(ARGV[4]), tonumber(ARGV[5]), tonumber(ARGV[6])
local cellsPrefix, clearingPrefix = ARGV[7], ARGV[8]
local expectedVersion, hasMovedPixels, planJson = tonumber(ARGV[9]), ARGV[10] == "1", ARGV[11]

-- 0. Canvas prêt, et le streamer seul. Le gateway vérifie aussi. Écart §15 (JOURNAL 2026-10-06) : une archive ne reçoit plus rien.
local meta = redis.call("HMGET", metaKey, "ready", "ownerId", "width", "height", "archivedAt")
if meta[1] ~= "1" then
  return { "canvas_not_found" }
end
if meta[5] then
  return { "canvas_archived" }
end
if by ~= meta[2] then
  return { "forbidden" }
end
local oldWidth, oldHeight = tonumber(meta[3]), tonumber(meta[4])
if width == oldWidth and height == oldHeight then
  return { "resized", tonumber(redis.call("GET", versionKey)) or 0 }
end

-- 1. Le plan a été calculé sur une version : une pose ou une modération depuis, et il est périmé. Le client relit.
if (tonumber(redis.call("GET", versionKey)) or 0) ~= expectedVersion then
  return { "stale" }
end
local plan = cjson.decode(planJson)
if plan.from.width ~= oldWidth or plan.from.height ~= oldHeight then
  return redis.error_reply("resize : le plan ne part pas de la taille du canvas")
end
local widthBands, widthMaps, heightBands, heightMaps =
  plan.width.bandOf, plan.width.maps, plan.height.bandOf, plan.height.maps

-- Où va la case (x, y) : sa nouvelle place, ou rien si sa colonne ou sa ligne est retirée (elle est alors vide).
local function target(x, y)
  local movedX = x
  local widthBand = widthBands[y + 1]
  if widthBand >= 0 then
    movedX = widthMaps[widthBand + 1][x + 1]
  end
  if movedX < 0 then
    return nil
  end
  local movedY = y
  local heightBand = heightBands[movedX + 1]
  if heightBand >= 0 then
    movedY = heightMaps[heightBand + 1][y + 1]
  end
  if movedY < 0 then
    return nil
  end
  return movedX, movedY
end

-- 2. Le nouveau `state`, d'après l'ancien et le plan, avant d'écrire quoi que ce soit : un pixel posé sans destination arrête tout.
local oldState = redis.call("GET", stateKey) or ""
local newColors = {}
for y = 0, oldHeight - 1 do
  for x = 0, oldWidth - 1 do
    local colorIndex = string.byte(oldState, y * oldWidth + x + 1) or 0
    if colorIndex ~= 0 then
      local movedX, movedY = target(x, y)
      if not movedX then
        return redis.error_reply("resize : le pixel (" .. x .. ", " .. y .. ") n'a pas de destination")
      end
      if movedX < width and movedY < height then
        newColors[movedY * width + movedX + 1] = colorIndex
      end
    end
  end
end

-- 3. Les piles suivent leur case. Les déplacements vont tous vers l'origine : de gauche à droite, ligne après ligne, la cible
-- d'une pile est libre quand son tour vient. Une case retirée est vide ; sa pile (une gomme) part avec elle. `cells:` et
-- `clearing:` de chaque auteur de la pile suivent, notés ici et corrigés plus bas par lots.
local function authorsOf(entries)
  local authors, seen = {}, {}
  for _, raw in ipairs(entries) do
    local author = parseEntry(raw).author
    if not seen[author] then
      seen[author] = true
      authors[#authors + 1] = author
    end
  end
  return authors
end

local moved, dropped = {}, {}
local function noteMove(authors, fromCellKey, toCellKey)
  for _, author in ipairs(authors) do
    local keys = moved[author]
    if not keys then
      keys = { from = {}, to = {} }
      moved[author] = keys
    end
    keys.from[#keys.from + 1] = fromCellKey
    keys.to[#keys.to + 1] = toCellKey
  end
end

local function noteDrop(authors, fromCellKey)
  for _, author in ipairs(authors) do
    local keys = dropped[author]
    if not keys then
      keys = {}
      dropped[author] = keys
    end
    keys[#keys + 1] = fromCellKey
  end
end

for y = 0, oldHeight - 1 do
  for x = 0, oldWidth - 1 do
    local movedX, movedY = target(x, y)
    if movedX ~= x or movedY ~= y then
      local fromCellKey = y * cellStride + x
      local entries = redis.call("LRANGE", histPrefix .. fromCellKey, 0, -1)
      if #entries > 0 then
        if movedX then
          local toCellKey = movedY * cellStride + movedX
          if redis.call("RENAMENX", histPrefix .. fromCellKey, histPrefix .. toCellKey) == 0 then
            return redis.error_reply("resize : la case " .. toCellKey .. " a déjà une pile")
          end
          noteMove(authorsOf(entries), fromCellKey, toCellKey)
        else
          redis.call("DEL", histPrefix .. fromCellKey)
          noteDrop(authorsOf(entries), fromCellKey)
        end
      end
    end
  end
end

-- Par lots de 1000 : `unpack` ne rend pas plus de quelques milliers de valeurs. Dans l'ordre des cases, qui garantit qu'une
-- case d'arrivée ajoutée ne sera pas relue comme une case de départ d'un lot suivant (une arrivée précède toujours son départ).
local BATCH = 1000
for _, prefix in ipairs({ cellsPrefix, clearingPrefix }) do
  for author, keys in pairs(moved) do
    local set = prefix .. author
    for first = 1, #keys.from, BATCH do
      local last = math.min(first + BATCH - 1, #keys.from)
      local isMember = redis.call("SMISMEMBER", set, unpack(keys.from, first, last))
      local fromCellKeys, toCellKeys = {}, {}
      for offset, flag in ipairs(isMember) do
        if flag == 1 then
          fromCellKeys[#fromCellKeys + 1] = keys.from[first + offset - 1]
          toCellKeys[#toCellKeys + 1] = keys.to[first + offset - 1]
        end
      end
      if #fromCellKeys > 0 then
        redis.call("SREM", set, unpack(fromCellKeys))
        redis.call("SADD", set, unpack(toCellKeys))
      end
    end
  end
  for author, keys in pairs(dropped) do
    for first = 1, #keys, BATCH do
      redis.call("SREM", prefix .. author, unpack(keys, first, math.min(first + BATCH - 1, #keys)))
    end
  end
end

-- 4. `state` d'un coup, ligne par ligne : l'ancien là où il reste dans le cadre, les piles gardées ailleurs, comme avant.
local function headColor(x, y)
  local raw = redis.call("LINDEX", histPrefix .. (y * cellStride + x), 0)
  return raw and parseEntry(raw).colorIndex or 0
end

local rows = {}
for y = 0, height - 1 do
  local colors = {}
  for x = 0, width - 1 do
    local colorIndex = newColors[y * width + x + 1]
    if not colorIndex then
      colorIndex = (x >= oldWidth or y >= oldHeight) and headColor(x, y) or 0
    end
    colors[x + 1] = colorIndex
  end
  rows[y + 1] = string.char(unpack(colors))
end
redis.call("SET", stateKey, table.concat(rows))

-- 5. Une version sans événement : le trou force un snapshot à toute reprise d'avant la nouvelle taille. Les pages en
-- tirent aussi si des pixels ont bougé (`movedAtVersion`).
local version = redis.call("INCR", versionKey)
redis.call("HSET", metaKey, "width", width, "height", height, "resizedAtVersion", version)
if hasMovedPixels then
  redis.call("HSET", metaKey, "movedAtVersion", version)
end
redis.call("PUBLISH", liveChannel, cjson.encode({ ctl = { t = "resize" } }))
return { "resized", version }
