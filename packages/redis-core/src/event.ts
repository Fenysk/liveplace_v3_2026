// CDC 2026 §8, Mode événement (JOURNAL 2026-11-20) : l'événement d'une fresque, réglé par son streamer, et le bonus que chaque compte
// réclame. Redis garde tout sous `charity` de la fresque ; les scripts font chaque transition d'un bloc, sans course entre deux gateways.

import {
  CENTS_PER_PIXEL,
  CHARITY_ADDRESS_MAX_LENGTH,
  charityInactiveReasonOf,
  LATE_ACCOUNT_CLAIM_WINDOW_MS,
  toCharityTitle,
} from "@liveplace/domain/charity-event";
import type { CharityEventRefusal, CharityEventState, EventCore, LiveMessage } from "@liveplace/domain/ports";
import type { Result } from "@liveplace/shared";
import type { Redis } from "ioredis";
import { buildCanvasKeys, buildCharityKeys, type CharityKeys, userKey } from "./keys";

// KEYS : l'événement, l'index des fresques à lire, les dons, la fenêtre des dons récents, les réclamations. ARGV : la fresque, 1 si le
// switch est activé, le titre, l'adresse (vide : aucune), le début et la fin (vides : aucun ; une fin vide efface la précédente), 1 si
// l'événement est actif, 1 si le dessin n'est ouvert aux viewers que pendant l'événement. Un autre début
// remet l'événement à zéro (dons, fil, réclamations, compteurs) ; le même début, même après un arrêt, garde tout. Seule une fresque
// active (activée, titre, dates, adresse valide) entre dans l'index : le worker ne lit rien d'autre.
const SET = `local previous = redis.call("HGET", KEYS[1], "startsAt") or ""
if previous ~= ARGV[5] then
  redis.call("DEL", KEYS[3], KEYS[4], KEYS[5])
  redis.call("HSET", KEYS[1], "donationCount", 0, "totalCents", 0)
end
redis.call("HSET", KEYS[1], "isEnabled", ARGV[2], "title", ARGV[3], "address", ARGV[4], "startsAt", ARGV[5], "endsAt", ARGV[6], "active", ARGV[7], "isEventOnly", ARGV[8])
redis.call("HSETNX", KEYS[1], "donationCount", 0)
redis.call("HSETNX", KEYS[1], "totalCents", 0)
if ARGV[7] == "1" then redis.call("SADD", KEYS[2], ARGV[1]) else redis.call("SREM", KEYS[2], ARGV[1]) end
return "ok"`;

// KEYS : l'événement, les réclamations, les dons récents, le miroir du compte, les bannis, la progression. ARGV : le compte, l'heure,
// la fenêtre d'un compte neuf, les centimes par pixel, 1 pour réclamer. Sans fin, le bonus reste réclamable tant que l'événement est actif. Rend { pixels en attente (ou réclamés), réserve }.
// Un compte d'avant l'événement attend la différence entre les pixels du total des dons et ceux du total déjà réclamé (arrondis chacun
// vers le bas : aucun centime perdu entre deux réclamations) ; un compte créé après son début compte les dons de la dernière heure
// qu'il n'a pas réclamés, arrondis vers le bas.
const BONUS = `local userId, now, window, centsPerPixel = ARGV[1], tonumber(ARGV[2]), tonumber(ARGV[3]), tonumber(ARGV[4])
local fields = redis.call("HMGET", KEYS[1], "startsAt", "endsAt", "donationCount", "totalCents", "active")
local startsAt, endsAt = tonumber(fields[1]), tonumber(fields[2])
if fields[5] ~= "1" or not startsAt or now < startsAt or (endsAt and now >= endsAt) or redis.call("SISMEMBER", KEYS[5], userId) == 1 then
  return { 0, 0 }
end
local count, total = tonumber(fields[3]), tonumber(fields[4])
local claimedCount, claimedTotal = string.match(redis.call("HGET", KEYS[2], userId) or "0:0", "^(%d+):(%d+)$")
claimedCount, claimedTotal = tonumber(claimedCount), tonumber(claimedTotal)
local createdAt = tonumber(redis.call("HGET", KEYS[4], "createdAt"))
local pixels = math.floor(total / centsPerPixel) - math.floor(claimedTotal / centsPerPixel)
if createdAt and createdAt > startsAt then
  local cents = 0
  for _, member in ipairs(redis.call("ZRANGEBYSCORE", KEYS[3], now - window, "+inf")) do
    local seq, donated = string.match(member, "^(%d+):(%d+)$")
    if tonumber(seq) > claimedCount then cents = cents + tonumber(donated) end
  end
  pixels = math.floor(cents / centsPerPixel)
end
if ARGV[5] ~= "1" or pixels == 0 then
  return { pixels, tonumber(redis.call("HGET", KEYS[6], "reserve")) or 0 }
end
local reserve = redis.call("HINCRBY", KEYS[6], "reserve", pixels)
redis.call("HSET", KEYS[2], userId, count .. ":" .. total)
return { pixels, reserve }`;

