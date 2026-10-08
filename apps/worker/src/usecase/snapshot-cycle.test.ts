import type { CanvasStatus } from "@liveplace/domain";
import type { CanvasActivity, SnapshotFile, SnapshotSource, SnapshotStore } from "@liveplace/domain/ports";
import { type CanvasSnapshot, SNAPSHOT_SCHEMA_VERSION } from "@liveplace/domain/snapshot";
import { describe, expect, it } from "vitest";
import { createSnapshotCycle } from "./snapshot-cycle";
import {
  createSnapshotPlan,
  MIN_INTERVAL_MS,
  PLACEMENT_INTERVAL_MS,
  REFRESH_INTERVAL_MS,
  URGENT_DEBOUNCE_MS,
} from "./snapshot-plan";

const t0 = 1_700_000_000_000;

const snapshotOf = (canvasId: string, version: number, takenAt: number): CanvasSnapshot => ({
  schemaVersion: SNAPSHOT_SCHEMA_VERSION,
  canvasId,
  version,
  takenAt,
  meta: {},
  authors: [],
  placements: [],
  cells: [],
  progress: {},
  bans: [],
  bansTwitch: [],
  banProofs: {},
  cleared: {},
  clearedPlacements: [],
  clearedRanges: {},
  mods: [],
  modsTwitch: [],
  modsLiveplace: [],
  twitchUsers: {},
  reported: [],
  reports: {},
  offStream: [],
  approved: [],
});

// Redis et Convex en mémoire : ce que le cycle lit, et ce qu'il range.
const setup = async (
  redisVersions: Record<string, number>,
  // Le balayage rend chaque canvas de Redis avec ses joueurs : ici, un seul par canvas.
  players: Record<string, string[]> = Object.fromEntries(
    Object.keys(redisVersions).map((canvasId) => [canvasId, ["player-1"]]),
  ),
  latest: { canvasId: string; version: number; takenAt: number }[] = [],
) => {
  let clock = t0;
  const reads: { canvasId: string; players: readonly string[]; takenAt: number }[] = [];
  const stored: SnapshotFile[] = [];
  const failures = new Set<string>();
  const keptAtZero = new Set<string>(); // en version 0 mais avec un banni, un modérateur ou une progression
  const successors: Record<string, string> = {};
  const listed: string[] = []; // les canvas dont le cycle a demandé les joueurs un par un
  let listCostMs = 0;
  let storeAnswer: "stored" | "refused" = "stored";
  let activity: ((activity: CanvasActivity) => void) | null = null;

  const source: SnapshotSource = {
    listCanvases: async () => new Map(Object.entries(players)),
    listPlayers: async (canvasId) => {
      listed.push(canvasId);
      return players[canvasId] ?? ["found-player"];
    },
    getSuccessorId: async (canvasId) => successors[canvasId] ?? null,
    getVersion: async (canvasId) => redisVersions[canvasId] ?? null,
    getCanvasSnapshot: async (canvasId, readPlayers, takenAt) => {
      reads.push({ canvasId, players: readPlayers, takenAt });
      const version = redisVersions[canvasId] ?? 0;
      clock += listCostMs;
      if (failures.has(canvasId)) throw new Error("Redis a coupé");
      return version === 0 && !keptAtZero.has(canvasId) ? null : snapshotOf(canvasId, version, takenAt);
    },
    watch: async (onActivity) => {
      activity = onActivity;
      return async () => {
        activity = null;
      };
    },
  };
  const store: SnapshotStore = {
    storeSnapshot: async (file) => {
      stored.push(file);
      return storeAnswer;
    },
    listLatestSnapshots: async () => latest,
    getLatestSnapshot: async () => null,
  };
  const plan = createSnapshotPlan();
  const knownSaved: string[] = []; // les canvas dont le cycle dit à la récupération qu'ils ont une sauvegarde
  const notifiedStored: { canvasId: string; version: number; takenAt: number }[] = []; // ce que la rétention apprend
  const cycle = createSnapshotCycle({
    source,
    store,
    plan,
    onSaved: (canvasId) => knownSaved.push(canvasId),
    onStored: (file) => notifiedStored.push(file),
    encode: async (snapshot) => new TextEncoder().encode(JSON.stringify(snapshot)),
    now: () => clock,
    log: () => undefined,
  });
  await cycle.start();
  return {
    cycle,
    reads,
    stored,
    knownSaved,
    notifiedStored,
    failures,
    keptAtZero,
    successors,
    listed,
    advance: (ms: number) => {
      clock += ms;
    },
    setListCost: (ms: number) => {
      listCostMs = ms;
    },
    answerStore: (answer: "stored" | "refused") => {
      storeAnswer = answer;
    },
    emit: (canvasId: string, isPlacement: boolean, status?: CanvasStatus) =>
      activity?.({ canvasId, isPlacement, ...(status ? { status } : {}) }),
  };
};

