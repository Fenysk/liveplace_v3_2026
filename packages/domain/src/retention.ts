// La rétention des sauvegardes et du budget de l'historique (Écart §7.3 et §8.1, JOURNAL 2026-10-08). Deux fonctions pures,
// sans réseau : la pyramide d'un canvas, et les plages de chunks que le budget permet de purger. Le worker les applique.

import { HOUR_MS, type Timestamp } from "./index";
import type { SnapshotTier } from "./snapshot";

export const DAY_MS = 24 * HOUR_MS;
export const WEEK_MS = 7 * DAY_MS;

export const HOURLY_KEPT_MS = DAY_MS; // le palier horaire : 24 h
export const DAILY_FULL_MS = 7 * DAY_MS; // le palier quotidien, complet (auteurs compris) : 7 jours, puis en `state` seul
export const DAILY_KEPT_MS = 30 * DAY_MS; // et jusqu'à 30 jours ; le palier hebdomadaire n'a pas de limite

// Le palier de travail garde les deux dernières sauvegardes : le même nombre que `SNAPSHOTS_KEPT` de Convex, qu'un test garde ensemble.
export const WORKING_KEPT = 2;

// Une semaine commence le lundi à 00:00 UTC ; le 1er janvier 1970 était un jeudi.
const MONDAY_OFFSET_MS = 4 * DAY_MS;

export type TierRow = { tier: SnapshotTier; version: number; takenAt: Timestamp; isStateOnly: boolean };
type Promotion = Exclude<SnapshotTier, "working">;

// Une ligne se nomme par son palier et sa date. Une promotion ajoute une ligne qui partage le fichier de sa source, sauf quand
// la ligne n'a que le dessin (`isStateOnly`) et que la source est complète : le worker écrit alors un petit fichier. C'est le cas
// d'un `weekly`, et d'un `daily` déjà plus vieux que 7 jours (il serait aussitôt dégradé).
export type RetentionAction =
  | { kind: "promote"; from: TierRow; to: Promotion; isStateOnly: boolean }
  | { kind: "degrade"; row: TierRow }
  | { kind: "discard"; row: TierRow };

type Rule = {
  to: Promotion;
  sources: readonly SnapshotTier[];
  bucketOf(at: Timestamp): number;
  endOf(bucket: number): Timestamp;
  isCloseOnly: boolean; // le palier ne prend que des périodes finies : la sauvegarde la plus récente de la période
  keptMs: number; // les sources plus vieilles s'effaceraient aussitôt du palier : elles n'y entrent pas
};

const RULES: readonly Rule[] = [
  {
    to: "hourly",
    sources: ["working"],
    bucketOf: (at) => Math.floor(at / HOUR_MS),
    endOf: (bucket) => (bucket + 1) * HOUR_MS,
    isCloseOnly: false,
    keptMs: HOURLY_KEPT_MS,
  },
  {
    to: "daily",
    sources: ["working", "hourly"],
    bucketOf: (at) => Math.floor(at / DAY_MS),
    endOf: (bucket) => (bucket + 1) * DAY_MS,
    isCloseOnly: true,
    keptMs: DAILY_KEPT_MS,
  },
  {
    to: "weekly",
    sources: ["working", "hourly", "daily"],
    bucketOf: (at) => Math.floor((at - MONDAY_OFFSET_MS) / WEEK_MS),
    endOf: (bucket) => (bucket + 1) * WEEK_MS + MONDAY_OFFSET_MS,
    isCloseOnly: true,
    keptMs: Number.POSITIVE_INFINITY,
  },
];

// À date égale, la ligne du palier qui dure le plus : elle existera encore quand la promotion s'exécutera.
const TIER_RANK: Record<SnapshotTier, number> = { working: 0, hourly: 1, daily: 2, weekly: 3 };

// Pour chaque période qui n'a pas encore sa ligne dans le palier : la plus récente source de cette période.
function planPromotions(rows: readonly TierRow[], nowMs: Timestamp, rule: Rule): RetentionAction[] {
  const present = new Set(
    rows.filter(({ tier }) => tier === rule.to).map(({ takenAt }) => rule.bucketOf(takenAt)),
  );
  const newest = new Map<number, TierRow>();
  for (const candidate of rows) {
    if (!rule.sources.includes(candidate.tier) || candidate.takenAt <= nowMs - rule.keptMs) continue;
    const bucket = rule.bucketOf(candidate.takenAt);
    const known = newest.get(bucket);
    const isNewer =
      !known ||
      candidate.takenAt > known.takenAt ||
      (candidate.takenAt === known.takenAt && TIER_RANK[candidate.tier] > TIER_RANK[known.tier]);
    if (isNewer) newest.set(bucket, candidate);
  }
  return [...newest]
    .sort(([first], [second]) => first - second)
    .filter(([bucket]) => !present.has(bucket) && (!rule.isCloseOnly || rule.endOf(bucket) <= nowMs))
    .map(
      ([, from]): RetentionAction => ({
        kind: "promote",
        from,
        to: rule.to,
        isStateOnly:
          from.isStateOnly ||
          rule.to === "weekly" ||
          (rule.to === "daily" && from.takenAt <= nowMs - DAILY_FULL_MS),
      }),
    );
}

