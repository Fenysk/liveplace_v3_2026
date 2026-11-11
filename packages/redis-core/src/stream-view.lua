-- Les cases où le stream montre autre chose que la page (JOURNAL 2026-09-28) : le snapshot d'une vue OBS qui arrive.
-- Lecture seule. Ordre des KEYS et ARGV : client.ts. `openPile` et `openWindow` viennent de pile.lua.

local meta = redis.call("HMGET", KEYS[5], "width", "height", "cornerX", "cornerY")
local pile = openPile({
  cleared = KEYS[1],
  clearedPlacements = KEYS[2],
  clearedRanges = KEYS[3],
  offStream = KEYS[4],
  histPrefix = ARGV[1],
  cellsPrefix = ARGV[2],
  clearingPrefix = ARGV[3],
  window = openWindow(tonumber(ARGV[4]), tonumber(meta[3]) or 0, tonumber(meta[4]) or 0, tonumber(meta[1]), tonumber(meta[2])),
})

-- À plat, `x, y, colorIndex` par case : ce que le stream y montre.
local flat = {}
for _, cell in ipairs(pile.listOffStreamCells()) do
  flat[#flat + 1] = cell.x
  flat[#flat + 1] = cell.y
  flat[#flat + 1] = cell.obs.colorIndex
end
return flat
