import { HOUR_MS, MINUTE_MS, toActivityPointStarts } from "@liveplace/domain";
import type { CapacityMinute, ConvexUsage } from "@liveplace/domain/ports";
import { describe, expect, it } from "vitest";
import {
  createCapacityStore,
  createCapacityWrites,
  createSnapshotDelayWrites,
  parseRedisUsage,
} from "./capacity";
import { CAPACITY_HOURS_RETENTION_MS, CAPACITY_MINUTES_RETENTION_MS } from "./keys";
import { createRedisHarness } from "./test-harness";

const harness = createRedisHarness();
const { redis } = harness;

const DAY_MS = 24 * HOUR_MS;
const now = Date.UTC(2026, 9, 6, 12, 30, 15); // 14 h 30 à Paris
const { minute: minuteAt, hour: hourAt, day: dayAt } = toActivityPointStarts(now);

// Chaque test a ses propres clés : la capacité est globale, aucun canvas ne la sépare.
const stores = () => {
  const keys = harness.uniqueCapacityKeys();
  return { keys, store: createCapacityStore(redis, keys), writes: createCapacityWrites(redis, keys) };
};

const minute = (at: number, counts: Partial<CapacityMinute> = {}): CapacityMinute => ({
  at,
  percent: 0,
  linkRatios: {},
  ...counts,
});

const usage = (counts: Partial<ConvexUsage> = {}): ConvexUsage => ({
  at: now,
  calls: 0,
  databaseIoGb: 0,
  egressGb: 0,
  computeGbHours: 0,
  ...counts,
});