// Ce que la pyramide d'un canvas doit faire maintenant, à partir de ses lignes seules : les promotions, puis les dégradations
// en `state` seul, puis les retraits. Rejouer le plan après l'avoir appliqué ne donne rien : le worker peut s'arrêter au milieu.
export function planRetention(rows: readonly TierRow[], nowMs: Timestamp): RetentionAction[] {
  const promotions = RULES.flatMap((rule) => planPromotions(rows, nowMs, rule));
  const degradations = rows
    .filter(
      ({ tier, takenAt, isStateOnly }) =>
        tier === "daily" &&
        !isStateOnly &&
        takenAt <= nowMs - DAILY_FULL_MS &&
        takenAt > nowMs - DAILY_KEPT_MS,
    )
    .map((row): RetentionAction => ({ kind: "degrade", row }));
  const discards = rows
    .filter(
      ({ tier, takenAt }) =>
        (tier === "hourly" && takenAt <= nowMs - HOURLY_KEPT_MS) ||
        (tier === "daily" && takenAt <= nowMs - DAILY_KEPT_MS),
    )
    .map((row): RetentionAction => ({ kind: "discard", row }));
  return [...promotions, ...degradations, ...discards];
}

// Le budget des chunks d'un scope : 700 Mo en production, 50 Mo ailleurs (décision du 08/10).
export const HISTORY_BUDGET_PROD_BYTES = 700 * 1024 * 1024;
export const HISTORY_BUDGET_OTHER_BYTES = 50 * 1024 * 1024;
export const HISTORY_FLOOR_MS = 7 * DAY_MS; // jamais moins de 7 jours d'historique : le plancher l'emporte sur le budget

export const historyBudgetBytes = (scope: string): number =>
  scope === "prod" ? HISTORY_BUDGET_PROD_BYTES : HISTORY_BUDGET_OTHER_BYTES;

export type ChunkSize = {
  canvasId: string;
  fromVersion: number;
  toVersion: number;
  toTs: Timestamp;
  size: number;
};

// Tout ce qui précède `beforeVersion` (exclue) peut partir pour ce canvas, `beforeTs` étant la date qui suit le dernier chunk retiré.
export type PurgeRange = {
  canvasId: string;
  beforeVersion: number;
  beforeTs: Timestamp;
  chunks: number;
  bytes: number;
};

// `oldest` : les chunks du scope, les plus anciens d'abord (une page, pas tout) ; `totalBytes` : le total que Convex compte. Le
// plus ancien part le premier, canvas confondus, jusqu'à revenir au budget, sans jamais toucher à un chunk qui finit dans les
// 7 derniers jours. Les plages sont des préfixes de l'historique de chaque canvas, que le worker retire par lots.
export function purgeableRanges(
  oldest: readonly ChunkSize[],
  totalBytes: number,
  budgetBytes: number,
  nowMs: Timestamp,
): PurgeRange[] {
  const excess = totalBytes - budgetBytes;
  if (excess <= 0) return [];
  const floorTs = nowMs - HISTORY_FLOOR_MS;
  const ranges = new Map<string, PurgeRange>();
  let freed = 0;
  const ordered = [...oldest].sort(
    (first, second) =>
      first.toTs - second.toTs ||
      first.canvasId.localeCompare(second.canvasId) ||
      first.fromVersion - second.fromVersion,
  );
  for (const chunk of ordered) {
    if (freed >= excess || chunk.toTs >= floorTs) break;
    const known = ranges.get(chunk.canvasId);
    ranges.set(chunk.canvasId, {
      canvasId: chunk.canvasId,
      beforeVersion: Math.max(known?.beforeVersion ?? 0, chunk.toVersion + 1),
      beforeTs: Math.max(known?.beforeTs ?? 0, chunk.toTs + 1),
      chunks: (known?.chunks ?? 0) + 1,
      bytes: (known?.bytes ?? 0) + chunk.size,
    });
    freed += chunk.size;
  }
  return [...ranges.values()];
}
