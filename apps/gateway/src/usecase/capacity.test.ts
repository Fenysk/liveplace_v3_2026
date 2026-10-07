import { DEVELOPER_USER_ID, HOUR_MS, MINUTE_MS, type Session, type Timestamp } from "@liveplace/domain";
import type { CapacityResourceId } from "@liveplace/domain/capacity";
import type {
  CapacityFrame,
  CapacityMinute,
  CapacityPoint,
  CapacityStore,
  ClientSocket,
  ConvexDeposit,
  ConvexUsage,
  RedisUsage,
  WebMeasure,
} from "@liveplace/domain/ports";
import type { ServerFrame } from "@liveplace/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCapacity } from "./capacity";
import { createDelayTally } from "./delay-tally";

// Le 7 octobre 2026, 12 h UTC pile : le 7 est à six jours du début du mois, les quotas se projettent sur 31 jours.
const start = Date.UTC(2026, 9, 7, 12, 0, 0);
const SAMPLE_MS = 10_000;

const developer: Session = { userId: DEVELOPER_USER_ID, login: "fenysk", displayName: "Fenysk" };
const viewer: Session = { userId: "user-1", login: "user1", displayName: "User 1" };

const redisUsage = (counts: Partial<RedisUsage> = {}): RedisUsage => ({
  usedMemoryBytes: 318_000_000,
  maxMemoryBytes: 512_000_000,
  cpuSeconds: 100,
  outOfMemoryRefusals: 0,
  ...counts,
});

const convexUsage = (counts: Partial<ConvexUsage> = {}): ConvexUsage => ({
  at: start,
  calls: 0,
  databaseIoGb: 0,
  egressGb: 0,
  computeGbHours: 0,
  ...counts,
});

const configured = (...deployments: [string, ConvexUsage][]): ConvexDeposit => ({
  status: "configured",
  deployments: new Map(deployments),
});

