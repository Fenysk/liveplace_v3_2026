// Écart §5.4 (JOURNAL 2026-10-08) : un modérateur nommé ici ne se bannit plus ; ceux que le bug avait laissés bannis perdent ce
// rôle, au démarrage du gateway. Idempotent : sans banni nommé ici, rien ne s'écrit.

import type { Redis } from "ioredis";
import { buildCanvasKeys } from "./keys";

const SCAN_COUNT = 500;
const CANVAS_ID_OF_KEY = /^cv:(.+):mods:liveplace$/;

// KEYS : `bans`, `mods:liveplace`, `mods:twitch`, `mods` ; ARGV : le canal `live`. `mods` garde qui Twitch nomme encore.
// Même `ctl` `role` que moderators.lua : les sockets de la personne relisent son rôle.
const REVOKE = `
local revoked = redis.call("SINTER", KEYS[2], KEYS[1])
for _, userId in ipairs(revoked) do
  redis.call("SREM", KEYS[2], userId)
  if redis.call("SISMEMBER", KEYS[3], userId) == 0 then
    redis.call("SREM", KEYS[4], userId)
  end
  redis.call("PUBLISH", ARGV[1], cjson.encode({ ctl = { t = "role", userId = userId } }))
end
return #revoked`;

// Un SCAN par pages (jamais KEYS, qui bloquerait Redis) sur les ensembles `mods:liveplace`, un par canvas qui en a. Les
// archives aussi : leurs modérateurs et leurs bannis sont de toute façon remplacés à leur réouverture. `canvasIdPattern`
// restreint le balayage (un test ne touche que ses canvas). Rend le nombre de rôles retirés.
export async function revokeBannedModerators(redis: Redis, canvasIdPattern = "*"): Promise<number> {
  let revoked = 0;
  for await (const names of redis.scanStream({
    match: buildCanvasKeys(canvasIdPattern).modsLiveplace,
    count: SCAN_COUNT,
  }))
    for (const name of names) {
      const canvasId = CANVAS_ID_OF_KEY.exec(name)?.[1];
      if (canvasId === undefined) continue;
      const keys = buildCanvasKeys(canvasId);
      revoked += Number(
        await redis.eval(REVOKE, 4, keys.bans, keys.modsLiveplace, keys.modsTwitch, keys.mods, keys.live),
      );
    }
  return revoked;
}
