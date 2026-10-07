// La pyramide de l'historique, la même pour l'activité et la capacité (écart §5.1, JOURNAL 2026-10-06 et 2026-10-07) : un point
// par minute, par heure, par jour de Paris, chacun dans un HASH dont le champ est le début du point.

import type { Timestamp } from "@liveplace/domain";
import type { ChainableCommander, Redis } from "ioredis";

// §5.1 : 24 h d'un point par minute, 30 jours d'un point par heure.
export const DAY_MINUTES = 1440;
export const MONTH_HOURS = 720;

// Un MULTI ne lève pas pour une commande refusée : ioredis la rend à sa place.
export const execAll = async (transaction: ChainableCommander): Promise<void> => {
  for (const [error] of (await transaction.exec()) ?? []) if (error) throw error;
};

// Les débuts, du plus ancien au plus récent, de `count` points espacés de `stepMs` jusqu'à `lastAt`.
export const pointStarts = (lastAt: Timestamp, stepMs: number, count: number): Timestamp[] =>
  Array.from({ length: count }, (_, index) => lastAt - (count - 1 - index) * stepMs);

// Le champ d'un point, ceux qui le complètent et ceux de ses distincts commencent tous par son début.
export const pruneHash = async (
  redis: Redis,
  hash: string,
  retentionMs: number,
  nowMs: Timestamp,
): Promise<void> => {
  const fields = await redis.hkeys(hash);
  const expired = fields.filter((field) => Number.parseInt(field, 10) < nowMs - retentionMs);
  if (expired.length > 0) await redis.hdel(hash, ...expired);
};
