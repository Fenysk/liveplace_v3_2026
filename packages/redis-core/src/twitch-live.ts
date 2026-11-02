// §10.4 : le live Twitch de chaque compte. Le web l'écrit, le gateway le lit.

import type { AccountList, TwitchLive, TwitchLiveState, TwitchLiveStore } from "@liveplace/domain/ports";
import type { Redis } from "ioredis";
import { deletedAccountGuardKeys, IS_DELETED_ACCOUNT_LUA } from "./deleted-accounts";
import { TWITCH_COMMANDS_KEY, TWITCH_COMMANDS_MAXLEN, twitchLiveKey, userKey } from "./keys";

// `category` présent : en live, même vide. Sans `checkedAt`, la clé n'est pas la nôtre : aucun état.
export async function getTwitchLiveState(redis: Redis, userId: string): Promise<TwitchLiveState | null> {
  const { category, checkedAt } = await redis.hgetall(twitchLiveKey(userId));
  if (checkedAt === undefined) return null;
  return { ...(category === undefined ? {} : { twitchLive: { category } }), checkedAt: Number(checkedAt) };
}

// Un seul aller-retour : le champ `category` de chacun, présent seulement pour qui est en live.
export async function listTwitchLives(
  redis: Redis,
  userIds: readonly string[],
): Promise<Map<string, TwitchLive>> {
  const lives = new Map<string, TwitchLive>();
  if (userIds.length === 0) return lives;
  const pipeline = redis.pipeline();
  for (const userId of userIds) pipeline.hget(twitchLiveKey(userId), "category");
  const replies = (await pipeline.exec()) ?? [];
  userIds.forEach((userId, index) => {
    const [error, category] = replies[index] ?? [null, null];
    if (error) throw error;
    if (typeof category === "string") lives.set(userId, { category });
  });
  return lives;
}

// Un compte supprimé n'a plus d'état de live à écrire (JOURNAL 2026-11-02) : un suivi parti avant l'effacement et revenu après ne
// recrée ni `twitch:live:<userId>` ni l'action qui le dit au gateway. Un seul script : la garde, l'état et l'action ne laissent pas
// l'effacement passer entre eux. KEYS : l'état de live, les trois clés de la garde, la file des actions ; ARGV : le compte, l'heure
// de vérification, la taille de la file, l'action en JSON (vide : aucune), puis la catégorie si le compte est en live.
const SET_LIVE_STATE = `${IS_DELETED_ACCOUNT_LUA}
if isDeletedAccount(ARGV[1], KEYS[2], KEYS[3], KEYS[4]) then
  return 0
end
redis.call("DEL", KEYS[1])
if ARGV[5] then
  redis.call("HSET", KEYS[1], "checkedAt", ARGV[2], "category", ARGV[5])
else
  redis.call("HSET", KEYS[1], "checkedAt", ARGV[2])
end
if ARGV[4] ~= "" then
  redis.call("XADD", KEYS[5], "MAXLEN", "~", ARGV[3], "*", "c", ARGV[4])
end
return 1`;

// Un SCAN par pages (jamais KEYS, qui bloquerait Redis) sur le miroir `user:`, dont la clé finit par l'identifiant.
export function createAccountList(redis: Redis, secret: string): AccountList {
  const prefix = userKey("");
  return {
    async listAccountIds() {
      const userIds = new Set<string>();
      for await (const keys of redis.scanStream({ match: `${prefix}*`, count: 1000 }))
        for (const key of keys) userIds.add(key.slice(prefix.length));
      return [...userIds];
    },

    async isDeletedAccount(userId) {
      const [pendingKey, fingerprintKey, mirrorKey] = deletedAccountGuardKeys(secret, userId);
      return (
        (await redis.eval(
          `${IS_DELETED_ACCOUNT_LUA}
return isDeletedAccount(ARGV[1], KEYS[1], KEYS[2], KEYS[3]) and 1 or 0`,
          3,
          pendingKey,
          fingerprintKey,
          mirrorKey,
          userId,
        )) === 1
      );
    },
  };
}

// `secret` : celui des sessions, dont l'empreinte d'un compte supprimé découle (deleted-accounts.ts).
export function createTwitchLiveStore(redis: Redis, secret: string): TwitchLiveStore {
  return {
    getTwitchLiveState: (userId) => getTwitchLiveState(redis, userId),

    // L'ancienne catégorie ne survit pas à un état hors live. Faux : le compte est supprimé, ni état ni action n'est écrit.
    async setTwitchLiveState(userId, { twitchLive, checkedAt }, announce) {
      const written = await redis.eval(
        SET_LIVE_STATE,
        5,
        twitchLiveKey(userId),
        ...deletedAccountGuardKeys(secret, userId),
        TWITCH_COMMANDS_KEY,
        userId,
        checkedAt,
        TWITCH_COMMANDS_MAXLEN,
        announce ? JSON.stringify(announce) : "",
        ...(twitchLive ? [twitchLive.category] : []),
      );
      return written === 1;
    },
  };
}