describe("the capacity history in Redis (écart §5.1, JOURNAL 2026-10-07)", () => {
  // Garde le pic de la saturation, la ressource qui la portait et le plus haut taux de chaque maillon, minute, heure, jour
  it("keeps the peak of the saturation, the resource that carried it and the highest ratio of each link, on the minute, hour and day", async () => {
    const { store } = stores();

    await store.storeCapacityMinute(
      minute(minuteAt - MINUTE_MS, {
        percent: 62.5,
        resource: "redisMemory",
        linkRatios: { redis: 62.5, gateway: 10 },
      }),
    );
    await store.storeCapacityMinute(
      minute(minuteAt - MINUTE_MS, {
        percent: 40,
        resource: "gatewayDelay",
        linkRatios: { redis: 20, gateway: 40, web: 5 },
      }),
    );
    await store.storeCapacityMinute(
      minute(minuteAt - 2 * MINUTE_MS, { percent: 12, resource: "webUtilization", linkRatios: { web: 12 } }),
    );

    expect(await store.listCapacityHistory("day", now)).toEqual([
      { at: minuteAt - 2 * MINUTE_MS, saturation: 12, resource: "webUtilization", web: 12 },
      {
        at: minuteAt - MINUTE_MS,
        saturation: 62.5,
        resource: "redisMemory",
        redis: 62.5,
        gateway: 40,
        web: 5,
      },
    ]);
    const peak = { saturation: 62.5, resource: "redisMemory", redis: 62.5, gateway: 40, web: 12 };
    expect(await store.listCapacityHistory("month", now)).toEqual([{ at: hourAt, ...peak }]);
    expect(await store.listCapacityHistory("all", now)).toEqual([{ at: dayAt, ...peak }]);
  });

  // Un maillon sans mesure n'a pas de taux : la courbe laisse un trou, jamais un zéro inventé
  it("gives no ratio to a link without a measure: the curve leaves a gap, never a made-up zero", async () => {
    const { store } = stores();

    await store.storeCapacityMinute(
      minute(minuteAt - MINUTE_MS, { percent: 0, resource: "redisCpu", linkRatios: { redis: 0 } }),
    );

    expect(await store.listCapacityHistory("day", now)).toEqual([
      { at: minuteAt - MINUTE_MS, saturation: 0, resource: "redisCpu", redis: 0 },
    ]);
  });

  // Une minute sans ressource mesurée garde sa saturation à zéro, sans ressource porteuse, et une mesure ultérieure la remplace
  it("keeps a minute without a measured resource at zero with no carrier, and a later measure replaces it", async () => {
    const { store } = stores();
    const at = minuteAt - MINUTE_MS;

    await store.storeCapacityMinute(minute(at));
    expect(await store.listCapacityHistory("day", now)).toEqual([{ at, saturation: 0 }]);

    await store.storeCapacityMinute(
      minute(at, { percent: 3, resource: "machineDisk", linkRatios: { machine: 3 } }),
    );
    expect(await store.listCapacityHistory("day", now)).toEqual([
      { at, saturation: 3, resource: "machineDisk", machine: 3 },
    ]);
  });

  // Laisse absent le point d'une minute sans gateway : on ne comble pas
  it("leaves out the point of a minute without a gateway: nothing is filled in", async () => {
    const { store } = stores();

    await store.storeCapacityMinute(minute(minuteAt - 3 * MINUTE_MS, { percent: 2, resource: "redisCpu" }));
    await store.storeCapacityMinute(minute(minuteAt - MINUTE_MS, { percent: 2, resource: "redisCpu" }));

    const ats = (await store.listCapacityHistory("day", now)).map(({ at }) => at);
    expect(ats).toEqual([minuteAt - 3 * MINUTE_MS, minuteAt - MINUTE_MS]);
  });

  // Rend les 1 440 dernières minutes, les 720 dernières heures, puis tous les jours, du plus ancien au plus récent
  it("lists the last 1,440 minutes, the last 720 hours, then every day, oldest first", async () => {
    const { store } = stores();
    const dayBefore = now - 25 * HOUR_MS;
    const longAgo = now - 40 * DAY_MS;

    for (const at of [longAgo, dayBefore, now - 2 * MINUTE_MS])
      await store.storeCapacityMinute(
        minute(toActivityPointStarts(at).minute, { percent: 1, resource: "redisCpu" }),
      );

    expect(await store.listCapacityHistory("day", now)).toHaveLength(1);
    expect((await store.listCapacityHistory("month", now)).map(({ at }) => at)).toEqual([
      toActivityPointStarts(dayBefore).hour,
      hourAt,
    ]);
    expect((await store.listCapacityHistory("all", now)).map(({ at }) => at)).toEqual([
      toActivityPointStarts(longAgo).day,
      toActivityPointStarts(dayBefore).day,
      dayAt,
    ]);
  });

  // Élague les minutes de plus de 7 jours et les heures de plus de 366 jours, jamais les jours
  it("prunes the minutes older than 7 days and the hours older than 366 days, never the days", async () => {
    const { store, keys } = stores();
    const past = now - CAPACITY_MINUTES_RETENTION_MS - 2 * MINUTE_MS;
    const older = now - CAPACITY_HOURS_RETENTION_MS - 2 * HOUR_MS;
    for (const at of [older, past, now - 5 * MINUTE_MS])
      await store.storeCapacityMinute(
        minute(toActivityPointStarts(at).minute, { percent: 1, resource: "redisCpu" }),
      );

    await store.pruneCapacity(now);

    const keptHours = [past, now - 5 * MINUTE_MS].map((at) => toActivityPointStarts(at).hour);
    expect((await redis.hkeys(keys.minutes)).map(Number)).toEqual([
      toActivityPointStarts(now - 5 * MINUTE_MS).minute,
    ]);
    expect((await redis.hkeys(keys.hours)).map(Number).sort((left, right) => left - right)).toEqual(
      keptHours,
    );
    expect(await redis.hlen(keys.days)).toBe(3);
  });
});

