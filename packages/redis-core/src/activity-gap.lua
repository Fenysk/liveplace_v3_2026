-- Les minutes d'une coupure de moins de 5 minutes, comblées d'un coup (écart §5.1, JOURNAL 2026-10-08) : le canvas compte comme
-- streamé (une vue OBS) ou en live (une minute en live) dans chacune. Le point du canvas dit si la minute était déjà comptée :
-- sinon le script la rejoue sans dégât. Pour tout LivePlace, le canvas s'ajoute à une minute qui existe, jamais là où le serveur
-- était arrêté ; l'heure et le jour prennent le pic de la minute comblée.
-- KEYS : les HASH des minutes, des heures, des jours de tout LivePlace, puis ceux du canvas.
-- ARGV : 'streamed' ou 'live', puis pour chaque minute comblée son début, celui de son heure et celui de son jour.
-- Un point est `people,streamed,pixels,visits,phoneVisits,visitMinutes,live` : la même lecture que activity.lua.

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

-- Le deuxième champ de la minute d'un canvas est ses vues OBS, le septième ses minutes en live.
local counted = 7
if ARGV[1] == 'streamed' then
  counted = 2
end

for minute = 0, (#ARGV - 1) / 3 - 1 do
  local starts = { ARGV[2 + 3 * minute], ARGV[3 + 3 * minute], ARGV[4 + 3 * minute] }
  local canvas = read(KEYS[4], starts[1])
  if canvas[counted] == 0 then
    canvas[counted] = 1
    write(KEYS[4], starts[1], canvas)
    for level = 2, 3 do
      local point = read(KEYS[3 + level], starts[level])
      if counted == 2 then
        point[2] = math.max(point[2], 1)
      else
        point[7] = point[7] + 1
      end
      write(KEYS[3 + level], starts[level], point)
    end
    local global, exists = read(KEYS[1], starts[1])
    if exists then
      global[counted] = global[counted] + 1
      write(KEYS[1], starts[1], global)
      for level = 2, 3 do
        local point = read(KEYS[level], starts[level])
        point[counted] = math.max(point[counted], global[counted])
        write(KEYS[level], starts[level], point)
      end
    end
  end
end