describe("what the snapshot cycle tells the others (JOURNAL 2026-10-08)", () => {
  // La rétention apprend chaque sauvegarde de travail rangée, avec sa version et sa date
  it("tells the retention which working save it stored", async () => {
    const { cycle, notifiedStored } = await setup({ "canvas-1": 4 });

    await cycle.sweep();
    await cycle.tick();

    expect(notifiedStored).toEqual([{ canvasId: "canvas-1", version: 4, takenAt: t0 }]);
  });

  // Une sauvegarde que Convex refuse n'est pas rangée : la rétention ne l'apprend pas
  it("does not tell the retention about a save Convex refused", async () => {
    const { cycle, notifiedStored, answerStore } = await setup({ "canvas-1": 4 });
    answerStore("refused");

    await cycle.sweep();
    await cycle.tick();

    expect(notifiedStored).toEqual([]);
  });

  // Le retard : l'âge de la plus ancienne modification pas encore sauvegardée, 0 quand tout l'est
  it("measures the age of the oldest modification not saved yet, and zero once everything is", async () => {
    const { cycle, advance, emit } = await setup({ "canvas-1": 4 });
    await cycle.sweep();
    await cycle.tick();
    expect(cycle.getDelayMs()).toBe(0);

    emit("canvas-1", true);
    advance(120_000);
    expect(cycle.getDelayMs()).toBe(120_000);

    advance(PLACEMENT_INTERVAL_MS);
    await cycle.tick();
    expect(cycle.getDelayMs()).toBe(0);
  });
});

