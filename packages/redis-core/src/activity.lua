-- Une minute de l'activité, reportée d'un coup sur ses trois niveaux (écart §5.1, JOURNAL 2026-10-06) : le pic des
-- personnes et des canvas streamés, la somme des pixels. Les nouveaux comptes ont leur propre champ, écrit par le web.
-- KEYS : les HASH des minutes, des heures, des jours. ARGV : le début du point de chacun, puis people, streamed, pixels.

local people, streamed, pixels = tonumber(ARGV[4]), tonumber(ARGV[5]), tonumber(ARGV[6])

for level = 1, 3 do
  local stored = redis.call('HGET', KEYS[level], ARGV[level])
  local peakPeople, peakStreamed, sum = 0, 0, 0
  if stored then
    local storedPeople, storedStreamed, storedPixels = string.match(stored, '^(%d+),(%d+),(%d+)$')
    peakPeople, peakStreamed, sum = tonumber(storedPeople), tonumber(storedStreamed), tonumber(storedPixels)
  end
  local point = math.max(peakPeople, people) .. ',' .. math.max(peakStreamed, streamed) .. ',' .. (sum + pixels)
  redis.call('HSET', KEYS[level], ARGV[level], point)
end