// Une date absente s'écrit vide.
const dateText = (ms: number | undefined): string => (ms === undefined ? "" : String(ms));

const toReply = (reply: unknown): string => {
  if (typeof reply !== "string") throw new Error("réponse Redis : un texte était attendu");
  return reply;
};

const toPixels = (reply: unknown): number => {
  const pixels = Array.isArray(reply) ? reply[0] : undefined;
  if (typeof pixels !== "number") throw new Error("réponse Redis : un nombre de pixels était attendu");
  return pixels;
};

const stateOf = (fields: Record<string, string>): CharityEventState | undefined => {
  if (fields.isEnabled === undefined) return undefined;
  const [startsAt, endsAt] = [Number(fields.startsAt), Number(fields.endsAt)];
  return {
    isEnabled: fields.isEnabled === "1",
    title: fields.title ?? "",
    ...(fields.address ? { address: fields.address } : {}),
    ...(fields.startsAt && Number.isFinite(startsAt) ? { startsAt } : {}),
    ...(fields.endsAt && Number.isFinite(endsAt) ? { endsAt } : {}),
    ...(fields.isEventOnly === "1" ? { isEventOnly: true } : {}),
    donationCount: Number(fields.donationCount ?? 0),
  };
};

export function createEventCore(redis: Redis, charityKeys: CharityKeys = buildCharityKeys()): EventCore {
  const getState = async (canvasId: string): Promise<CharityEventState | undefined> =>
    stateOf(await redis.hgetall(buildCanvasKeys(canvasId).charityEvent));

  const publish = async (canvasId: string, state: CharityEventState | undefined): Promise<void> => {
    const message: LiveMessage = { ctl: { t: "charityEvent", ...(state ? { state } : {}) } };
    await redis.publish(buildCanvasKeys(canvasId).live, JSON.stringify(message));
  };

  // Après un réglage : l'état tel que Redis le garde, publié aux pages ouvertes, et rendu à celui qui l'a réglé.
  const announce = async (canvasId: string): Promise<Result<CharityEventState, CharityEventRefusal>> => {
    const state = await getState(canvasId);
    if (!state) return { ok: false, error: "charity_event_unavailable" };
    await publish(canvasId, state);
    return { ok: true, value: state };
  };

  const bonus = async (
    canvasId: string,
    userId: string,
    nowMs: number,
    isClaim: boolean,
  ): Promise<number> => {
    const keys = buildCanvasKeys(canvasId);
    return toPixels(
      await redis.eval(
        BONUS,
        6,
        keys.charityEvent,
        keys.charityClaims,
        keys.charityRecent,
        userKey(userId),
        keys.bans,
        keys.progress(userId),
        userId,
        nowMs,
        LATE_ACCOUNT_CLAIM_WINDOW_MS,
        CENTS_PER_PIXEL,
        isClaim ? 1 : 0,
      ),
    );
  };

  return {
    async getCharityEvent(canvasId) {
      const state = await getState(canvasId);
      return state ? { state } : {};
    },

    async setCharityEvent(canvasId, setting) {
      const title = toCharityTitle(setting.title);
      const address = (setting.address ?? "").trim().slice(0, CHARITY_ADDRESS_MAX_LENGTH);
      const isActive = setting.isEnabled && charityInactiveReasonOf({ ...setting, title, address }) === null;
      const keys = buildCanvasKeys(canvasId);
      toReply(
        await redis.eval(
          SET,
          5,
          keys.charityEvent,
          charityKeys.active,
          keys.charityDonations,
          keys.charityRecent,
          keys.charityClaims,
          canvasId,
          setting.isEnabled ? "1" : "0",
          title,
          address,
          dateText(setting.startsAt),
          dateText(setting.endsAt),
          isActive ? "1" : "0",
          setting.isEventOnly ? "1" : "0",
        ),
      );
      return announce(canvasId);
    },

    getCharityBonus: async (canvasId, userId, nowMs) => bonus(canvasId, userId, nowMs, false),

    claimCharityBonus: async (canvasId, userId, nowMs) => bonus(canvasId, userId, nowMs, true),
  };
}
