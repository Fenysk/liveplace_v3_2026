import { MINUTE_MS, type Timestamp } from "@liveplace/domain";
import type { CapacityWrites, ConvexUsage, ConvexUsageSource, WebMeasure } from "@liveplace/domain/ports";
import type { Result } from "@liveplace/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCapacityReport } from "./capacity-report";

const start = Date.UTC(2026, 10, 7, 12, 0, 0);

type Usage = Omit<ConvexUsage, "at">;
const usage = (calls: number): Usage => ({ calls, databaseIoGb: 0.1, egressGb: 0.2, computeGbHours: 3 });

// Le web, son horloge, son Redis et ses déploiements, remplacés par ce que le test règle.
const setup = (sources: ConvexUsageSource[] = []) => {
  const clock = { nowMs: start };
  const stored = {
    utilizations: [] as WebMeasure[],
    usages: [] as [string, ConvexUsage][],
    unconfiguredCount: 0,
    isRefusing: false,
  };
  const writes: CapacityWrites = {
    async storeWebUtilization(measure) {
      if (stored.isRefusing) throw new Error("Redis refuse");
      stored.utilizations.push(measure);
    },
    async storeConvexUsage(deployment, convexUsage) {
      if (stored.isRefusing) throw new Error("Redis refuse");
      stored.usages.push([deployment, convexUsage]);
    },
    async storeConvexUnconfigured() {
      stored.unconfiguredCount += 1;
    },
  };
  const timers: { ms: number; run: () => Promise<void> }[] = [];
  const meter = { percent: 12.5 };
  const report = createCapacityReport({
    writes,
    now: () => clock.nowMs,
    getUtilizationPercent: () => meter.percent,
    sources,
    repeat: (ms, run) => timers.push({ ms, run }),
  });
  return { report, clock, stored, timers, meter };
};

