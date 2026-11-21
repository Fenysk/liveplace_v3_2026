// CDC 2026 §8, Mode événement (JOURNAL 2026-11-20) : ce que le lecteur du worker écrit. Un don entre dans Redis une seule fois, quel que soit
// le nombre de lectures ou de lecteurs : la garde est un `HSETNX` sur son identifiant, dans le même script que son écriture.

import {
  CENTS_PER_PIXEL,
  CHARITY_DONOR_NAME_MAX_LENGTH,
  CHARITY_READ_GRACE_MS,
  parseCharityAddress,
} from "@liveplace/domain/charity-event";
import type { CharityDonationStore, CharityRead } from "@liveplace/domain/ports";
import type { Redis } from "ioredis";
import { buildCanvasKeys, buildCharityKeys, type CharityKeys } from "./keys";

// KEYS : l'événement, les dons, les dons récents, le canal de la fresque. ARGV : l'heure, la fenêtre gardée, les centimes par pixel,
// puis pour chaque don son identifiant, son nom, ses centimes, sa devise et son heure. Un don hors des dates de l'événement, ou d'un
// événement qui n'est pas actif (désactivé, inactif), n'est pas écrit. Rend le nombre de dons écrits.
const STORE = `local fields = redis.call("HMGET", KEYS[1], "startsAt", "endsAt", "active")
local startsAt, endsAt = tonumber(fields[1]), tonumber(fields[2])
if not startsAt or fields[3] ~= "1" then return 0 end
local stored = 0
for index = 4, #ARGV, 5 do
  local id, name, currency = ARGV[index], ARGV[index + 1], ARGV[index + 3]
  local cents, at = tonumber(ARGV[index + 2]), tonumber(ARGV[index + 4])
  if at >= startsAt and (not endsAt or at <= endsAt) and redis.call("HSETNX", KEYS[2], id, at) == 1 then
    local seq = redis.call("HINCRBY", KEYS[1], "donationCount", 1)
    redis.call("HINCRBY", KEYS[1], "totalCents", cents)
    redis.call("ZADD", KEYS[3], at, seq .. ":" .. cents)
    redis.call("PUBLISH", KEYS[4], cjson.encode({ ctl = {
      t = "donation", donationId = id, name = name, cents = cents, currency = currency,
      pixels = math.floor(cents / tonumber(ARGV[3])), donationCount = seq,
    } }))
    stored = stored + 1
  end
end
redis.call("ZREMRANGEBYSCORE", KEYS[3], "-inf", tonumber(ARGV[1]) - tonumber(ARGV[2]))
return stored`;

const UNLOCK = `if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) end
return 0`;

// Une heure de dons récents suffit à un compte neuf : le ZSET garde le double.
const RECENT_KEPT_MS = 2 * 3_600_000;

const toNumber = (reply: unknown): number => {
  if (typeof reply !== "number") throw new Error("réponse Redis : un nombre était attendu");
  return reply;
};

export function createCharityDonationStore(
  redis: Redis,
  charityKeys: CharityKeys = buildCharityKeys(),
): CharityDonationStore {
  const getCharityRead = async (canvasId: string): Promise<CharityRead | null> => {
    const [address, from, to, active] = await redis.hmget(
      buildCanvasKeys(canvasId).charityEvent,
      "address",
      "startsAt",
      "endsAt",
      "active",
    );
    const source = address && active === "1" ? parseCharityAddress(address) : null;
    const [startsAt, endsAt] = [Number(from), Number(to)];
    // Une fin vide s'écrit « absente » : `Number("")` vaut 0, elle ne doit pas le devenir.
    return source && from && Number.isFinite(startsAt)
      ? { canvasId, source, startsAt, ...(to && Number.isFinite(endsAt) ? { endsAt } : {}) }
      : null;
  };

  return {
    async listCharityReads(nowMs) {
      const reads: CharityRead[] = [];
      for (const canvasId of await redis.smembers(charityKeys.active)) {
        const read = await getCharityRead(canvasId);
        // Un événement disparu (fresque supprimée), désactivé, inactif, sans adresse, ou lu jusqu'à sa fin quitte l'index.
        if (!read || (read.endsAt !== undefined && nowMs >= read.endsAt + CHARITY_READ_GRACE_MS))
          await redis.srem(charityKeys.active, canvasId);
        else if (
          nowMs >= read.startsAt &&
          (await redis.hexists(buildCanvasKeys(canvasId).meta, "archivedAt")) === 0
        )
          reads.push(read);
      }
      return reads;
    },

    async storeCharityDonations(canvasId, donations, nowMs) {
      const keys = buildCanvasKeys(canvasId);
      const valid = donations.filter((donation) => donation.cents > 0 && donation.id !== "");
      if (valid.length === 0) return 0;
      return toNumber(
        await redis.eval(
          STORE,
          4,
          keys.charityEvent,
          keys.charityDonations,
          keys.charityRecent,
          keys.live,
          nowMs,
          RECENT_KEPT_MS,
          CENTS_PER_PIXEL,
          ...valid.flatMap(({ id, name, cents, currency, donatedAt }) => [
            id.slice(0, 64),
            Array.from(name).slice(0, CHARITY_DONOR_NAME_MAX_LENGTH).join(""),
            cents,
            currency.slice(0, 8),
            donatedAt,
          ]),
        ),
      );
    },

    async lockCharityRead(canvasId, holder, ttlMs) {
      return (await redis.set(buildCanvasKeys(canvasId).charityLock, holder, "PX", ttlMs, "NX")) === "OK";
    },

    async unlockCharityRead(canvasId, holder) {
      await redis.eval(UNLOCK, 1, buildCanvasKeys(canvasId).charityLock, holder);
    },
  };
}
