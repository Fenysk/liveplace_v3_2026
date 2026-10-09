import type {
  RecentSnapshot,
  RecoveryStore,
  RecoveryTarget,
  Restoration,
  RestoredUser,
} from "@liveplace/domain/ports";
import {
  type CanvasSnapshot,
  RECOVERY_VERSION_JUMP,
  SNAPSHOT_SCHEMA_VERSION,
} from "@liveplace/domain/snapshot";
import { describe, expect, it } from "vitest";
import { createRecoveryCycle, RECOVERY_CHECK_MS, RECOVERY_RETRY_MS } from "./recovery-cycle";

const t0 = 1_700_000_000_000;

const snapshotOf = (
  canvasId: string,
  version: number,
  extra: Partial<CanvasSnapshot> = {},
): CanvasSnapshot => ({
  schemaVersion: SNAPSHOT_SCHEMA_VERSION,
  canvasId,
  version,
  takenAt: t0,
  meta: { ownerId: "owner-1", width: "50", height: "50" },
  authors: ["author-a", "author-b"],
  placements: [],
  cells: [],
  progress: { "author-a": { counted: "3" }, "player-1": { counted: "1" } },
  bans: ["troll"],
  bansTwitch: [],
  banProofs: {},
  cleared: {},
  clearedPlacements: [],
  clearedRanges: {},
  mods: ["mod-1"],
  modsTwitch: [],
  modsLiveplace: ["mod-1"],
  twitchUsers: {},
  reported: [],
  reports: {},
  offStream: [],
  approved: [],
  scoreboard: { "author-a": "5", "ranked-1": "4" },
  scoreboardBanned: { "banned-1": "3" },
  ...extra,
});

type Saved = { snapshot: CanvasSnapshot | "unreadable" };

// Redis et Convex en mémoire : les canvas que Redis a perdus, et ce que Convex garde de chacun.
const setup = (
  convex: Record<string, Saved[]>, // pour chaque canvas, ses sauvegardes de la plus récente à la plus ancienne
  options: {
    lost?: string[];
    deleted?: string[];
    cursors?: Record<string, number>;
    alreadyLive?: string[];
  } = {},
) => {
  let clock = t0;
  const lost = new Set(options.lost ?? []);
  const calls: string[] = [];
  const logged: string[] = [];
  const restorations: { canvasId: string; restoration: Restoration }[] = [];
  const failures = new Set<string>();

  const target: RecoveryTarget = {
    listLostCanvases: async (canvasIds) => {
      calls.push(`listLost ${canvasIds.join(",")}`);
      return canvasIds.filter((canvasId) => lost.has(canvasId));
    },
    beginRestore: async (canvasId) => {
      calls.push(`begin ${canvasId}`);
      return options.alreadyLive?.includes(canvasId) ? "already_live" : "begun";
    },
    cancelRestore: async (canvasId) => {
      calls.push(`cancel ${canvasId}`);
      lost.delete(canvasId);
    },
    restore: async (canvasId, restoration) => {
      calls.push(`restore ${canvasId}`);
      restorations.push({ canvasId, restoration });
      lost.delete(canvasId);
      return "restored";
    },
  };
  const store: RecoveryStore = {
    hasSnapshot: async () => true,
    hasCanvas: async (canvasId) => {
      calls.push(`hasCanvas ${canvasId}`);
      if (failures.has(canvasId)) throw new Error("Convex a coupé");
      return !options.deleted?.includes(canvasId);
    },
    listRecentSnapshots: async (canvasId) => {
      calls.push(`listRecent ${canvasId}`);
      const recent: RecentSnapshot[] = (convex[canvasId] ?? []).map(({ snapshot }, index) => ({
        version: index,
        takenAt: t0,
        schemaVersion: 1,
        getBytes: async () => {
          calls.push(`getBytes ${canvasId} ${index}`);
          return new TextEncoder().encode(snapshot === "unreadable" ? "illisible" : JSON.stringify(snapshot));
        },
      }));
      return recent;
    },
    listUsers: async (userIds) => {
      calls.push(`listUsers ${[...userIds].sort().join(",")}`);
      return userIds.map((userId): RestoredUser => ({ userId, login: userId, displayName: userId }));
    },
  };
  const cycle = createRecoveryCycle({
    target,
    store,
    decode: async (bytes) => {
      const text = new TextDecoder().decode(bytes);
      return text === "illisible" ? { ok: false, error: "corrupt" } : { ok: true, value: JSON.parse(text) };
    },
    getCursor: (canvasId) => options.cursors?.[canvasId] ?? 0,
    now: () => clock,
    log: (message) => logged.push(message),
  });
  return {
    cycle,
    calls,
    logged,
    restorations,
    failures,
    lose: (canvasId: string) => lost.add(canvasId),
    advance: (ms: number) => {
      clock += ms;
    },
  };
};