describe("the guards of the gateway in Redis (JOURNAL 2026-10-09)", () => {
  const guard = (at: number, refusedPlacements: number, closedConnections: number) => ({
    at,
    refusedPlacements,
    closedConnections,
  });

  // Garde une minute de protections à son début, et une seconde écriture de la même minute la remplace sans la doubler
  it("keeps a minute of guards at its start, and a second write of the same minute replaces it instead of doubling it", async () => {
    const { store, keys } = stores();

    await store.storeGuardMinutes([guard(minuteAt - 5 * MINUTE_MS, 3, 0)]);
    await store.storeGuardMinutes([
      guard(minuteAt - 5 * MINUTE_MS, 3, 1),
      guard(minuteAt - MINUTE_MS, 12, 0),
    ]);

    expect(await redis.hgetall(keys.guards)).toEqual({
      [minuteAt - 5 * MINUTE_MS]: "3,1",
      [minuteAt - MINUTE_MS]: "12,0",
    });
  });

  // Rend les 1 440 dernières minutes, du plus ancien au plus récent, sans les minutes où rien n'a joué ni celles de plus d'un jour
  it("lists the last 1,440 minutes, oldest first, without the minutes where nothing happened nor those over a day old", async () => {
    const { store } = stores();
    const minutes = [
      guard(minuteAt - DAY_MS - MINUTE_MS, 9, 9),
      guard(minuteAt - 600 * MINUTE_MS, 5, 0),
      guard(minuteAt - 30 * MINUTE_MS, 2, 1),
      guard(minuteAt - MINUTE_MS, 0, 3),
    ];

    await store.storeGuardMinutes(minutes);

    expect(await store.listGuardMinutes(now)).toEqual(minutes.slice(1));
  });

  // N'écrit rien pour aucune minute, et ne lit rien d'une clé absente
  it("writes nothing for no minute, and lists nothing from an absent key", async () => {
    const { store, keys } = stores();

    await store.storeGuardMinutes([]);

    expect(await redis.exists(keys.guards)).toBe(0);
    expect(await store.listGuardMinutes(now)).toEqual([]);
  });

  // Élague les minutes de protections de plus de 7 jours avec celles de la capacité
  it("prunes the minutes of guards older than 7 days with the capacity minutes", async () => {
    const { store, keys } = stores();
    const past = toActivityPointStarts(now - CAPACITY_MINUTES_RETENTION_MS - 2 * MINUTE_MS).minute;

    await store.storeGuardMinutes([guard(past, 4, 0), guard(minuteAt - 5 * MINUTE_MS, 1, 1)]);
    await store.pruneCapacity(now);

    expect((await redis.hkeys(keys.guards)).map(Number)).toEqual([minuteAt - 5 * MINUTE_MS]);
  });
});

