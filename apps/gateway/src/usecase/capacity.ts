// La capacité vue du gateway (écart §4.3 et §5.1, JOURNAL 2026-10-07) : toutes les 10 s, chaque ressource mesurée (Redis, la
// machine, lui-même, ce que le web dépose), son pic des 5 dernières minutes face à son plafond, et la saturation qui en
// sort. Chaque minute, les pics partent sous `capacity:`. La frame part toutes les 2 s au développeur qui regarde, sans
// rien lire : tout vient de la mémoire. Rien par pose, au-delà d'un compteur. Ce que bloquent les protections (Écart §4.3
// et §5.1, JOURNAL 2026-10-09) se compte à part, sans plafond : la frame le porte, la saturation l'ignore.

import {
  type ActivityPeriod,
  isDeveloper,
  MINUTE_MS,
  type Session,
  type Timestamp,
  toHourStart,
  toMinuteStart,
} from "@liveplace/domain";
import {
  CAPACITY_LINKS,
  CAPACITY_RESOURCE_IDS,
  type CapacityResource,
  type CapacityResourceId,
  type CapacitySample,
  getCapacitySpec,
  INSTANT_WINDOW_MS,
  isWithoutNews,
  type Saturation,
  toInstantResource,
  toMonthlyResource,
  toSaturation,
  toStockResource,
  toThousandth,
  toUnmeasured,
  toWithoutNews,
} from "@liveplace/domain/capacity";
import type {
  CapacityFrame,
  CapacityHistory,
  CapacityMinute,
  CapacityStore,
  ClientSocket,
  ConvexDeposit,
  ConvexUsage,
  HostProbe,
} from "@liveplace/domain/ports";
import type { Broadcast } from "./broadcast";
import type { DelayTally } from "./delay-tally";
import { createGuardTally } from "./guard-tally";

// §3 du cahier des charges : la frame part toutes les 2 s, tant que le développeur regarde.
export const CAPACITY_TICK_MS = 2000;
const MIN_RATE_SECONDS = 1; // un débit ne se compte pas sur moins d'une seconde

export type CapacityDeps = {
  store: CapacityStore;
  host: HostProbe;
  broadcast: Pick<Broadcast, "countConnections">;
  delays: Pick<DelayTally, "getP99">;
  now: () => Timestamp;
  isProduction: boolean; // là seulement, un Convex non configuré est une panne : sans nouvelles, pas « non mesuré »
};

export interface Capacity {
  countBytes(bytes: number): void; // à chaque envoi de frame ou de snapshot : rien de lourd
  // Écart §4.3 et §5.1 (JOURNAL 2026-10-09) : ce que bloquent les protections, un compteur de plus chacun, jamais une écriture.
  countRefusedPlacement(): void; // une pose refusée pour le débit
  countClosedConnection(): void; // une connexion fermée en 1013
  // Ignoré hors du développeur. Cesser de regarder ne demande aucun droit : la fermeture d'une page y passe aussi.
  watch(socket: ClientSocket, session: Session | null, isWatching: boolean): void;
  listHistory(session: Session | null, period: ActivityPeriod): Promise<CapacityHistory | null>; // `null` : refusé
  sample(): Promise<void>; // toutes les 10 s : les mesures, la saturation de la minute, les minutes écoulées vers Redis
  tick(): void; // toutes les 2 s : la frame aux sockets qui regardent
  start(): Promise<void>; // au démarrage : les plafonds atteints d'avant, l'élagage, un premier échantillon
}

type ConvexField = keyof Omit<ConvexUsage, "at">;

// L'usage d'un déploiement que somme chaque ressource Convex ; l'absence d'une ressource ici dit qu'elle est instantanée.
// Un quota du mois se projette en fin de mois ; un stock (les fichiers) se lit tel qu'il est.
type ConvexSource = { metric: ConvexField; toResource: typeof toMonthlyResource };
const CONVEX_FIELDS = new Map<CapacityResourceId, ConvexSource>([
  ["convexCalls", { metric: "calls", toResource: toMonthlyResource }],
  ["convexDatabaseIo", { metric: "databaseIoGb", toResource: toMonthlyResource }],
  ["convexEgress", { metric: "egressGb", toResource: toMonthlyResource }],
  ["convexCompute", { metric: "computeGbHours", toResource: toMonthlyResource }],
  ["convexFiles", { metric: "filesBytes", toResource: toStockResource }],
]);