// Le gateway tout entier, remplacé par des valeurs que le test règle : Redis, le web, Convex, la machine, les connexions.
const setup = (options: { isProduction?: boolean } = {}) => {
  const clock = { nowMs: start };
  const state = {
    redis: redisUsage() as RedisUsage | Error,
    isWebAlive: true, // le web dépose son occupation à chaque lecture ; sinon, `web` : ce qu'il a déposé, ou rien
    web: null as WebMeasure | null,
    convex: { status: "unconfigured" } as ConvexDeposit | null,
    isRefusingMinutes: false,
    reachedBefore: new Map<CapacityResourceId, Timestamp>(),
    storedMinutes: [] as CapacityMinute[],
    storedReached: [] as [CapacityResourceId, Timestamp][],
    prunedAt: [] as Timestamp[],
    history: [] as CapacityPoint[],
    historyPeriods: [] as string[],
    reads: 0,
  };
  const host = {
    memory: { usedBytes: 6_000_000_000, totalBytes: 16_000_000_000 },
    cpu: null as number | null,
    cores: 4,
    disk: { usedBytes: 100_000_000_000, totalBytes: 500_000_000_000 },
    utilization: 12,
  };
  const connections = { total: 12, largestCanvas: 7 };
  const delays = createDelayTally();
  const store: CapacityStore = {
    async getRedisUsage() {
      state.reads += 1;
      if (state.redis instanceof Error) throw state.redis;
      return state.redis;
    },
    async getWebMeasure() {
      return state.isWebAlive ? { at: clock.nowMs, utilization: 5 } : state.web;
    },
    async getConvexDeposit() {
      return state.convex;
    },
    async listCeilingsReached() {
      return state.reachedBefore;
    },
    async storeCeilingReached(id, at) {
      state.storedReached.push([id, at]);
    },
    async storeCapacityMinute(minute) {
      if (state.isRefusingMinutes) throw new Error("Redis refuse");
      state.storedMinutes.push(minute);
    },
    async pruneCapacity(nowMs) {
      state.prunedAt.push(nowMs);
    },
    async listCapacityHistory(period) {
      state.historyPeriods.push(period);
      return state.history;
    },
  };
  const capacity = createCapacity({
    store,
    host: {
      getMemory: () => host.memory,
      getCpuPercent: () => host.cpu,
      getCoreCount: () => host.cores,
      getDisk: async () => host.disk,
      getUtilizationPercent: () => host.utilization,
    },
    broadcast: { countConnections: () => connections },
    delays,
    now: () => clock.nowMs,
    isProduction: options.isProduction ?? false,
  });
  const watcher = () => {
    const sent: ServerFrame[] = [];
    const socket: ClientSocket = {
      sendFrame: (frame) => {
        sent.push(frame);
      },
      sendSnapshot: () => undefined,
      close: () => undefined,
    };
    return { sent, socket };
  };
  // Un échantillon, dix secondes plus tard que le précédent (ou à l'instant de départ).
  const sampleAfter = async (ms = SAMPLE_MS) => {
    clock.nowMs += ms;
    await capacity.sample();
  };
  // Deux échantillons : ce qui se mesure par différence (le processeur de Redis, le débit) en a alors un.
  const warmUp = async () => {
    await sampleAfter(0);
    await sampleAfter();
  };
  // La capacité, telle que le développeur la reçoit à la prochaine frame.
  const frame = (): CapacityFrame => {
    const { sent, socket } = watcher();
    capacity.watch(socket, developer, true);
    capacity.tick();
    capacity.watch(socket, developer, false);
    const last = sent.at(-1);
    if (last?.t !== "capacity") throw new Error("aucune frame de capacité");
    return last;
  };
  const resourceOf = (id: CapacityResourceId) => {
    const found = frame().resources.find((resource) => resource.id === id);
    if (!found) throw new Error(`ressource absente : ${id}`);
    return found;
  };
  return {
    capacity,
    clock,
    state,
    host,
    connections,
    delays,
    watcher,
    sampleAfter,
    warmUp,
    frame,
    resourceOf,
  };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the capacity frames (JOURNAL 2026-10-07)", () => {
  // Envoie la capacité au développeur qui la regarde, toutes les 2 s, et à personne d'autre
  it("sends the capacity to the developer who watches, and to no one else", async () => {
    const { capacity, watcher, sampleAfter } = setup();
    await sampleAfter(0);
    const watching = watcher();
    const other = watcher();
    const guest = watcher();
    const notWatching = watcher();
    capacity.watch(watching.socket, developer, true);
    capacity.watch(other.socket, viewer, true);
    capacity.watch(guest.socket, null, true);
    capacity.watch(notWatching.socket, developer, true);
    capacity.watch(notWatching.socket, developer, false);

    capacity.tick();

    expect(watching.sent).toHaveLength(1);
    expect(watching.sent[0]).toMatchObject({ t: "capacity" });
    expect(other.sent).toEqual([]);
    expect(guest.sent).toEqual([]);
    expect(notWatching.sent).toEqual([]);
  });

  // Construit la frame une fois : le même objet part à chaque socket du développeur
  it("builds the frame once: the same object goes to each socket of the developer", async () => {
    const { capacity, watcher, sampleAfter } = setup();
    await sampleAfter(0);
    const first = watcher();
    const second = watcher();
    capacity.watch(first.socket, developer, true);
    capacity.watch(second.socket, developer, true);

    capacity.tick();

    expect(first.sent[0]).toBe(second.sent[0]);
  });

  // Ne lit rien au tick : tout vient de la mémoire, jamais de Redis
  it("reads nothing at the tick: everything comes from memory, never from Redis", async () => {
    const { capacity, state, watcher, sampleAfter } = setup();
    await sampleAfter(0);
    const reads = state.reads;
    capacity.watch(watcher().socket, developer, true);

    capacity.tick();
    capacity.tick();

    expect(state.reads).toBe(reads);
  });

  // Ne dit plus rien à un développeur qui a fermé sa page : son socket n'est plus regardé
  it("tells nothing more to a developer who closed his page", async () => {
    const { capacity, watcher, sampleAfter } = setup();
    await sampleAfter(0);
    const page = watcher();
    capacity.watch(page.socket, developer, true);
    capacity.tick();

    capacity.watch(page.socket, null, false); // la fermeture retire le socket, quelle que soit la session passée

    capacity.tick();
    expect(page.sent).toHaveLength(1);
  });

  // Rend l'historique au développeur seul, de la période demandée ; refusé pour les autres, sans rien lire
  it("answers the history to the developer alone, for the period asked, and reads nothing for the others", async () => {
    const { capacity, state } = setup();
    state.history = [{ at: start, saturation: 12, resource: "redisMemory", redis: 12 }];

    expect(await capacity.listHistory(developer, "month")).toEqual({ points: state.history });
    expect(await capacity.listHistory(viewer, "day")).toBeNull();
    expect(await capacity.listHistory(null, "all")).toBeNull();
    expect(state.historyPeriods).toEqual(["month"]);
  });
});

