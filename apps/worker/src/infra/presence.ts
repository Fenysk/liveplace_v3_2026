// Un seul worker, et sa santé (§7.5, Écart §11.5 JOURNAL 2026-10-06) : un bail dans Redis, et un battement.

import type { Redis } from "ioredis";

export const LEASE_KEY = "worker:lease";
export const HEARTBEAT_KEY = "worker:heartbeat";
export const LEASE_TTL_MS = 30_000; // un worker mort sans rendre son bail laisse la place au bout de ce temps
const HEARTBEAT_TTL_SECONDS = 30;

// Comparer puis agir, en un seul appel : un bail repris par un autre ne se prolonge ni ne se rend. Un bail que personne ne tient
// (Redis a tout perdu) se reprend : le worker ne s'arrête pas au moment où il doit remettre les canvas.
const RENEW = `local holder = redis.call("GET", KEYS[1])
if holder == ARGV[1] then return redis.call("PEXPIRE", KEYS[1], ARGV[2]) end
if not holder then redis.call("SET", KEYS[1], ARGV[1], "PX", ARGV[2]) return 1 end
return 0`;
const RELEASE = `if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) end return 0`;

export function createPresence(redis: Redis, owner: string) {
  return {
    // Vrai si ce worker tient le bail ; faux si un autre le tient.
    async claim(): Promise<boolean> {
      return (await redis.set(LEASE_KEY, owner, "PX", LEASE_TTL_MS, "NX")) === "OK";
    },

    // Prolonge le bail et prouve que la boucle tourne. Faux : le bail est perdu, ce worker doit s'arrêter.
    async keep(nowMs: number): Promise<boolean> {
      const isOwner = (await redis.eval(RENEW, 1, LEASE_KEY, owner, LEASE_TTL_MS)) === 1;
      if (isOwner) await redis.set(HEARTBEAT_KEY, nowMs, "EX", HEARTBEAT_TTL_SECONDS);
      return isOwner;
    },

    async leave(): Promise<void> {
      await redis.eval(RELEASE, 1, LEASE_KEY, owner);
    },
  };
}
