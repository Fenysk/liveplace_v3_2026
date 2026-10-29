-- Collé devant resize.lua et reframe.lua (JOURNAL 2026-10-28) : quand une pile change de case, les ensembles `cells:` et `clearing:`
-- de ses auteurs la suivent. `parseEntry` vient de pile.lua.
-- `noteMove` et `noteDrop` retiennent, par auteur de la pile, la case quittée et celle d'arrivée ; `apply` les corrige ensuite par lots.
-- Les déplacements se notent dans l'ordre où les piles bougent, une arrivée toujours avant le départ qui libère sa case.

local function openMoves()
  local moved, dropped = {}, {}

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

  local function noteMove(entries, fromCellKey, toCellKey)
    for _, author in ipairs(authorsOf(entries)) do
      local keys = moved[author]
      if not keys then
        keys = { from = {}, to = {} }
        moved[author] = keys
      end
      keys.from[#keys.from + 1] = fromCellKey
      keys.to[#keys.to + 1] = toCellKey
    end
  end

  local function noteDrop(entries, fromCellKey)
    for _, author in ipairs(authorsOf(entries)) do
      local keys = dropped[author]
      if not keys then
        keys = {}
        dropped[author] = keys
      end
      keys[#keys + 1] = fromCellKey
    end
  end

  -- Par lots de 1000 : `unpack` ne rend pas plus de quelques milliers de valeurs. Dans l'ordre des cases, qui garantit qu'une
  -- case d'arrivée ajoutée ne sera pas relue comme une case de départ d'un lot suivant. Une case retirée est vidée de ses ensembles.
  local function apply(cellsPrefix, clearingPrefix)
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
  end

  return { noteMove = noteMove, noteDrop = noteDrop, apply = apply }
end