describe("what the capacity measures (JOURNAL 2026-10-07)", () => {
  // Met chaque ressource face à son plafond : Redis, gateway, machine, avec des valeurs que le test règle
  it("puts each resource against its ceiling: Redis, gateway, machine", async () => {
    const { clock, state, host, connections, sampleAfter, frame, capacity } = setup();
    await sampleAfter(0);
    state.redis = redisUsage({ cpuSeconds: 102 }); // 2 s de processeur en 10 s : 20 % d'un cœur
    host.cpu = 35;
    host.utilization = 40;
    connections.total = 875;
    connections.largestCanvas = 500;
    capacity.countBytes(1_250_000); // 10 Mbit en 10 s : 1 Mbit/s
    await sampleAfter();

    const byId = new Map(frame().resources.map((resource) => [resource.id, resource]));

    expect(clock.nowMs).toBe(start + SAMPLE_MS);
    const expected = {
      redisMemory: { value: 318_000_000, ceiling: 512_000_000, ratio: 62.1, unit: "bytes" },
      redisCpu: { value: 0.2, ceiling: 1, ratio: 20, unit: "cores" }, // 2 s de processeur en 10 s : 20 % d'un cœur
      gatewayUtilization: { value: 40, ceiling: 100, ratio: 40, unit: "percent" },
      gatewayDelay: { value: 0, ceiling: 100, ratio: 0, unit: "milliseconds" },
      gatewayOutbound: { value: 1_000_000, ceiling: 200_000_000, ratio: 0.5, unit: "bitsPerSecond" },
      gatewayCanvasConnections: { value: 500, ceiling: 1000, ratio: 50, unit: "connections" },
      gatewayConnections: { value: 875, ceiling: 1750, ratio: 50, unit: "connections" },
      machineMemory: { value: 6_000_000_000, ceiling: 16_000_000_000, ratio: 37.5, unit: "bytes" },
      machineCpu: { value: 1.4, ceiling: 4, ratio: 35, unit: "cores" }, // 35 % de 4 cœurs
      machineDisk: { value: 100_000_000_000, ceiling: 500_000_000_000, ratio: 20, unit: "bytes" },
    };
    for (const [id, measure] of Object.entries(expected))
      expect(byId.get(id as CapacityResourceId), id).toMatchObject({ state: "measured", ...measure });
  });

  // Dit la mémoire de la machine à la place de `maxmemory` quand Redis n'a pas de limite
  it("takes the memory of the machine in the place of maxmemory when Redis has no limit", async () => {
    const { state, sampleAfter, resourceOf } = setup();
    state.redis = redisUsage({ maxMemoryBytes: 0 });

    await sampleAfter(0);

    expect(resourceOf("redisMemory")).toMatchObject({
      state: "measured",
      ceiling: 16_000_000_000,
      value: 318_000_000,
    });
  });

  // Prend le pic des 5 dernières minutes : un pic de charge reste visible, puis sort de la fenêtre
  it("takes the peak of the last 5 minutes: a load peak stays visible, then leaves the window", async () => {
    const { host, sampleAfter, resourceOf } = setup();
    host.utilization = 10;
    await sampleAfter(0);
    host.utilization = 80;
    await sampleAfter();
    host.utilization = 20;
    await sampleAfter();

    expect(resourceOf("gatewayUtilization")).toMatchObject({ value: 80 });

    for (let index = 0; index < 29; index++) await sampleAfter();
    expect(resourceOf("gatewayUtilization")).toMatchObject({ value: 20 });
  });

  // Mesure le processeur de Redis sur le temps réel écoulé, et ignore un compteur qui recule : Redis a redémarré
  it("measures the CPU of Redis on the real time elapsed, and ignores a counter that goes back: Redis restarted", async () => {
    const { state, sampleAfter, resourceOf } = setup();
    await sampleAfter(0);
    state.redis = redisUsage({ cpuSeconds: 105 });
    await sampleAfter(20_000); // 5 s de processeur en 20 s
    expect(resourceOf("redisCpu")).toMatchObject({ value: 0.25 });

    state.redis = redisUsage({ cpuSeconds: 1 });
    await sampleAfter();

    expect(resourceOf("redisCpu")).toMatchObject({ value: 0.25 }); // aucun échantillon négatif : le pic reste celui d'avant
  });

  // Dit le retard de diffusion au p99 des poses envoyées depuis les 5 dernières minutes
  it("tells the broadcast lateness at the p99 of the poses sent in the last 5 minutes", async () => {
    const { delays, sampleAfter, resourceOf } = setup();
    for (let pose = 0; pose < 98; pose++) delays.record(40);
    for (let pose = 0; pose < 2; pose++) delays.record(310);

    await sampleAfter(0);

    expect(resourceOf("gatewayDelay")).toMatchObject({ state: "measured", value: 310, ratio: 310 });
  });

  // Ne compte que les octets envoyés depuis le dernier échantillon, et rien au premier : il n'y a pas de durée
  it("counts only the bytes sent since the last sample, and nothing at the first: there is no duration yet", async () => {
    const { capacity, sampleAfter, resourceOf } = setup();
    capacity.countBytes(5_000_000);
    await sampleAfter(0);
    expect(resourceOf("gatewayOutbound").state).toBe("withoutNews");

    await sampleAfter(); // aucun octet depuis

    expect(resourceOf("gatewayOutbound")).toMatchObject({ state: "measured", value: 0 });
  });

  // Journalise une mesure impossible, avec son contexte, et garde les autres
  it("logs a measure that fails, with its context, and keeps the others", async () => {
    const { state, warmUp, resourceOf } = setup();
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    state.redis = new Error("Redis injoignable");

    await warmUp();

    expect(logged).toHaveBeenCalledWith("gateway: capacité, mesure de Redis abandonnée", expect.any(Error));
    expect(resourceOf("redisMemory").state).toBe("withoutNews");
    expect(resourceOf("gatewayUtilization").state).toBe("measured");
  });

  // Ne mesure ni l'occupation ni le débit sur moins d'une seconde : le premier échantillon, au démarrage, ne mesurerait que lui
  it("measures neither the utilization nor the outbound rate over less than a second: the first sample would only measure the start", async () => {
    const { host, sampleAfter, resourceOf } = setup();
    host.utilization = 99; // le démarrage du process
    await sampleAfter(0);
    expect(resourceOf("gatewayUtilization").state).toBe("withoutNews");
    expect(resourceOf("gatewayOutbound").state).toBe("withoutNews");

    host.utilization = 20;
    await sampleAfter();

    expect(resourceOf("gatewayUtilization")).toMatchObject({ state: "measured", value: 20 });
  });

  // Arrondit chaque échantillon au millième : aucun bruit de virgule flottante sur le fil
  it("rounds each sample to the thousandth: no floating-point noise on the wire", async () => {
    const { host, warmUp, resourceOf } = setup();
    host.utilization = 12.3456789;

    await warmUp();

    expect(resourceOf("gatewayUtilization")).toMatchObject({ value: 12.346 });
  });

  // Dit une ressource sans nouvelles après trois cadences sans mesure, et la saturation incomplète
  it("says a resource without news after three cadences without a measure, and the saturation incomplete", async () => {
    const { state, frame, sampleAfter, warmUp, host, resourceOf } = setup();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    host.cpu = 5;
    await warmUp();
    expect(frame().saturation.isIncomplete).toBe(false);
    state.redis = new Error("Redis injoignable");

    await sampleAfter();
    await sampleAfter();
    await sampleAfter();
    expect(resourceOf("redisMemory").state).toBe("measured"); // 30 s après la dernière mesure : pas encore

    await sampleAfter();

    expect(resourceOf("redisMemory").state).toBe("withoutNews");
    expect(frame().saturation.isIncomplete).toBe(true);
  });
});

