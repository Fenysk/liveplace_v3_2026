-- Une minute de la capacité, reportée d'un coup sur ses trois niveaux (écart §5.1, JOURNAL 2026-10-07) : le pic de la
-- saturation avec la ressource qui le portait, et le plus haut taux de chaque maillon.
-- KEYS : les HASH des minutes, des heures, des jours. ARGV : le début du point de chacun, puis saturation, position de la
-- ressource porteuse (-1 : aucune), et le taux de redis, gateway, web, machine, convex (-1 : maillon sans mesure).

local incoming = {}
for field = 1, 7 do
  incoming[field] = tonumber(ARGV[3 + field])
end

for level = 1, 3 do
  local point = { 0, -1, -1, -1, -1, -1, -1 }
  local stored = redis.call('HGET', KEYS[level], ARGV[level])
  if stored then
    local fields = { string.match(stored, '^(%-?[%d%.]+),(%-?%d+),(%-?[%d%.]+),(%-?[%d%.]+),(%-?[%d%.]+),(%-?[%d%.]+),(%-?[%d%.]+)$') }
    if #fields == 0 then
      return redis.error_reply('point illisible : ' .. stored)
    end
    for field, value in ipairs(fields) do
      point[field] = tonumber(value)
    end
  end
  -- Une ressource porteuse n'a de sens qu'avec la saturation qui l'accompagne : elles se remplacent ensemble.
  if incoming[1] > point[1] or point[2] < 0 then
    point[1] = incoming[1]
    point[2] = incoming[2]
  end
  for field = 3, 7 do
    point[field] = math.max(point[field], incoming[field])
  end
  redis.call('HSET', KEYS[level], ARGV[level], table.concat(point, ','))
end
