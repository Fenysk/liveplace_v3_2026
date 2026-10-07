// La capacité : chaque ressource face à son plafond (Écart §5.1 et §6, JOURNAL 2026-10-07). Les règles du cahier des
// charges, pures : le taux, la valeur d'une ressource, la saturation. Les mesures viennent du gateway et du web.
// Hors de `index.ts`, comme `ports.ts` : `@liveplace/domain/capacity`.

import { HOUR_MS, MINUTE_MS, type Timestamp } from "./index";

// Les maillons de la chaîne, du plus proche des données au plus loin. `machine` : le VPS.
export const CAPACITY_LINKS = ["redis", "gateway", "web", "machine", "convex"] as const;
export type CapacityLink = (typeof CAPACITY_LINKS)[number];

// Dans l'ordre du cahier des charges, §3 : à taux égal, la première gagne la saturation.
export const CAPACITY_RESOURCE_IDS = [
  "redisMemory",
  "redisCpu",
  "gatewayUtilization",
  "gatewayDelay",
  "gatewayOutbound",
  "gatewayCanvasConnections",
  "gatewayConnections",
  "webUtilization",
  "machineMemory",
  "machineCpu",
  "machineDisk",
  "convexCalls",
  "convexDatabaseIo",
  "convexEgress",
  "convexCompute",
] as const;
export type CapacityResourceId = (typeof CAPACITY_RESOURCE_IDS)[number];

export const CAPACITY_UNITS = [
  "percent",
  "cores",
  "bytes",
  "milliseconds",
  "bitsPerSecond",
  "connections",
  "calls",
  "gigabytes",
  "gigabyteHours",
] as const;
export type CapacityUnit = (typeof CAPACITY_UNITS)[number];

// Mesurée ; sans nouvelles (la mesure n'est pas arrivée à temps) ; non mesurée (rien ne la mesure ici, et c'est normal).
export const CAPACITY_STATES = ["measured", "withoutNews", "unmeasured"] as const;
export type CapacityState = (typeof CAPACITY_STATES)[number];

// Les cadences : le gateway mesure toutes les 10 s, le web lit l'usage de Convex toutes les 15 min.
export const CAPACITY_SAMPLE_MS = 10_000;
export const CONVEX_USAGE_MS = 15 * MINUTE_MS;
const NO_NEWS_FACTOR = 3; // sans nouvelles : trois cadences sans mesure
export const INSTANT_WINDOW_MS = 5 * MINUTE_MS; // la valeur d'une ressource instantanée : son pic sur 5 minutes

// Les plafonds fixés par l'infrastructure ou mesurés par le test de charge du 26/09 (§3).
export const GATEWAY_OUTBOUND_CEILING_BPS = 200_000_000; // le port du VPS, 200 Mbit/s
export const BROADCAST_DELAY_CEILING_MS = 250; // la cible du plan d'architecture, §12.3
export const CANVAS_CONNECTIONS_CEILING = 1000;
export const TOTAL_CONNECTIONS_CEILING = 1750;
export const SNAPSHOT_AGE_CEILING_MS = 15 * MINUTE_MS; // à venir, avec la sauvegarde : pas encore de ressource

// Le plan Convex se règle ici, et ses plafonds mensuels suivent. Starter inclut les mêmes quantités que Free : au-delà,
// il facture au lieu de couper (convex.dev/pricing, 07/10/2026).
export const CONVEX_PLANS = ["free", "starter"] as const;
export type ConvexPlan = (typeof CONVEX_PLANS)[number];
export const CONVEX_PLAN: ConvexPlan = "free";

export type ConvexCeilings = {
  calls: number;
  databaseIoGb: number;
  egressGb: number;
  computeGbHours: number;
  filesGb: number; // à venir, avec la sauvegarde
};

const CONVEX_INCLUDED: ConvexCeilings = {
  calls: 1_000_000,
  databaseIoGb: 1,
  egressGb: 1,
  computeGbHours: 20,
  filesGb: 1,
};

export const CONVEX_CEILINGS: Record<ConvexPlan, ConvexCeilings> = {
  free: CONVEX_INCLUDED,
  starter: CONVEX_INCLUDED,
};

const convexCeilings = CONVEX_CEILINGS[CONVEX_PLAN];

// `ceiling` nul : lu avec la mesure (`maxmemory` de Redis, mémoire et disque de la machine). `windowMs` : sur quelle durée
// la valeur prend le pic ; le délai de diffusion est déjà un p99 sur 5 minutes, il ne garde que le dernier échantillon.
export type CapacitySpec = {
  id: CapacityResourceId;
  link: CapacityLink;
  unit: CapacityUnit;
  ceiling: number | null;
  cadenceMs: number;
  windowMs: number;
};