describe("what the web deposits (JOURNAL 2026-10-07)", () => {
  // Prend l'occupation du web déposée, avec l'instant de sa mesure, et la compte une fois même relue
  it("takes the utilization the web deposited, with the instant of its measure, and counts it once even if read again", async () => {
    const { state, sampleAfter, resourceOf } = setup();
    state.isWebAlive = false;
    state.web = { at: start, utilization: 90 };
    await sampleAfter(0);
    state.web = { at: start + 5000, utilization: 30 };
    await sampleAfter();
    await sampleAfter(); // le web n'a rien redéposé : la même mesure

    expect(resourceOf("webUtilization")).toMatchObject({ state: "measured", value: 90, ceiling: 100 });
  });

  // Dit le web sans nouvelles quand il n'a rien déposé, ou plus depuis trois cadences
  it("says the web without news when it deposited nothing, or nothing for three cadences", async () => {
    const { state, sampleAfter, resourceOf } = setup();
    state.isWebAlive = false;
    await sampleAfter(0);
    expect(resourceOf("webUtilization").state).toBe("withoutNews");

    state.web = { at: start, utilization: 10 };
    await sampleAfter();
    expect(resourceOf("webUtilization").state).toBe("measured");

    await sampleAfter();
    await sampleAfter();
    await sampleAfter();
    expect(resourceOf("webUtilization").state).toBe("withoutNews");
  });
});