describe("the snapshot cycle (Écart §7.2, JOURNAL 2026-10-06)", () => {
  // Quand le balayage voit un canvas qui a des poses et aucune sauvegarde, le tour la fait et la range sous son palier
  it("saves a canvas the sweep finds, as a working snapshot with its players", async () => {
    const { cycle, stored, reads } = await setup({ "canvas-1": 4 }, { "canvas-1": ["a", "b"] });

    await cycle.sweep();
    await cycle.tick();

    expect(reads).toEqual([{ canvasId: "canvas-1", players: ["a", "b"], takenAt: t0 }]);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      canvasId: "canvas-1",
      tier: "working",
      version: 4,
      takenAt: t0,
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    });
    expect(stored[0]?.bytes.byteLength).toBeGreaterThan(0);
  });

  // Quand le tour suivant n'a rien de neuf, il ne lit plus Redis
  it("saves nothing twice when nothing happened", async () => {
    const { cycle, stored, advance } = await setup({ "canvas-1": 4 });
    await cycle.sweep();
    await cycle.tick();
    advance(MIN_INTERVAL_MS);

    await cycle.tick();

    expect(stored).toHaveLength(1);
  });

  // Quand une modération passe, le snapshot suit après une demi-seconde de calme, sans attendre les cinq minutes
  it("saves again half a second after a moderation, not five minutes", async () => {
    const { cycle, stored, advance, emit } = await setup({ "canvas-1": 4 });
    await cycle.sweep();
    await cycle.tick();
    advance(MIN_INTERVAL_MS * 2);

    emit("canvas-1", false);
    advance(URGENT_DEBOUNCE_MS - 1);
    await cycle.tick();
    advance(1);
    await cycle.tick();

    expect(stored).toHaveLength(2);
  });

  // Quand une pose passe, le snapshot suit au tour de cinq minutes
  it("saves again five minutes after a placement", async () => {
    const { cycle, stored, advance, emit } = await setup({ "canvas-1": 4 });
    await cycle.sweep();
    await cycle.tick();

    emit("canvas-1", true);
    advance(PLACEMENT_INTERVAL_MS - 1);
    await cycle.tick();
    advance(1);
    await cycle.tick();

    expect(stored).toHaveLength(2);
  });

  // Un canvas que personne n'a touché (version 0) n'est jamais sauvegardé : rien à lire, rien à ranger
  it("skips a canvas nobody ever touched", async () => {
    const { cycle, stored } = await setup({ "canvas-1": 0 });

    await cycle.sweep();
    await cycle.tick();

    expect(stored).toEqual([]);
  });

  // La récupération apprend chaque canvas que Convex garde : au démarrage, puis à chaque sauvegarde, refusée ou non
  it("tells the recovery about every canvas Convex holds: at start, then at each save, refused or not", async () => {
    const { cycle, knownSaved, answerStore } = await setup({ "canvas-1": 4, "canvas-2": 7 }, undefined, [
      { canvasId: "canvas-0", version: 3, takenAt: t0 },
    ]);
    expect(knownSaved).toEqual(["canvas-0"]);

    answerStore("refused");
    await cycle.sweep();
    await cycle.tick();

    expect([...knownSaved].sort()).toEqual(["canvas-0", "canvas-1", "canvas-2"]);
  });

  // Un canvas que la source ne garde pas (rien à ranger) n'est pas connu de la récupération
  it("does not tell the recovery about a canvas it had nothing to save for", async () => {
    const { cycle, knownSaved } = await setup({ "canvas-1": 0 });

    await cycle.sweep();
    await cycle.tick();

    expect(knownSaved).toEqual([]);
  });

  // Un canvas en version 0 est demandé à la source au premier balayage, et sauvegardé quand elle y trouve un banni, un
  // modérateur ou une progression (JOURNAL 2026-10-08) : la source en décide, le cycle ne fait que demander
  it("asks the source about a canvas at version 0 and saves it when the source keeps it", async () => {
    const { cycle, stored, reads, keptAtZero } = await setup({ "canvas-1": 0, "canvas-2": 0 });
    keptAtZero.add("canvas-2");

    await cycle.sweep();
    await cycle.tick();

    expect(reads.map(({ canvasId }) => canvasId).sort()).toEqual(["canvas-1", "canvas-2"]);
    expect(stored.map(({ canvasId, version }) => [canvasId, version])).toEqual([["canvas-2", 0]]);
  });

  // Un canvas que le balayage n'a pas vu (le canvas neuf d'un archivage) reçoit ses joueurs de la source, une fois
  it("asks the source for the players of a canvas the sweep has not seen, once", async () => {
    const { cycle, stored, reads, listed, emit, advance } = await setup({ "canvas-2": 0 }, {});
    await cycle.sweep();

    emit("canvas-2", false);
    advance(MIN_INTERVAL_MS);
    await cycle.tick();
    emit("canvas-2", false);
    advance(MIN_INTERVAL_MS);
    await cycle.tick();

    expect(listed).toEqual(["canvas-2"]);
    expect(reads.map(({ players }) => players)).toEqual([["found-player"], ["found-player"]]);
    expect(stored).toEqual([]);
  });

  // Archiver : seul le sortant publie son statut, le worker sauvegarde aussi son successeur, sans attendre le balayage
  it("saves the successor of an archived canvas too, as soon as the archived one reports its status", async () => {
    const { cycle, stored, emit, advance, successors, keptAtZero } = await setup(
      { "canvas-1": 4, "canvas-2": 0 },
      { "canvas-1": ["a"] },
    );
    await cycle.sweep();
    await cycle.tick();
    successors["canvas-1"] = "canvas-2";
    keptAtZero.add("canvas-2");
    advance(MIN_INTERVAL_MS * 2);

    emit("canvas-1", false, "archived");
    await new Promise((resolve) => setImmediate(resolve)); // le successeur se lit dans Redis, la suite est asynchrone
    advance(URGENT_DEBOUNCE_MS);
    await cycle.tick();

    expect(
      stored
        .map(({ canvasId }) => canvasId)
        .slice(1)
        .sort(),
    ).toEqual(["canvas-1", "canvas-2"]);
  });

  // Rouvrir ou activer un canvas : son statut n'a pas de successeur à suivre
  it("follows no successor when the status is not archived", async () => {
    const { cycle, stored, emit, advance, successors, keptAtZero } = await setup({
      "canvas-1": 4,
      "canvas-2": 0,
    });
    await cycle.sweep();
    await cycle.tick();
    successors["canvas-1"] = "canvas-2";
    keptAtZero.add("canvas-2");
    advance(MIN_INTERVAL_MS * 2);

    emit("canvas-1", false, "active");
    await new Promise((resolve) => setImmediate(resolve));
    advance(URGENT_DEBOUNCE_MS);
    await cycle.tick();

    expect(stored.map(({ canvasId }) => canvasId)).toEqual(["canvas-1", "canvas-1"]);
  });

  // Supprimé : plus aucune sauvegarde, même si le canvas était dû ou si une activité suit son statut
  it("stops saving a canvas once its status says it was discarded", async () => {
    const { cycle, stored, emit, advance } = await setup({ "canvas-1": 4 });
    await cycle.sweep();
    await cycle.tick();
    advance(MIN_INTERVAL_MS * 2);

    emit("canvas-1", false);
    emit("canvas-1", false, "discarded");
    emit("canvas-1", false);
    advance(REFRESH_INTERVAL_MS);
    await cycle.sweep();
    await cycle.tick();

    expect(stored).toHaveLength(1);
  });

  // Un tour rend la main au bout de son temps : le bail du worker se prolonge entre deux tours, jamais pendant
  it("hands control back after its time budget and leaves the rest due for the next turn", async () => {
    const { cycle, stored, setListCost } = await setup({ "canvas-1": 4, "canvas-2": 4, "canvas-3": 4 });
    await cycle.sweep();
    setListCost(11_000); // chaque lecture « coûte » onze secondes

    await cycle.tick();
    expect(stored).toHaveLength(1);
    await cycle.tick();
    await cycle.tick();

    expect(stored.map(({ canvasId }) => canvasId).sort()).toEqual(["canvas-1", "canvas-2", "canvas-3"]);
  });

  // Quand Redis casse en pleine lecture, l'erreur est journalisée, le canvas reste à faire, et les autres passent
  it("logs a failing canvas, retries it later, and still saves the others", async () => {
    const { cycle, stored, failures, advance } = await setup({ "canvas-1": 4, "canvas-2": 7 });
    failures.add("canvas-1");

    await cycle.sweep();
    await cycle.tick();

    expect(stored.map(({ canvasId }) => canvasId)).toEqual(["canvas-2"]);
    failures.delete("canvas-1");
    advance(30_000);
    await cycle.tick();
    expect(stored.map(({ canvasId }) => canvasId)).toEqual(["canvas-2", "canvas-1"]);
  });

  // Quand Convex garde déjà plus récent, le refus ne boucle pas : le canvas attend sa prochaine vraie modification
  it("does not loop when Convex refuses a snapshot, it waits for the next change", async () => {
    const { cycle, stored, answerStore, advance } = await setup({ "canvas-1": 4 });
    answerStore("refused");

    await cycle.sweep();
    await cycle.tick();
    advance(PLACEMENT_INTERVAL_MS * 2);
    await cycle.tick();

    expect(stored).toHaveLength(1);
  });

  // Au démarrage, ce que Convex garde déjà évite de refaire ce qui est à jour
  it("does not redo at start what Convex already holds up to date", async () => {
    const { cycle, stored } = await setup({ "canvas-1": 4 }, {}, [
      { canvasId: "canvas-1", version: 4, takenAt: t0 },
    ]);

    await cycle.sweep();
    await cycle.tick();

    expect(stored).toEqual([]);
  });
});
