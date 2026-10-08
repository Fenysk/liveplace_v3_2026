-- Une minute de l'activité, reportée d'un coup sur ses trois niveaux (écart §5.1, JOURNAL 2026-10-06, 2026-10-07 et 2026-10-08) : le
-- pic des personnes et des canvas streamés, la somme des pixels, des visites, des visites au téléphone et du temps passé. Les
-- canvas en live sont un pic pour tout LivePlace, une somme de minutes pour un canvas. Les nouveaux comptes et les distincts
-- ont leur propre champ, écrit par le web et par le gateway. Le même script écrit les points d'un canvas (JOURNAL 2026-10-07) :
-- le deuxième pic y est celui de ses vues OBS.
-- KEYS : les HASH des minutes, des heures, des jours. ARGV : le début du point de chacun, puis people, streamed, pixels,
-- visits, phoneVisits, visitMinutes, live, et 'peak' ou 'sum' pour live. Un point d'avant l'audience n'a que les trois premiers
-- champs, un point d'avant le live les six premiers : les autres valent 0.

local incoming = {}
for field = 1, 7 do
  incoming[field] = tonumber(ARGV[3 + field])
end
local isLiveSum = ARGV[11] == 'sum'

for level = 1, 3 do
  local point = { 0, 0, 0, 0, 0, 0, 0 }
  local stored = redis.call('HGET', KEYS[level], ARGV[level])
  if stored then
    local fields = { string.match(stored, '^(%d+),(%d+),(%d+),(%d+),(%d+),(%d+),(%d+)$') }
    if #fields == 0 then
      fields = { string.match(stored, '^(%d+),(%d+),(%d+),(%d+),(%d+),(%d+)$') }
    end
    if #fields == 0 then
      fields = { string.match(stored, '^(%d+),(%d+),(%d+)$') }
    end
    if #fields == 0 then
      return redis.error_reply('point illisible : ' .. stored)
    end
    for field, value in ipairs(fields) do
      point[field] = tonumber(value)
    end
  end
  -- Les deux premiers champs sont des pics, les quatre suivants des sommes.
  point[1] = math.max(point[1], incoming[1])
  point[2] = math.max(point[2], incoming[2])
  for field = 3, 6 do
    point[field] = point[field] + incoming[field]
  end
  if isLiveSum then
    point[7] = point[7] + incoming[7]
  else
    point[7] = math.max(point[7], incoming[7])
  end
  redis.call('HSET', KEYS[level], ARGV[level], table.concat(point, ','))
end