describe("the Convex ceilings (JOURNAL 2026-10-07)", () => {
  const sixDays = start;
  // Convex : le 7 octobre à midi, 6,5 jours du mois sont écoulés sur 31

  // Somme les déploiements, projette le mois au rythme moyen, et nomme les déploiements comptés
  it("sums the deployments, projects the month at the average pace, and names the deployments counted", async () => {
    const { state, sampleAfter, resourceOf } = setup();
    state.convex = configured(
      ["watchful-spider-409", convexUsage({ at: sixDays, calls: 100_000, egressGb: 0.1 })],
      ["dev-deployment", convexUsage({ at: sixDays, calls: 95_000, egressGb: 0.05, computeGbHours: 1 })],
    );

    await sampleAfter(0);

    // 195 000 appels en 6,5 jours : 195 000 / 6,5 × 31 = 930 000 sur 1 000 000
    expect(resourceOf("convexCalls")).toMatchObject({
      state: "measured",
      ceiling: 1_000_000,
      ratio: 93,
      deployments: ["dev-deployment", "watchful-spider-409"],
    });
    expect(resourceOf("convexCalls")).not.toHaveProperty("fullAt");
    expect(resourceOf("convexEgress")).toMatchObject({ unit: "gigabytes", ceiling: 1, ratio: 71.5 });
    expect(resourceOf("convexCompute")).toMatchObject({ unit: "gigabyteHours", ceiling: 20, ratio: 23.8 });
    expect(resourceOf("convexDatabaseIo")).toMatchObject({ state: "measured", value: 0, ratio: 0 });
  });

  // Dit le jour où le quota serait plein quand son rythme l'y mène avant la fin du mois
  it("says the day the ceiling would be full when its pace leads there before the end of the month", async () => {
    const { state, sampleAfter, resourceOf } = setup();
    state.convex = configured(["watchful-spider-409", convexUsage({ at: sixDays, calls: 650_000 })]);

    await sampleAfter(0);

    // 650 000 en 6,5 jours : 100 000 par jour, plein à 10 jours, le 11 octobre à 00 h UTC
    expect(resourceOf("convexCalls")).toMatchObject({ fullAt: Date.UTC(2026, 9, 11) });
  });

  // Dit « non mesuré » sans déploiement configuré, et « sans nouvelles » en production, où ce serait une panne
  it("says not measured without a configured deployment, and without news in production, where it would be a failure", async () => {
    const dev = setup();
    dev.host.cpu = 5;
    const production = setup({ isProduction: true });
    production.host.cpu = 5;

    await dev.warmUp();
    await production.warmUp();

    expect(dev.resourceOf("convexCalls").state).toBe("unmeasured");
    expect(dev.frame().saturation.isIncomplete).toBe(false); // rien ne le mesure ici, et c'est normal
    expect(production.resourceOf("convexCalls").state).toBe("withoutNews");
    expect(production.frame().saturation.isIncomplete).toBe(true);
  });

  // Sans nouvelles quand le web n'a rien déposé de Convex, ou qu'un déploiement n'a pas été relu depuis 45 minutes
  it("says without news when the web deposited nothing of Convex, or a deployment was not read for 45 minutes", async () => {
    const { state, sampleAfter, resourceOf } = setup();
    state.convex = null;
    await sampleAfter(0);
    expect(resourceOf("convexCalls").state).toBe("withoutNews");

    state.convex = configured(
      ["watchful-spider-409", convexUsage({ at: sixDays, calls: 1 })],
      ["dev-deployment", convexUsage({ at: sixDays - 45 * MINUTE_MS, calls: 1 })],
    );
    await sampleAfter(0);
    expect(resourceOf("convexCalls").state).toBe("measured");

    await sampleAfter(MINUTE_MS);
    expect(resourceOf("convexCalls").state).toBe("withoutNews");
    expect(resourceOf("convexCalls")).toMatchObject({
      deployments: ["dev-deployment", "watchful-spider-409"],
    });
  });

  // Atteint le plafond d'un quota quand l'usage du mois, pas sa projection, le dépasse : 100 % pendant une heure
  it("reaches a ceiling when the usage of the month, not its projection, passes it: 100 % for an hour", async () => {
    const { state, clock, sampleAfter, frame } = setup();
    state.convex = configured(["watchful-spider-409", convexUsage({ at: sixDays, calls: 100_000 })]);
    await sampleAfter(0);
    expect(frame().saturation.percent).toBeLessThan(100);

    state.convex = configured(["watchful-spider-409", convexUsage({ at: sixDays, calls: 1_000_000 })]);
    await sampleAfter();

    expect(frame().saturation).toMatchObject({ percent: expect.any(Number), resource: "convexCalls" });
    expect(frame().saturation.percent).toBeGreaterThanOrEqual(100);
    expect(state.storedReached).toEqual([["convexCalls", clock.nowMs]]);
  });
});