describe("the recovery cycle (Écart §7.2, JOURNAL 2026-10-08)", () => {
  // Un canvas que Redis a perdu et dont Convex garde une sauvegarde revient, avec une version qui saute d'un million
  it("restores a lost canvas from its latest save, with a version a million above", async () => {
    const { cycle, restorations, advance } = setup(
      { "canvas-1": [{ snapshot: snapshotOf("canvas-1", 275) }] },
      { lost: ["canvas-1"] },
    );
    cycle.noteSaved("canvas-1");

    advance(RECOVERY_CHECK_MS);
    await cycle.tick();

    expect(restorations).toHaveLength(1);
    expect(restorations[0]?.restoration).toMatchObject({
      version: 275 + RECOVERY_VERSION_JUMP,
      at: t0 + RECOVERY_CHECK_MS,
    });
    expect(restorations[0]?.restoration.snapshot.canvasId).toBe("canvas-1");
  });

  // La version saute au-dessus du curseur de l'historique quand il est plus haut que la sauvegarde
  it("jumps above the history cursor when it is higher than the save", async () => {
    const { cycle, restorations, advance } = setup(
      { "canvas-1": [{ snapshot: snapshotOf("canvas-1", 275) }] },
      { lost: ["canvas-1"], cursors: { "canvas-1": 290 } },
    );
    cycle.noteSaved("canvas-1");

    advance(RECOVERY_CHECK_MS);
    await cycle.tick();

    expect(restorations[0]?.restoration.version).toBe(290 + RECOVERY_VERSION_JUMP);
  });

  // Les noms viennent de Convex en une fois : auteurs, joueurs, bannis, modérateurs et classés, chacun une seule fois
  it("asks Convex once for the names of everyone the canvas holds", async () => {
    const { cycle, calls, advance } = setup(
      { "canvas-1": [{ snapshot: snapshotOf("canvas-1", 275) }] },
      { lost: ["canvas-1"] },
    );
    cycle.noteSaved("canvas-1");

    advance(RECOVERY_CHECK_MS);
    await cycle.tick();

    expect(calls.filter((call) => call.startsWith("listUsers"))).toEqual([
      "listUsers author-a,author-b,banned-1,mod-1,player-1,ranked-1,troll",
    ]);
  });

  // Tant que tout vit dans Redis, un seul pipeline et pas un appel à Convex, tour après tour
  it("reads nothing from Convex while every canvas lives in Redis", async () => {
    const { cycle, calls, advance } = setup({ "canvas-1": [{ snapshot: snapshotOf("canvas-1", 275) }] });
    cycle.noteSaved("canvas-1");

    for (let turn = 0; turn < 4; turn++) {
      advance(RECOVERY_CHECK_MS);
      await cycle.tick();
    }

    expect(calls).toEqual(Array(4).fill("listLost canvas-1"));
  });

  // Redis n'est regardé que toutes les cinq secondes, pas à chaque tour de 250 ms du worker
  it("looks at Redis every five seconds, not at every turn of the worker", async () => {
    const { cycle, calls, advance } = setup({ "canvas-1": [{ snapshot: snapshotOf("canvas-1", 275) }] });
    cycle.noteSaved("canvas-1");

    await cycle.tick();
    advance(RECOVERY_CHECK_MS - 1);
    await cycle.tick();
    advance(1);
    await cycle.tick();

    expect(calls).toEqual(["listLost canvas-1", "listLost canvas-1"]);
  });

  // Un canvas que le worker vient de sauvegarder est connu : s'il se perd, il revient
  it("knows a canvas it just saved, and brings it back if it is lost", async () => {
    const { cycle, restorations, advance, lose } = setup({
      "canvas-2": [{ snapshot: snapshotOf("canvas-2", 12) }],
    });
    cycle.noteSaved("canvas-2");
    lose("canvas-2");

    advance(RECOVERY_CHECK_MS);
    await cycle.tick();

    expect(restorations.map(({ canvasId }) => canvasId)).toEqual(["canvas-2"]);
  });

  // La dernière sauvegarde est illisible : la précédente revient à sa place
  it("takes the previous save when the latest cannot be read", async () => {
    const { cycle, restorations, advance } = setup(
      { "canvas-1": [{ snapshot: "unreadable" }, { snapshot: snapshotOf("canvas-1", 270) }] },
      { lost: ["canvas-1"] },
    );
    cycle.noteSaved("canvas-1");

    advance(RECOVERY_CHECK_MS);
    await cycle.tick();

    expect(restorations[0]?.restoration.snapshot.version).toBe(270);
  });

  // Aucune sauvegarde lisible : le canvas reste bloqué en récupération, journalisé, et réessayé après trente secondes
  it("stays blocked when no save can be read: logged, marked, and tried again after thirty seconds", async () => {
    const { cycle, calls, logged, restorations, advance } = setup(
      { "canvas-1": [{ snapshot: "unreadable" }, { snapshot: "unreadable" }] },
      { lost: ["canvas-1"] },
    );
    cycle.noteSaved("canvas-1");

    advance(RECOVERY_CHECK_MS);
    await cycle.tick();
    expect(restorations).toEqual([]);
    expect(logged.some((message) => message.includes("canvas-1") && message.includes("bloqué"))).toBe(true);
    expect(calls).not.toContain("cancel canvas-1");

    const beforeRetry = calls.filter((call) => call.startsWith("begin")).length;
    advance(RECOVERY_RETRY_MS - RECOVERY_CHECK_MS - 1);
    await cycle.tick();
    expect(calls.filter((call) => call.startsWith("begin"))).toHaveLength(beforeRetry);
    advance(RECOVERY_CHECK_MS + 1);
    await cycle.tick();
    expect(calls.filter((call) => call.startsWith("begin"))).toHaveLength(beforeRetry + 1);
  });

  // Un canvas que Convex a supprimé n'est pas remis : sa marque part, il est oublié, aucune sauvegarde n'est lue
  it("forgets a canvas Convex no longer has: its mark is cleared and no save is read", async () => {
    const { cycle, calls, restorations, advance } = setup(
      { "canvas-1": [{ snapshot: snapshotOf("canvas-1", 275) }] },
      { lost: ["canvas-1"], deleted: ["canvas-1"] },
    );
    cycle.noteSaved("canvas-1");

    advance(RECOVERY_CHECK_MS);
    await cycle.tick();
    advance(RECOVERY_CHECK_MS);
    await cycle.tick();

    expect(restorations).toEqual([]);
    expect(calls).toContain("cancel canvas-1");
    expect(calls.filter((call) => call.startsWith("listRecent"))).toEqual([]);
    expect(calls.filter((call) => call === "listLost canvas-1")).toHaveLength(1);
  });

  // Un canvas déjà revenu (ou neuf) à la minute où on le remet n'est pas touché
  it("touches nothing when the canvas turns out to be live at the moment it begins", async () => {
    const { cycle, calls, restorations, advance } = setup(
      { "canvas-1": [{ snapshot: snapshotOf("canvas-1", 275) }] },
      { lost: ["canvas-1"], alreadyLive: ["canvas-1"] },
    );
    cycle.noteSaved("canvas-1");

    advance(RECOVERY_CHECK_MS);
    await cycle.tick();

    expect(restorations).toEqual([]);
    expect(calls.filter((call) => call.startsWith("hasCanvas") || call.startsWith("listRecent"))).toEqual([]);
  });

  // Convex qui coupe en pleine récupération : le canvas reste marqué, l'erreur est journalisée, et le tour suivant réessaie
  it("keeps the canvas marked when Convex fails, logs it, and tries again after thirty seconds", async () => {
    const { cycle, calls, logged, restorations, failures, advance } = setup(
      { "canvas-1": [{ snapshot: snapshotOf("canvas-1", 275) }] },
      { lost: ["canvas-1"] },
    );
    cycle.noteSaved("canvas-1");
    failures.add("canvas-1");

    advance(RECOVERY_CHECK_MS);
    await cycle.tick();
    expect(restorations).toEqual([]);
    expect(logged.some((message) => message.includes("canvas-1"))).toBe(true);
    expect(calls).not.toContain("cancel canvas-1");

    failures.delete("canvas-1");
    advance(RECOVERY_RETRY_MS);
    await cycle.tick();
    expect(restorations).toHaveLength(1);
  });

  // Les canvas perdus se remettent un à un : l'un qui échoue ne retient pas l'autre
  it("restores the other canvases when one cannot come back", async () => {
    const { cycle, restorations, advance } = setup(
      {
        "canvas-1": [{ snapshot: "unreadable" }],
        "canvas-2": [{ snapshot: snapshotOf("canvas-2", 40) }],
      },
      { lost: ["canvas-1", "canvas-2"] },
    );
    cycle.noteSaved("canvas-1");
    cycle.noteSaved("canvas-2");

    advance(RECOVERY_CHECK_MS);
    await cycle.tick();

    expect(restorations.map(({ canvasId }) => canvasId)).toEqual(["canvas-2"]);
  });
});