const instant = (
  link: CapacityLink,
  unit: CapacityUnit,
  ceiling: number | null,
  windowMs = INSTANT_WINDOW_MS,
) => ({
  link,
  unit,
  ceiling,
  cadenceMs: CAPACITY_SAMPLE_MS,
  windowMs,
});

const monthly = (unit: CapacityUnit, ceiling: number) => ({
  link: "convex" as const,
  unit,
  ceiling,
  cadenceMs: CONVEX_USAGE_MS,
  windowMs: INSTANT_WINDOW_MS,
});

const SPECS = {
  redisMemory: instant("redis", "bytes", null),
  redisCpu: instant("redis", "cores", 1), // un cœur : Redis travaille sur un seul fil
  gatewayUtilization: instant("gateway", "percent", 100),
  gatewayDelay: instant("gateway", "milliseconds", BROADCAST_DELAY_CEILING_MS, CAPACITY_SAMPLE_MS),
  gatewayOutbound: instant("gateway", "bitsPerSecond", GATEWAY_OUTBOUND_CEILING_BPS),
  gatewayCanvasConnections: instant("gateway", "connections", CANVAS_CONNECTIONS_CEILING),
  gatewayConnections: instant("gateway", "connections", TOTAL_CONNECTIONS_CEILING),
  webUtilization: instant("web", "percent", 100),
  machineMemory: instant("machine", "bytes", null),
  machineCpu: instant("machine", "cores", null), // les cœurs de la machine, lus avec la mesure
  machineDisk: instant("machine", "bytes", null),
  convexCalls: monthly("calls", convexCeilings.calls),
  convexDatabaseIo: monthly("gigabytes", convexCeilings.databaseIoGb),
  convexEgress: monthly("gigabytes", convexCeilings.egressGb),
  convexCompute: monthly("gigabyteHours", convexCeilings.computeGbHours),
} as const satisfies Record<CapacityResourceId, Omit<CapacitySpec, "id">>;

export function getCapacitySpec(id: CapacityResourceId): CapacitySpec {
  return { id, ...SPECS[id] };
}

// Un échantillon d'une ressource instantanée : l'instant de la mesure, et sa valeur.
export type CapacitySample = { at: Timestamp; value: number };

type ResourceBase = {
  link: CapacityLink;
  id: CapacityResourceId;
  unit: CapacityUnit;
  deployments?: string[]; // Convex : les déploiements que la ligne compte, par leur nom
};

// `ratio` : la valeur rapportée au plafond, en pourcentage. `fullAt` : un quota mensuel plein avant la fin du mois.
export type CapacityResource = ResourceBase &
  (
    | { state: "measured"; value: number; ceiling: number; ratio: number; fullAt?: Timestamp }
    | { state: "withoutNews" }
    | { state: "unmeasured" }
  );

const roundTenth = (value: number): number => Math.round(value * 10) / 10;

// Une valeur part sur le fil au millième : aucun bruit de virgule flottante.
export const toThousandth = (value: number): number => Math.round(value * 1000) / 1000;

// Un plafond nul ne divise pas : le taux vaut zéro.
export function toRatio(value: number, ceiling: number): number {
  return ceiling > 0 ? roundTenth((value / ceiling) * 100) : 0;
}

export type SaturationColor = "green" | "orange" | "red";

// Vert sous 50 %, orange de 50 à 80 % exclu, rouge à partir de 80 %.
export function toSaturationColor(percent: number): SaturationColor {
  if (percent < 50) return "green";
  return percent < 80 ? "orange" : "red";
}

export function isWithoutNews(at: Timestamp, cadenceMs: number, nowMs: Timestamp): boolean {
  return nowMs - at > NO_NEWS_FACTOR * cadenceMs;
}

// Le plus haut des échantillons de la fenêtre qui finit à `nowMs`, ou rien s'il n'y en a aucun.
export function toPeak(
  samples: readonly CapacitySample[],
  nowMs: Timestamp,
  windowMs = INSTANT_WINDOW_MS,
): number | undefined {
  const inside = samples.filter(({ at }) => at > nowMs - windowMs).map(({ value }) => value);
  return inside.length === 0 ? undefined : Math.max(...inside);
}

const toBase = ({ link, id, unit }: CapacitySpec): ResourceBase => ({ link, id, unit });

export function toWithoutNews(spec: CapacitySpec): CapacityResource {
  return { ...toBase(spec), state: "withoutNews" };
}

export function toUnmeasured(spec: CapacitySpec): CapacityResource {
  return { ...toBase(spec), state: "unmeasured" };
}