describe("the ceilings reached (JOURNAL 2026-10-07)", () => {
  // Vaut 100 % pendant l'heure qui suit un refus d'écriture de Redis faute de mémoire, puis retombe
  it("is 100 % for the hour that follows a refusal of Redis for lack of memory, then falls back", async () => {
    const { state, clock, sampleAfter, frame } = setup();
    await sampleAfter(0);
    expect(frame().saturation.percent).toBeLessThan(100);

    state.redis = redisUsage({ outOfMemoryRefusals: 2 });
    await sampleAfter();

    expect(frame().saturation).toMatchObject({ percent: 100, resource: "redisMemory" });
    expect(state.storedReached).toEqual([["redisMemory", clock.nowMs]]);

    clock.nowMs += HOUR_MS - 1; // une milliseconde avant l'heure pleine, la mesure est vieille mais le plafond pèse encore
    expect(frame().saturation.percent).toBe(100);

    clock.nowMs += 1;
    expect(frame().saturation.percent).toBeLessThan(100);
  });

  // Ne prend pas pour un refus le compteur déjà haut à la première lecture : il ne dit rien du moment
  it("does not take for a refusal the counter already high at the first reading: it says nothing of when", async () => {
    const { state, sampleAfter, frame } = setup();
    state.redis = redisUsage({ outOfMemoryRefusals: 9 });

    await sampleAfter(0);
    await sampleAfter();

    expect(frame().saturation.percent).toBeLessThan(100);
    expect(state.storedReached).toEqual([]);
  });

  // Retrouve le plafond atteint d'avant son redémarrage, et élague au démarrage
  it("finds the ceiling reached from before its restart, and prunes at the start", async () => {
    const { state, capacity, clock, frame } = setup();
    state.reachedBefore = new Map([["redisMemory", start - 30 * MINUTE_MS]]);

    await capacity.start();

    expect(frame().saturation).toMatchObject({ percent: 100, resource: "redisMemory" });
    expect(state.prunedAt).toEqual([clock.nowMs]);
  });
});

