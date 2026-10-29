-- Appliquer un plan de `planResize` (domain) à un canvas : son nouvel `state`, ses piles et leurs auteurs, sa version et le `ctl`.
-- Collé devant resize.lua et dynamic-size.lua, après pile.lua et pile-moves.lua (JOURNAL 2026-09-29 ; Écart §5.3, JOURNAL 2026-10-24
-- et 2026-10-29). Le plan est supposé calculé sur la version actuelle : l'appelant a déjà relu `stale`. `env` : les clés et préfixes
-- du canvas, sa taille d'avant (`width`, `height`) et `cellStride`. `width` et `height` : la nouvelle taille. Rend la version prise.

local function applyResizePlan(env, plan, width, height)
  local metaKey, stateKey, versionKey, liveChannel = env.metaKey, env.stateKey, env.versionKey, env.liveChannel
  local histPrefix, cellsPrefix, clearingPrefix, cellStride =
    env.histPrefix, env.cellsPrefix, env.clearingPrefix, env.cellStride
  local oldWidth, oldHeight = env.width, env.height
  if plan.from.width ~= oldWidth or plan.from.height ~= oldHeight then
    error("resize : le plan ne part pas de la taille du canvas")
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
          error("resize : le pixel (" .. x .. ", " .. y .. ") n'a pas de destination")
        end
        if movedX < width and movedY < height then
          newColors[movedY * width + movedX + 1] = colorIndex
        end
      end
    end
  end

  -- 3. Les piles suivent leur case. Les déplacements vont tous vers l'origine : de gauche à droite, ligne après ligne, la cible
  -- d'une pile est libre quand son tour vient. Une case retirée est vide ; sa pile (une gomme) part avec elle. `cells:` et
  -- `clearing:` de chaque auteur de la pile suivent (pile-moves.lua).
  local moves = openMoves()
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
              error("resize : la case " .. toCellKey .. " a déjà une pile")
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
  moves.apply(cellsPrefix, clearingPrefix)

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
  if plan.hasMovedPixels then
    redis.call("HSET", metaKey, "movedAtVersion", version)
  end
  redis.call("PUBLISH", liveChannel, cjson.encode({ ctl = { t = "resize" } }))
  return version
end