describe("what the web deposits (écart §2 et §9, JOURNAL 2026-10-07)", () => {
  // Garde l'occupation du web avec l'instant de sa mesure, et dit qu'il n'a rien déposé quand c'est le cas
  it("keeps the utilization of the web with the instant of its measure, and says it deposited nothing when it did not", async () => {
    const { store, writes } = stores();
    expect(await store.getWebMeasure()).toBeNull();

    await writes.storeWebUtilization({ at: now - 10_000, utilization: 12.5 });
    await writes.storeWebUtilization({ at: now, utilization: 7.25 });

    expect(await store.getWebMeasure()).toEqual({ at: now, utilization: 7.25 });
  });

  // Garde l'usage de chaque déploiement Convex par son nom, avec l'instant de sa lecture
  it("keeps the usage of each Convex deployment by its name, with the instant of its reading", async () => {
    const { store, writes } = stores();
    expect(await store.getConvexDeposit()).toBeNull();

    await writes.storeConvexUsage(
      "watchful-spider-409",
      usage({ calls: 120, databaseIoGb: 0.25, egressGb: 0.5, computeGbHours: 1.5 }),
    );
    await writes.storeConvexUsage("dev-deployment", usage({ at: now - 1000, calls: 30 }));
    await writes.storeConvexUsage("dev-deployment", usage({ at: now, calls: 40 }));

    expect(await store.getConvexDeposit()).toEqual({
      status: "configured",
      deployments: new Map([
        [
          "watchful-spider-409",
          usage({ calls: 120, databaseIoGb: 0.25, egressGb: 0.5, computeGbHours: 1.5 }),
        ],
        ["dev-deployment", usage({ calls: 40 })],
      ]),
    });
  });

  // Le stock de fichiers de Convex suit l'usage du mois quand le web le dit, et son absence ne casse pas le reste (JOURNAL 2026-10-08)
  it("keeps the file stock of a deployment when the web says it, and reads a deposit without it as before", async () => {
    const { store, writes } = stores();

    await writes.storeConvexUsage("with-files", usage({ calls: 3, filesBytes: 312 * 1024 ** 2 }));
    await writes.storeConvexUsage("without-files", usage({ calls: 4 }));

    expect(await store.getConvexDeposit()).toEqual({
      status: "configured",
      deployments: new Map([
        ["with-files", usage({ calls: 3, filesBytes: 312 * 1024 ** 2 })],
        ["without-files", usage({ calls: 4 })],
      ]),
    });
  });

  // Un déploiement jamais lu se dépose « vieux de toujours » (instant 0) : le gateway le voit et ne somme pas les autres seuls
  it("keeps a deployment never read as an old deposit, so the gateway sees it and never sums the others alone", async () => {
    const { store, writes } = stores();

    await writes.storeConvexUsage("dev-deployment", usage({ calls: 4, filesBytes: 1000 }));
    await writes.storeConvexUnread("prod-deployment");

    expect(await store.getConvexDeposit()).toEqual({
      status: "configured",
      deployments: new Map([
        ["dev-deployment", usage({ calls: 4, filesBytes: 1000 })],
        ["prod-deployment", usage({ at: 0 })],
      ]),
    });
  });

  // « Jamais lu » ne remplace pas une lecture déjà là, qui vieillit seule ; une lecture remplace « jamais lu »
  it("never replaces a reading by never read, and a reading replaces never read", async () => {
    const { store, writes } = stores();
    await writes.storeConvexUsage("known", usage({ calls: 4 }));

    await writes.storeConvexUnread("known");
    await writes.storeConvexUnread("unknown");
    await writes.storeConvexUsage("unknown", usage({ calls: 9, filesBytes: 5 }));

    expect(await store.getConvexDeposit()).toEqual({
      status: "configured",
      deployments: new Map([
        ["known", usage({ calls: 4 })],
        ["unknown", usage({ calls: 9, filesBytes: 5 })],
      ]),
    });
  });

  // Le premier « jamais lu » efface « non configuré » : la variable vient d'être posée, et un déploiement qui ne répond pas est une panne
  it("makes the first never read clear unconfigured: the variable was just set, and a deployment that does not answer is a failure", async () => {
    const { store, writes, keys } = stores();
    await writes.storeConvexUnconfigured();

    await writes.storeConvexUnread("prod-deployment");

    expect(await redis.exists(keys.convexUnconfigured)).toBe(0);
    expect(await store.getConvexDeposit()).toEqual({
      status: "configured",
      deployments: new Map([["prod-deployment", usage({ at: 0 })]]),
    });
  });

  // Dit « non configuré » en retirant les déploiements d'avant, et la première lecture d'un déploiement le rend configuré
  it("says unconfigured by dropping the deployments from before, and the first reading of a deployment makes it configured", async () => {
    const { store, writes, keys } = stores();
    await writes.storeConvexUsage("old-deployment", usage({ calls: 1 }));

    await writes.storeConvexUnconfigured();

    expect(await store.getConvexDeposit()).toEqual({ status: "unconfigured" });
    expect(await redis.exists(keys.convex)).toBe(0);

    await writes.storeConvexUsage("new-deployment", usage({ calls: 2 }));

    expect(await store.getConvexDeposit()).toEqual({
      status: "configured",
      deployments: new Map([["new-deployment", usage({ calls: 2 })]]),
    });
  });

  // Ne laisse que des nombres et des noms de déploiement dans Redis : ni clé, ni URL
  it("leaves only numbers and deployment names in Redis: no key, no URL", async () => {
    const { writes, keys } = stores();

    await writes.storeConvexUsage("watchful-spider-409", usage({ calls: 5 }));

    const stored = await redis.hgetall(keys.convex);
    expect(Object.keys(stored)).toEqual(["watchful-spider-409"]);
    expect(stored["watchful-spider-409"]).toMatch(/^[\d.,]+$/);
  });
});

describe("what the worker deposits (JOURNAL 2026-10-08)", () => {
  // Garde le retard de la sauvegarde avec l'instant de sa mesure, et dit que le worker n'a rien déposé quand c'est le cas
  it("keeps the snapshot delay with the instant of its measure, and says nothing was deposited when it was not", async () => {
    const { keys, store } = stores();
    const writes = createSnapshotDelayWrites(redis, keys);
    expect(await store.getSnapshotMeasure()).toBeNull();

    await writes.storeSnapshotDelay({ at: now - 10_000, delayMs: 12_000 });
    await writes.storeSnapshotDelay({ at: now, delayMs: 0 });

    expect(await store.getSnapshotMeasure()).toEqual({ at: now, delayMs: 0 });
    expect(await redis.ttl(keys.snapshot)).toBe(-1); // sans EXPIRE : l'instant de la mesure dit si le worker est là
  });
});