describe("the history of the capacity (JOURNAL 2026-10-07)", () => {
  // Écrit, à la fin de chaque minute, le pic de sa saturation avec la ressource qui la portait et le plus haut taux de chaque maillon
  it("writes, at the end of each minute, the peak of its saturation with the resource that carried it and the highest ratio of each link", async () => {
    const { state, host, sampleAfter } = setup();
    state.isWebAlive = false; // le web n'a rien déposé : pas de taux pour son maillon
    host.utilization = 10;
    await sampleAfter(0);
    host.utilization = 70;
    await sampleAfter();
    host.utilization = 30;
    await sampleAfter();
    expect(state.storedMinutes).toEqual([]); // la minute n'est pas finie

    await sampleAfter(MINUTE_MS); // la minute d'après : celle de midi se ferme

    const [written] = state.storedMinutes;
    expect(state.storedMinutes).toHaveLength(1);
    expect(written).toMatchObject({ at: start, percent: 70, resource: "gatewayUtilization" });
    expect(written?.linkRatios).toMatchObject({ gateway: 70, redis: 62.1, machine: 37.5 });
    expect(written?.linkRatios).not.toHaveProperty("web"); // pas de taux, pas de zéro inventé
    expect(written?.linkRatios).not.toHaveProperty("convex"); // non mesuré
  });

  // Garde une minute que Redis refuse et la réécrit à l'échantillon suivant : aucune n'est perdue
  it("keeps a minute that Redis refuses and writes it again at the next sample: none is lost", async () => {
    const { state, sampleAfter } = setup();
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await sampleAfter(0);
    state.isRefusingMinutes = true;

    await sampleAfter(MINUTE_MS);

    expect(state.storedMinutes).toEqual([]);
    expect(logged).toHaveBeenCalledWith("gateway: capacité, minute non écrite", expect.any(Error));

    state.isRefusingMinutes = false;
    await sampleAfter();

    expect(state.storedMinutes).toHaveLength(1);
    expect(state.storedMinutes[0]?.at).toBe(start);
  });

  // Élague une fois par heure, pas à chaque échantillon
  it("prunes once an hour, not at each sample", async () => {
    const { state, clock, capacity, sampleAfter } = setup();
    await capacity.start();
    expect(state.prunedAt).toEqual([start]);

    await sampleAfter(MINUTE_MS);
    await sampleAfter(MINUTE_MS);
    expect(state.prunedAt).toHaveLength(1);

    await sampleAfter(HOUR_MS);

    expect(state.prunedAt).toEqual([start, clock.nowMs]);
  });
});
