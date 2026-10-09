-- Les minutes d'une coupure de moins de 5 minutes, comblées d'un coup (écart §5.1, JOURNAL 2026-10-08) : le canvas compte comme
-- streamé dans chacune. Le point du canvas dit si la minute était déjà comptée : sinon le script la rejoue sans dégât. Pour tout
-- LivePlace, le canvas s'ajoute à une minute qui existe, jamais là où le serveur était arrêté ; l'heure et le jour prennent le
-- pic de la minute comblée.
-- KEYS : les HASH des minutes, des heures, des jours de tout LivePlace, puis ceux du canvas.
-- ARGV : pour chaque minute comblée son début, celui de son heure et celui de son jour.
-- Un point est `people,streamed,pixels,visits,phoneVisits,visitMinutes,live` : la même lecture que activity.lua. L'état
-- streamé de tout LivePlace est écrit dans les deux champs `streamed` et `live` ; pour un canvas, le septième est la somme de ses
-- minutes streamées.

local function read(key, field)
  local point = { 0, 0, 0, 0, 0, 0, 0 }
  local stored = redis.call('HGET', key, field)
  if not stored then
    return point, false
  end
  local fields = { string.match(stored, '^(%d+),(%d+),(%d+),(%d+),(%d+),(%d+),(%d+)$') }
  if #fields == 0 then
    fields = { string.match(stored, '^(%d+),(%d+),(%d+),(%d+),(%d+),(%d+)$') }
  end
  if #fields == 0 then
    fields = { string.match(stored, '^(%d+),(%d+),(%d+)$') }
  end
  if #fields == 0 then
    error('point illisible : ' .. stored)
  end
  for index, value in ipairs(fields) do
    point[index] = tonumber(value)
  end
  return point, true
end

local function write(key, field, point)
  redis.call('HSET', key, field, table.concat(point, ','))
end

for minute = 0, #ARGV / 3 - 1 do
  local starts = { ARGV[1 + 3 * minute], ARGV[2 + 3 * minute], ARGV[3 + 3 * minute] }
  local canvas = read(KEYS[4], starts[1])
  if canvas[7] == 0 then
    canvas[7] = 1
    write(KEYS[4], starts[1], canvas)
    for level = 2, 3 do
      local point = read(KEYS[3 + level], starts[level])
      point[7] = point[7] + 1
      write(KEYS[3 + level], starts[level], point)
    end
    local global, exists = read(KEYS[1], starts[1])
    if exists then
      global[2] = global[2] + 1
      global[7] = global[7] + 1
      write(KEYS[1], starts[1], global)
      for level = 2, 3 do
        local point = read(KEYS[level], starts[level])
        point[2] = math.max(point[2], global[2])
        point[7] = math.max(point[7], global[7])
        write(KEYS[level], starts[level], point)
      end
    end
  end
end
