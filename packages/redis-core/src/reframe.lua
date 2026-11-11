-- Collé devant place.lua, moderate.lua et dynamic-size.lua, après pile.lua (§5.8) : la taille dynamique. `planGrowth` dit de combien une
-- fresque grandit pour retrouver ses marges, `reframe` l'agrandit ou la resserre en déplaçant son cadre sur la grille.

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

-- Le nouveau cadre de `width` × `height` : la case (x, y) devient (x + dx, y + dy), donc le coin recule de (dx, dy) sur la grille et
-- aucune pile ni clé ne bouge (JOURNAL 2026-11-05). Une version sans événement force un snapshot à toute page qui reprend d'avant.
-- `env` : les clés et le préfixe `histPrefix` du canvas, `cellStride`, sa taille (`width`, `height`), son origine (`originX`, `originY`)
-- et son coin (`cornerX`, `cornerY`) d'avant. Rend la version prise.
local function reframe(env, dx, dy, width, height)
  local oldWidth, oldHeight, histPrefix = env.width, env.height, env.histPrefix
  local cornerX, cornerY = env.cornerX - dx, env.cornerY - dy
  local window = openWindow(env.cellStride, cornerX, cornerY, width, height)

  -- 1. L'image : chaque ligne de l'ancien cadre, décalée dans le nouveau ; une case qui n'en vient pas prend la tête de sa pile
  -- d'aujourd'hui (une pile hors du cadre qui entre dans le nouveau cadre se montre), 0 sans pile.
  local function headsFrom(first, last, y)
    local colors = {}
    for x = first, last do
      local raw = redis.call("LINDEX", histPrefix .. window.keyOf(x, y), 0)
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

  -- 2. La taille, l'origine et le coin, puis les pages : le `ctl` part avant tout événement de la même écriture.
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
    env.originY + dy,
    "cornerX",
    cornerX,
    "cornerY",
    cornerY
  )
  redis.call("PUBLISH", env.liveChannel, cjson.encode({ ctl = { t = "resize" } }))
  return version
end