// Le quota du mois est celui de l'équipe : la somme des déploiements, lue à l'instant du plus ancien. Un déploiement qui ne dit
// pas une métrique (le stock de fichiers, tant que son compteur n'est pas là) la rend inconnue pour tous.
const toConvexReading = (usages: readonly ConvexUsage[], metric: ConvexField) => {
  const values = usages.map((usage) => usage[metric]);
  if (values.some((value) => value === undefined)) return undefined;
  return {
    used: values.reduce<number>((sum, value) => sum + (value ?? 0), 0),
    at: Math.min(...usages.map(({ at }) => at)),
  };
};

export function createCapacity(deps: CapacityDeps): Capacity {
  const samples = new Map<CapacityResourceId, CapacitySample[]>();
  const ceilings = new Map<CapacityResourceId, number>(); // les plafonds lus avec la mesure
  const reachedAt = new Map<CapacityResourceId, Timestamp>();
  const storedReachedAt = new Map<CapacityResourceId, Timestamp>(); // ce que Redis garde : au plus une écriture par minute
  const watchers = new Set<ClientSocket>();
  let convex: ConvexDeposit | null = null;
  let previousRedis: { at: Timestamp; cpuSeconds: number; refusals: number } | undefined;
  let lastWebAt = Number.NEGATIVE_INFINITY;
  let lastSnapshotAt = Number.NEGATIVE_INFINITY; // infini tant que le worker n'a jamais rien déposé
  let sentBytes = 0;
  let lastBytes = 0;
  let lastSampledAt = deps.now();
  let isSampling = false;
  let open: CapacityMinute = { at: toMinuteStart(deps.now()), percent: 0, linkRatios: {} };
  const closedMinutes: CapacityMinute[] = [];
  let prunedHourAt = toHourStart(deps.now());
  const guards = createGuardTally(deps.now);

  // Un échantillon de plus, au millième : ceux de plus de 5 minutes s'en vont, et une mesure inutilisable n'en est pas une.
  const record = (id: CapacityResourceId, at: Timestamp, value: number): void => {
    if (!Number.isFinite(value)) return;
    const kept = (samples.get(id) ?? []).filter((sample) => sample.at > at - INSTANT_WINDOW_MS);
    samples.set(id, [...kept, { at, value: toThousandth(value) }]);
  };

  // Une mesure qui échoue se journalise avec son contexte et ne retient pas les autres : sa ressource vieillit.
  const attempt = async (label: string, run: () => void | Promise<void>): Promise<void> => {
    try {
      await run();
    } catch (error) {
      console.error(`gateway: capacité, mesure de ${label} abandonnée`, error);
    }
  };

  // Le plafond est atteint à `at` : la saturation vaut 100 % pendant l'heure. Redis le garde, mais une fois par minute au plus.
  const markReached = async (id: CapacityResourceId, at: Timestamp): Promise<void> => {
    reachedAt.set(id, at);
    if (at - (storedReachedAt.get(id) ?? Number.NEGATIVE_INFINITY) < MINUTE_MS) return;
    await deps.store.storeCeilingReached(id, at);
    storedReachedAt.set(id, at);
  };

  // `INFO` : la mémoire, le processeur du fil principal par différence entre deux lectures, une hausse d'`errorstat_OOM`.
  const sampleRedis = async (at: Timestamp): Promise<void> => {
    const usage = await deps.store.getRedisUsage();
    record("redisMemory", at, usage.usedMemoryBytes);
    // `maxmemory` à 0 : Redis n'a pas de limite, sa mémoire est celle de la machine.
    ceilings.set(
      "redisMemory",
      usage.maxMemoryBytes > 0 ? usage.maxMemoryBytes : deps.host.getMemory().totalBytes,
    );
    const before = previousRedis;
    previousRedis = { at, cpuSeconds: usage.cpuSeconds, refusals: usage.outOfMemoryRefusals };
    if (!before) return;
    const elapsedSeconds = (at - before.at) / 1000;
    // Un compteur qui recule : Redis a redémarré, il n'y a rien à retrancher.
    if (elapsedSeconds > 0 && usage.cpuSeconds >= before.cpuSeconds)
      record("redisCpu", at, (usage.cpuSeconds - before.cpuSeconds) / elapsedSeconds); // des cœurs : Redis n'en a qu'un
    if (usage.outOfMemoryRefusals > before.refusals) await markReached("redisMemory", at);
  };

  const sampleMachine = (at: Timestamp): void => {
    const memory = deps.host.getMemory();
    record("machineMemory", at, memory.usedBytes);
    ceilings.set("machineMemory", memory.totalBytes);
    // Le processeur se dit en cœurs occupés, face aux cœurs de la machine : « 9 % de 4 cœurs ».
    const cores = deps.host.getCoreCount();
    ceilings.set("machineCpu", cores);
    const cpu = deps.host.getCpuPercent();
    if (cpu !== null) record("machineCpu", at, (cpu / 100) * cores);
  };

  const sampleDisk = async (at: Timestamp): Promise<void> => {
    const disk = await deps.host.getDisk();
    record("machineDisk", at, disk.usedBytes);
    ceilings.set("machineDisk", disk.totalBytes);
  };

  // L'occupation du web arrive avec l'instant de sa mesure : une mesure déjà vue ne se compte pas deux fois.
  const sampleWeb = async (): Promise<void> => {
    const measure = await deps.store.getWebMeasure();
    if (!measure || measure.at <= lastWebAt) return;
    record("webUtilization", measure.at, measure.utilization);
    lastWebAt = measure.at;
  };

  // Le retard de la sauvegarde arrive avec l'instant de sa mesure, déposé par le worker : une mesure déjà vue ne se compte pas deux fois.
  const sampleSnapshot = async (): Promise<void> => {
    const measure = await deps.store.getSnapshotMeasure();
    if (!measure || measure.at <= lastSnapshotAt) return;
    record("snapshotDelay", measure.at, measure.delayMs / 1000);
    lastSnapshotAt = measure.at;
  };

  // Le quota d'un mois est atteint quand l'usage, pas sa projection, le dépasse (écart §2 et §9, JOURNAL 2026-10-07).
  const sampleConvex = async (at: Timestamp): Promise<void> => {
    convex = await deps.store.getConvexDeposit();
    if (convex?.status !== "configured") return;
    const usages = [...convex.deployments.values()];
    for (const [id, { metric }] of CONVEX_FIELDS) {
      const { ceiling, cadenceMs } = getCapacitySpec(id);
      const reading = toConvexReading(usages, metric);
      if (ceiling !== null && reading && !isWithoutNews(reading.at, cadenceMs, at) && reading.used >= ceiling)
        await markReached(id, at);
    }
  };

  // L'occupation et le débit sur le temps écoulé depuis le dernier échantillon, jamais sur moins d'une seconde : le premier
  // échantillon, pris au démarrage, ne mesurerait que le démarrage. Le retard de diffusion et les connexions, tels qu'ils sont.
  const sampleGateway = (at: Timestamp): void => {
    const utilization = deps.host.getUtilizationPercent(); // lu même écarté : le temps suivant repart d'ici
    const elapsedSeconds = (at - lastSampledAt) / 1000;
    if (elapsedSeconds >= MIN_RATE_SECONDS) {
      record("gatewayUtilization", at, utilization);
      record("gatewayOutbound", at, ((sentBytes - lastBytes) * 8) / elapsedSeconds);
    }
    lastSampledAt = at;
    lastBytes = sentBytes;
    const { total, largestCanvas } = deps.broadcast.countConnections();
    record("gatewayConnections", at, total);
    record("gatewayCanvasConnections", at, largestCanvas);
    record("gatewayDelay", at, deps.delays.getP99(at));
  };

  const toConvexResource = (
    id: CapacityResourceId,
    { metric, toResource }: ConvexSource,
    nowMs: Timestamp,
  ): CapacityResource => {
    const spec = getCapacitySpec(id);
    if (convex?.status === "unconfigured")
      return deps.isProduction ? toWithoutNews(spec) : toUnmeasured(spec);
    if (convex?.status !== "configured") return toWithoutNews(spec);
    const reading = toConvexReading([...convex.deployments.values()], metric);
    return { ...toResource(spec, reading, nowMs), deployments: [...convex.deployments.keys()].sort() };
  };

  // Le retard de la sauvegarde : un worker qui n'a jamais rien déposé n'est une panne qu'en production ; ailleurs, personne ne le lance.
  const toSnapshotResource = (nowMs: Timestamp): CapacityResource => {
    const spec = getCapacitySpec("snapshotDelay");
    if (lastSnapshotAt === Number.NEGATIVE_INFINITY && !deps.isProduction) return toUnmeasured(spec);
    return toInstantResource(spec, samples.get("snapshotDelay") ?? [], undefined, nowMs);
  };

  const buildResources = (nowMs: Timestamp): CapacityResource[] =>
    CAPACITY_RESOURCE_IDS.map((id) => {
      const convexField = CONVEX_FIELDS.get(id);
      if (convexField) return toConvexResource(id, convexField, nowMs);
      if (id === "snapshotDelay") return toSnapshotResource(nowMs);
      return toInstantResource(getCapacitySpec(id), samples.get(id) ?? [], ceilings.get(id), nowMs);
    });

  const buildFrame = (nowMs: Timestamp): CapacityFrame => {
    const resources = buildResources(nowMs);
    const { percent, resource, isIncomplete } = toSaturation(resources, reachedAt, nowMs);
    return {
      t: "capacity",
      saturation: { percent, ...(resource === undefined ? {} : { resource }), isIncomplete },
      resources,
      guards: guards.getTotals(nowMs),
    };
  };

  // La minute en cours garde le pic de la saturation, et du plus haut taux de chaque maillon : ce que le développeur a vu.
  const foldIntoMinute = ({ percent, resource, linkRatios }: Saturation): void => {
    if (resource === undefined) return; // rien de mesuré : un trou dans la courbe, jamais un zéro inventé
    if (open.resource === undefined || percent > open.percent) {
      open.percent = percent;
      open.resource = resource;
    }
    for (const link of CAPACITY_LINKS) {
      const ratio = linkRatios[link];
      if (ratio !== undefined) open.linkRatios[link] = Math.max(open.linkRatios[link] ?? 0, ratio);
    }
  };

  // Une minute sans gateway reste un trou : on ne comble pas, on ferme la minute et on ouvre celle du moment.
  const rollMinute = (nowMs: Timestamp): void => {
    const at = toMinuteStart(nowMs);
    if (at <= open.at) return;
    if (open.resource !== undefined) closedMinutes.push(open);
    open = { at, percent: 0, linkRatios: {} };
  };

  // Une minute n'est retirée de la file qu'une fois écrite : Redis coupé, elle attend l'échantillon suivant. L'élagage, chaque heure.
  const storeClosedMinutes = async (nowMs: Timestamp): Promise<void> => {
    try {
      for (let closed = closedMinutes[0]; closed; closed = closedMinutes[0]) {
        await deps.store.storeCapacityMinute(closed);
        closedMinutes.shift();
      }
      const hourAt = toHourStart(nowMs);
      if (hourAt === prunedHourAt) return;
      await deps.store.pruneCapacity(nowMs);
      prunedHourAt = hourAt;
    } catch (error) {
      console.error("gateway: capacité, minute non écrite", error);
    }
  };

  // Les minutes de protections fermées s'écrivent d'un coup, une fois ; refusées par Redis, elles attendent l'échantillon suivant.
  const storeGuardMinutes = async (nowMs: Timestamp): Promise<void> => {
    try {
      const unstored = guards.listUnstored(nowMs);
      if (unstored.length === 0) return;
      await deps.store.storeGuardMinutes(unstored);
      guards.markStored(unstored);
    } catch (error) {
      console.error("gateway: capacité, protections non écrites", error);
    }
  };

  // Un échantillon à la fois : deux lectures d'une même minute en doubleraient les écritures.
  const sample = async (): Promise<void> => {
    if (isSampling) return;
    isSampling = true;
    try {
      const nowMs = deps.now();
      rollMinute(nowMs);
      await Promise.all([
        attempt("Redis", () => sampleRedis(nowMs)),
        attempt("la machine", () => sampleMachine(nowMs)),
        attempt("le disque", () => sampleDisk(nowMs)),
        attempt("le web", sampleWeb),
        attempt("le worker", sampleSnapshot),
        attempt("Convex", () => sampleConvex(nowMs)),
      ]);
      sampleGateway(nowMs);
      foldIntoMinute(toSaturation(buildResources(nowMs), reachedAt, nowMs));
      await storeClosedMinutes(nowMs);
      await storeGuardMinutes(nowMs);
    } finally {
      isSampling = false;
    }
  };

  return {
    countBytes(bytes) {
      sentBytes += bytes;
    },

    countRefusedPlacement: guards.countRefusedPlacement,
    countClosedConnection: guards.countClosedConnection,

    watch(socket, session, isWatching) {
      if (!isWatching) watchers.delete(socket);
      else if (isDeveloper(session?.userId)) watchers.add(socket);
    },

    async listHistory(session, period) {
      if (!isDeveloper(session?.userId)) return null;
      return { points: await deps.store.listCapacityHistory(period, deps.now()) };
    },

    sample,

    tick() {
      if (watchers.size === 0) return;
      const frame = buildFrame(deps.now());
      for (const socket of watchers) socket.sendFrame(frame);
    },

    // Avant d'ouvrir le serveur : aucune page n'est encore arrivée.
    async start() {
      const nowMs = deps.now();
      for (const [id, at] of await deps.store.listCeilingsReached()) {
        reachedAt.set(id, at);
        storedReachedAt.set(id, at);
      }
      await deps.store.pruneCapacity(nowMs);
      prunedHourAt = toHourStart(nowMs);
      guards.restore(await deps.store.listGuardMinutes(nowMs), nowMs);
      await sample();
    },
  };
}
