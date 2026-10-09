// Écart §4 (JOURNAL 2026-10-07) : le live Twitch de chaque compte. Le web l'écrit, le gateway le lit.

import type { AccountList, TwitchLive, TwitchLiveState, TwitchLiveStore } from "@liveplace/domain/ports";
import type { Redis } from "ioredis";
import { twitchLiveKey, userKey } from "./keys";

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

// Un SCAN par pages (jamais KEYS, qui bloquerait Redis) sur le miroir `user:`, dont la clé finit par l'identifiant.
export function createAccountList(redis: Redis): AccountList {
  const prefix = userKey("");
  return {
    async listAccountIds() {
      const userIds = new Set<string>();
      for await (const keys of redis.scanStream({ match: `${prefix}*`, count: 1000 }))
        for (const key of keys) userIds.add(key.slice(prefix.length));
      return [...userIds];
    },
  };
}

export function createTwitchLiveStore(redis: Redis): TwitchLiveStore {
  return {
    getTwitchLiveState: (userId) => getTwitchLiveState(redis, userId),

    // Un seul MULTI : l'ancienne catégorie ne survit pas à un état hors live.
    async setTwitchLiveState(userId, { twitchLive, checkedAt }) {
      const key = twitchLiveKey(userId);
      await redis
        .multi()
        .del(key)
        .hset(key, { checkedAt, ...(twitchLive ? { category: twitchLive.category } : {}) })
        .exec();
    },
  };
}