// Sans autre précision, un déploiement ne dit pas son stock de fichiers : seul l'usage du mois se dépose.
const source = (
  name: string,
  getUsage: () => Promise<Result<Usage>>,
  getFilesBytes: () => Promise<Result<number>> = async () => ({ ok: false, error: "non lu" }),
): ConvexUsageSource => ({
  name,
  getUsage,
  getFilesBytes,
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined); // le stock non lu se journalise, ce n'est pas le sujet ici
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Écart §2 et §9 (JOURNAL 2026-10-07) : le web dépose son occupation et l'usage de Convex, par des minuteries de fond.
describe("the capacity report of the web (JOURNAL 2026-10-07)", () => {
  // Dépose son occupation avec l'instant de sa mesure
  it("deposits its utilization with the instant of its measure", async () => {
    const { report, stored, clock, meter } = setup();

    await report.reportUtilization();
    clock.nowMs += 10_000;
    meter.percent = 80;
    await report.reportUtilization();

    expect(stored.utilizations).toEqual([
      { at: start, utilization: 12.5 },
      { at: start + 10_000, utilization: 80 },
    ]);
  });

  // Lance deux minuteries : l'occupation toutes les 10 s, l'usage de Convex toutes les 15 minutes
  it("starts two timers: the utilization every 10 seconds, the Convex usage every 15 minutes", async () => {
    const { report, timers } = setup();

    await report.start();

    expect(timers.map(({ ms }) => ms)).toEqual([10_000, 15 * MINUTE_MS]);
  });

  // Dépose l'usage de chaque déploiement par son nom, à l'instant de sa lecture, et le fait une fois dès le démarrage
  it("deposits the usage of each deployment by its name, at the instant of its reading, once from the start", async () => {
    const reads: Timestamp[] = [];
    const { report, stored, clock } = setup([
      source("watchful-spider-409", async () => {
        reads.push(clock.nowMs);
        return { ok: true, value: usage(100) };
      }),
      source("happy-otter-123", async () => ({ ok: true, value: usage(7) })),
    ]);

    await report.start();

    expect(stored.usages).toEqual([
      ["watchful-spider-409", { at: start, ...usage(100) }],
      ["happy-otter-123", { at: start, ...usage(7) }],
    ]);
    expect(reads).toEqual([start]);
    expect(stored.unconfiguredCount).toBe(0);
  });

  // Dépose le stock de fichiers avec l'usage du mois quand le déploiement le dit (JOURNAL 2026-10-08)
  it("deposits the file stock with the usage of the month when the deployment says it", async () => {
    const { report, stored } = setup([
      source(
        "watchful-spider-409",
        async () => ({ ok: true, value: usage(100) }),
        async () => ({
          ok: true,
          value: 327_155_712,
        }),
      ),
      source("happy-otter-123", async () => ({ ok: true, value: usage(7) })),
    ]);

    await report.start();

    expect(stored.usages).toEqual([
      ["watchful-spider-409", { at: start, ...usage(100), filesBytes: 327_155_712 }],
      ["happy-otter-123", { at: start, ...usage(7) }],
    ]);
  });

  // Un stock qu'on ne peut pas lire n'empêche pas l'usage du mois : il se journalise par le nom du déploiement, sans clé
  it("deposits the usage of the month without the stock when it cannot be read, and logs the reason by the name", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { report, stored } = setup([
      source(
        "watchful-spider-409",
        async () => ({ ok: true, value: usage(100) }),
        async () => ({
          ok: false,
          error: "HTTP 401",
        }),
      ),
    ]);

    await report.start();

    expect(stored.usages).toEqual([["watchful-spider-409", { at: start, ...usage(100) }]]);
    expect(logged).toHaveBeenCalledWith(
      "web: capacité, stockage des fichiers de Convex non lu pour watchful-spider-409 : HTTP 401",
    );
  });

  // Relit Convex à chaque passage de sa minuterie, et l'occupation à chaque passage de la sienne
  it("reads Convex again at each pass of its timer, and the utilization at each pass of its own", async () => {
    const { report, stored, timers, clock } = setup([
      source("watchful-spider-409", async () => ({ ok: true, value: usage(1) })),
    ]);
    await report.start();
    clock.nowMs += 15 * MINUTE_MS;

    await timers[0]?.run();
    await timers[1]?.run();

    expect(stored.utilizations).toEqual([{ at: clock.nowMs, utilization: 12.5 }]);
    expect(stored.usages.map(([, { at }]) => at)).toEqual([start, clock.nowMs]);
  });

  // Dit « non configuré » sans déploiement, au démarrage et à chaque lecture
  it("says unconfigured without a deployment, from the start and at each reading", async () => {
    const { report, stored, timers } = setup();

    await report.start();
    await timers[1]?.run();

    expect(stored.unconfiguredCount).toBe(2);
    expect(stored.usages).toEqual([]);
  });

  // Garde les autres déploiements quand l'un échoue, et le journalise par son nom, sans clé : la raison seule
  it("keeps the other deployments when one fails, logging it by its name, without a key: the reason only", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { report, stored } = setup([
      source("watchful-spider-409", async () => ({ ok: false, error: "HTTP 401" })),
      source("happy-otter-123", async () => ({ ok: true, value: usage(7) })),
    ]);

    await report.start();

    expect(stored.usages).toEqual([["happy-otter-123", { at: start, ...usage(7) }]]);
    expect(logged).toHaveBeenCalledWith(
      "web: capacité, usage de Convex non lu pour watchful-spider-409 : HTTP 401",
    );
  });

  // Ne plante jamais quand Redis refuse un dépôt : la minuterie continue, l'erreur est journalisée
  it("never crashes when Redis refuses a deposit: the timer goes on, the error is logged", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { report, stored, timers } = setup([
      source("watchful-spider-409", async () => ({ ok: true, value: usage(1) })),
    ]);
    stored.isRefusing = true;

    await report.start();
    await timers[0]?.run();
    await timers[1]?.run();

    expect(logged).toHaveBeenCalledWith("web: capacité, usage de Convex non déposé", expect.any(Error));
    expect(logged).toHaveBeenCalledWith("web: capacité, occupation non déposée", expect.any(Error));
    expect(stored.usages).toEqual([]);
  });
});