// `samples` : du plus ancien au plus récent. `measuredCeiling` : le plafond lu avec la mesure, pour une spécification qui
// n'en a pas. Sans échantillon récent, ou sans plafond, la ressource est sans nouvelles.
export function toInstantResource(
  spec: CapacitySpec,
  samples: readonly CapacitySample[],
  measuredCeiling: number | undefined,
  nowMs: Timestamp,
): CapacityResource {
  const last = samples.at(-1);
  const ceiling = spec.ceiling ?? measuredCeiling;
  if (!last || isWithoutNews(last.at, spec.cadenceMs, nowMs) || ceiling === undefined || ceiling <= 0)
    return toWithoutNews(spec);
  const value = toPeak(samples, nowMs, spec.windowMs) ?? last.value;
  return { ...toBase(spec), state: "measured", value, ceiling, ratio: toRatio(value, ceiling) };
}

// Le mois est le mois UTC.
export function toMonthStart(atMs: Timestamp): Timestamp {
  const at = new Date(atMs);
  return Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1);
}

// Le rythme moyen du mois en cours, compté sur au moins un jour : l'usage de la fin du mois, et le jour où le plafond serait
// atteint si son rythme l'y mène avant la fin du mois.
export function projectMonth(
  used: number,
  ceiling: number,
  atMs: Timestamp,
): { projected: number; fullAt?: Timestamp } {
  const start = toMonthStart(atMs);
  const at = new Date(atMs);
  const monthMs = Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1) - start;
  const elapsedMs = Math.max(24 * HOUR_MS, atMs - start);
  const projected = (used * monthMs) / elapsedMs;
  if (used <= 0 || projected < ceiling) return { projected };
  return { projected, fullAt: start + (ceiling * elapsedMs) / used };
}

// `reading` : l'usage du mois jusqu'à `at`, sommé sur les déploiements ; absent ou plus vieux que trois cadences, sans nouvelles.
export function toMonthlyResource(
  spec: CapacitySpec,
  reading: { used: number; at: Timestamp } | undefined,
  nowMs: Timestamp,
): CapacityResource {
  const { ceiling } = spec;
  if (!reading || ceiling === null || isWithoutNews(reading.at, spec.cadenceMs, nowMs))
    return toWithoutNews(spec);
  const { projected, fullAt } = projectMonth(reading.used, ceiling, reading.at);
  return {
    ...toBase(spec),
    state: "measured",
    value: toThousandth(projected),
    ceiling,
    ratio: toRatio(projected, ceiling),
    ...(fullAt === undefined ? {} : { fullAt }),
  };
}

// Un plafond atteint pèse 100 % pendant l'heure qui suit (§2) : la saturation vaut au moins 100 %.
export type Saturation = {
  percent: number;
  resource?: CapacityResourceId; // la ressource qui porte la saturation ; absente quand rien n'est mesuré
  isIncomplete: boolean; // une ressource est sans nouvelles : la saturation n'est jamais verte
  linkRatios: Partial<Record<CapacityLink, number>>; // le plus haut taux de chaque maillon
};

// Le taux de chaque ressource mesurée ; une ressource dont le plafond a été atteint depuis moins d'une heure pèse au moins 100 %,
// même sans nouvelles.
const toRatios = (
  resources: readonly CapacityResource[],
  reachedAt: ReadonlyMap<CapacityResourceId, Timestamp>,
  nowMs: Timestamp,
): Map<CapacityResourceId, number> => {
  const ratios = new Map<CapacityResourceId, number>();
  for (const resource of resources)
    if (resource.state === "measured") ratios.set(resource.id, resource.ratio);
  for (const [id, at] of reachedAt)
    if (nowMs - at < HOUR_MS) ratios.set(id, Math.max(100, ratios.get(id) ?? 0));
  return ratios;
};

export function toSaturation(
  resources: readonly CapacityResource[],
  reachedAt: ReadonlyMap<CapacityResourceId, Timestamp>,
  nowMs: Timestamp,
): Saturation {
  const ratios = toRatios(resources, reachedAt, nowMs);
  let percent = 0;
  let carrier: CapacityResourceId | undefined;
  const linkRatios: Partial<Record<CapacityLink, number>> = {};
  for (const id of CAPACITY_RESOURCE_IDS) {
    const ratio = ratios.get(id);
    if (ratio === undefined) continue;
    const { link } = SPECS[id];
    linkRatios[link] = Math.max(linkRatios[link] ?? 0, ratio);
    if (carrier === undefined || ratio > percent) {
      percent = ratio;
      carrier = id;
    }
  }
  return {
    percent,
    ...(carrier === undefined ? {} : { resource: carrier }),
    isIncomplete: resources.some(({ state }) => state === "withoutNews"),
    linkRatios,
  };
}