describe("the ceilings reached (JOURNAL 2026-10-07)", () => {
  // Retient l'instant du dernier plafond atteint de chaque ressource, et le retrouve dans un autre store : un redémarrage
  it("remembers the instant of the last ceiling reached by each resource, and finds it again in another store: a restart", async () => {
    const { store, keys } = stores();
    expect(await store.listCeilingsReached()).toEqual(new Map());

    await store.storeCeilingReached("redisMemory", now - HOUR_MS);
    await store.storeCeilingReached("redisMemory", now);
    await store.storeCeilingReached("convexCalls", now - 5000);

    const afterRestart = createCapacityStore(redis, keys);
    expect(await afterRestart.listCeilingsReached()).toEqual(
      new Map([
        ["redisMemory", now],
        ["convexCalls", now - 5000],
      ]),
    );
  });

  // Ignore une ressource que le cahier des charges ne connaît plus
  it("ignores a resource that the specification no longer knows", async () => {
    const { store, keys } = stores();
    await redis.hset(keys.reached, { redisDisk: String(now), redisCpu: String(now) });

    expect(await store.listCeilingsReached()).toEqual(new Map([["redisCpu", now]]));
  });
});

describe("what Redis says of itself (INFO)", () => {
  const report = [
    "# Memory",
    "used_memory:318000000",
    "used_memory_human:303.28M",
    "maxmemory:536870912",
    "# CPU",
    "used_cpu_sys:731.487345",
    "used_cpu_user:3112.746770",
    "used_cpu_sys_main_thread:725.322067",
    "used_cpu_user_main_thread:3111.891784",
    "# Errorstats",
    "errorstat_ERR:count=1",
    "errorstat_OOM:count=3",
    "",
  ].join("\r\n");

  // Lit la mémoire, son plafond, le processeur du fil principal et les refus faute de mémoire
  it("reads the memory, its ceiling, the CPU of the main thread and the refusals for lack of memory", () => {
    expect(parseRedisUsage(report)).toEqual({
      usedMemoryBytes: 318_000_000,
      maxMemoryBytes: 536_870_912,
      cpuSeconds: 725.322067 + 3111.891784,
      outOfMemoryRefusals: 3,
    });
  });

  // Aucun refus tant que Redis n'en a pas compté un, et un plafond à zéro : sans limite
  it("counts no refusal until Redis has counted one, and a ceiling at zero means no limit", () => {
    const calm = report
      .replace("errorstat_OOM:count=3\r\n", "")
      .replace("maxmemory:536870912", "maxmemory:0");

    expect(parseRedisUsage(calm)).toMatchObject({ maxMemoryBytes: 0, outOfMemoryRefusals: 0 });
  });

  // Une version de Redis sans le fil principal compte le processeur de tout le serveur
  it("counts the CPU of the whole server for a Redis version without the main thread", () => {
    const before = report
      .split("\r\n")
      .filter((line) => !line.includes("main_thread"))
      .join("\r\n");

    expect(parseRedisUsage(before)?.cpuSeconds).toBeCloseTo(731.487345 + 3112.74677, 6);
  });

  // Refuse un rapport où manque la mémoire : rien n'est inventé
  it("refuses a report that misses the memory: nothing is made up", () => {
    expect(parseRedisUsage("# CPU\r\nused_cpu_sys:1\r\nused_cpu_user:1\r\n")).toBeNull();
    expect(parseRedisUsage("")).toBeNull();
  });

  // Lit le vrai Redis du poste : de la mémoire, un plafond, du processeur
  it("reads the real Redis of the workstation: memory, a ceiling, CPU", async () => {
    const { store } = stores();

    const real = await store.getRedisUsage();

    expect(real.usedMemoryBytes).toBeGreaterThan(0);
    expect(real.maxMemoryBytes).toBe(Number((await redis.config("GET", "maxmemory"))[1]));
    expect(real.cpuSeconds).toBeGreaterThan(0);
    expect(real.outOfMemoryRefusals).toBeGreaterThanOrEqual(0);
  });
});
