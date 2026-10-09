import type { CanvasStatus } from "@liveplace/domain";
import type { Chunk, ChunkEntry, ChunkFile, Recovered } from "@liveplace/domain/chunk";
import { CHUNK_SCHEMA_VERSION } from "@liveplace/domain/chunk";
import type { CanvasActivity, HistorySource, HistoryStore } from "@liveplace/domain/ports";
import { describe, expect, it } from "vitest";
import { createHistoryCycle } from "./history-cycle";
import {
  createHistoryPlan,
  HISTORY_INTERVAL_MS,
  HISTORY_MIN_INTERVAL_MS,
  HISTORY_PENDING_MAX,
  HISTORY_RETRY_MS,
} from "./history-plan";

const t0 = 1_700_000_000_000;

const placeEntry = (version: number, placementId: string): ChunkEntry => [
  version,
  placementId,
  { version, kind: "place", authorId: "author-a", occurredAt: t0 + version * 1000, cells: [] },
];
const moderationEntry = (version: number): ChunkEntry => [
  version,
  null,
  {
    version,
    kind: "clear",
    authorId: "owner-1",
    occurredAt: t0 + version * 1000,
    cells: [],
    moderation: { action: "ban", target: "troll" },
  },
];

// Un chunk que Convex garde déjà, sans contenu : seul l'intervalle compte pour le curseur.
const storedFile = (canvasId: string, fromVersion: number, toVersion: number): ChunkFile => ({
  canvasId,
  fromVersion,
  toVersion,
  fromTs: t0,
  toTs: t0,
  count: toVersion - fromVersion + 1,
  schemaVersion: CHUNK_SCHEMA_VERSION,
  payload: new Uint8Array(),
});

const chunkOf = (file: ChunkFile): Chunk => JSON.parse(new TextDecoder().decode(file.payload));

// Redis et Convex en mémoire : un flux par canvas, et des chunks que Convex range comme il le fait (il refuse un chevauchement).
const setup = async (
  streams: Record<string, ChunkEntry[]>,
  options: {
    resizedAt?: Record<string, number>;
    recovered?: Record<string, Recovered>; // la dernière récupération de chaque canvas
    stored?: ChunkFile[];
    versions?: Record<string, number>;
    isStartBlind?: boolean; // le premier curseur lu est vide : le worker a démarré avant le chunk qui existe déjà
  } = {},
) => {
  let clock = t0;
  const chunks: ChunkFile[] = [...(options.stored ?? [])];
  const reads: { canvasId: string; afterVersion: number; maxCount: number }[] = [];
  const failures = new Set<string>();
  let activity: ((activity: CanvasActivity) => void) | null = null;
  let isBlind = options.isStartBlind ?? false;

  const source: HistorySource = {
    getVersion: async (canvasId) => options.versions?.[canvasId] ?? streams[canvasId]?.at(-1)?.[0] ?? null,
    getRecovery: async (canvasId) => options.recovered?.[canvasId] ?? null,
    listHistory: async (canvasId, afterVersion, maxCount) => {
      reads.push({ canvasId, afterVersion, maxCount });
      if (failures.has(canvasId)) throw new Error("Redis a coupé");
      const entries = (streams[canvasId] ?? [])
        .filter(([version]) => version > afterVersion)
        .slice(0, maxCount);
      return {
        entries,
        resizedAtVersion: options.resizedAt?.[canvasId] ?? null,
        recovered: options.recovered?.[canvasId] ?? null,
      };
    },
    watch: async (onActivity) => {
      activity = onActivity;
      return async () => {
        activity = null;
      };
    },
  };
  const store: HistoryStore = {
    listChunkCursors: async () => {
      if (isBlind) {
        isBlind = false;
        return [];
      }
      return [...new Set(chunks.map(({ canvasId }) => canvasId))].map((canvasId) => ({
        canvasId,
        version: Math.max(
          ...chunks.filter((chunk) => chunk.canvasId === canvasId).map((chunk) => chunk.toVersion),
        ),
      }));
    },
    storeChunk: async (file) => {
      const last = Math.max(
        0,
        ...chunks.filter((chunk) => chunk.canvasId === file.canvasId).map((c) => c.toVersion),
      );
      if (file.fromVersion <= last) return "overlap";
      chunks.push(file);
      return "stored";
    },
  };
  const make = () =>
    createHistoryCycle({
      source,
      store,
      plan: createHistoryPlan(),
      encode: async (chunk) => new TextEncoder().encode(JSON.stringify(chunk)),
      now: () => clock,
      log: () => undefined,
    });
  const cycle = make();
  await cycle.start();
  return {
    cycle,
    restart: async () => {
      const restarted = make();
      await restarted.start();
      return restarted;
    },
    chunks,
    reads,
    failures,
    advance: (ms: number) => {
      clock += ms;
    },
    emit: (canvasId: string, version?: number, status?: CanvasStatus) =>
      activity?.({
        canvasId,
        isPlacement: false,
        ...(version === undefined ? {} : { version }),
        ...(status ? { status } : {}),
      }),
  };
};

describe("the history cycle (Écart §7.2, JOURNAL 2026-10-08)", () => {
  // Quand le tour de cinq minutes vient, un seul chunk range tout ce qui suit le curseur, poses et modération, avec leurs poses
  it("stores one chunk per turn with every entry after the cursor, and the placement ids", async () => {
    const { cycle, chunks, advance } = await setup({
      "canvas-1": [
        placeEntry(1, "pfirst0001"),
        placeEntry(2, "pfirst0001"),
        placeEntry(3, "psecond001"),
        moderationEntry(4),
      ],
    });
    await cycle.sweep(["canvas-1"]);

    advance(HISTORY_INTERVAL_MS);
    await cycle.tick();
    await cycle.tick();

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      canvasId: "canvas-1",
      fromVersion: 1,
      toVersion: 4,
      fromTs: t0 + 1000,
      toTs: t0 + 4000,
      count: 4,
      schemaVersion: CHUNK_SCHEMA_VERSION,
    });
    expect(chunks[0]?.gaps).toBeUndefined();
    const file = chunkOf(chunks[0] as ChunkFile);
    expect(file.entries.map(([version, placementId]) => [version, placementId])).toEqual([
      [1, "pfirst0001"],
      [2, "pfirst0001"],
      [3, "psecond001"],
      [4, null],
    ]);
    expect(file.entries[3]?.[2].moderation).toEqual({ action: "ban", target: "troll" });
  });

  // Au tour suivant, un chunk de plus ne prend que ce qui est arrivé depuis, sans rien relire ni répéter
  it("stores at the next turn only what arrived since, without repeating anything", async () => {
    const streams = { "canvas-1": [placeEntry(1, "pfirst0001"), placeEntry(2, "pfirst0001")] };
    const { cycle, chunks, reads, advance } = await setup(streams);
    await cycle.sweep(["canvas-1"]);
    advance(HISTORY_INTERVAL_MS);
    await cycle.tick();

    streams["canvas-1"].push(placeEntry(3, "psecond001"), placeEntry(4, "psecond001"));
    await cycle.sweep(["canvas-1"]);
    advance(HISTORY_INTERVAL_MS);
    await cycle.tick();

    expect(chunks.map(({ fromVersion, toVersion }) => [fromVersion, toVersion])).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(reads.map(({ afterVersion }) => afterVersion)).toEqual([0, 2]);
  });

  // Quand le worker redémarre, le curseur vient de Convex : rien n'est rangé deux fois
  it("stores nothing twice after a restart: the cursor comes from Convex", async () => {
    const { cycle, chunks, restart, advance } = await setup({
      "canvas-1": [placeEntry(1, "pfirst0001"), placeEntry(2, "psecond001")],
    });
    await cycle.sweep(["canvas-1"]);
    advance(HISTORY_INTERVAL_MS);
    await cycle.tick();

    const restarted = await restart();
    await restarted.sweep(["canvas-1"]);
    advance(HISTORY_INTERVAL_MS * 3);
    await restarted.tick();

    expect(chunks).toHaveLength(1);
  });

  // Quand le cycle croit à un curseur trop bas, Convex refuse le chevauchement : rien n'est doublé, et le curseur est relu
  it("stores no duplicate when its cursor is behind: Convex refuses the overlap and the cursor is listed again", async () => {
    const { cycle, chunks, advance } = await setup(
      { "canvas-1": [placeEntry(1, "pfirst0001"), placeEntry(2, "psecond001"), placeEntry(3, "pthird0001")] },
      { stored: [storedFile("canvas-1", 1, 2)], isStartBlind: true },
    );
    await cycle.sweep(["canvas-1"]);

    advance(HISTORY_INTERVAL_MS);
    await cycle.tick();
    expect(chunks.map(({ fromVersion, toVersion }) => [fromVersion, toVersion])).toEqual([[1, 2]]);

    advance(HISTORY_INTERVAL_MS);
    await cycle.tick();
    expect(chunks.map(({ fromVersion, toVersion }) => [fromVersion, toVersion])).toEqual([
      [1, 2],
      [3, 3],
    ]);
  });

  // Quand le flux a perdu ses premières entrées, le chunk note le trou : jamais un silence
  it("notes the gap when the stream lost its first entries", async () => {
    const { cycle, chunks, advance } = await setup({
      "canvas-1": [placeEntry(41_000, "pfirst0001"), placeEntry(41_001, "psecond001")],
    });
    await cycle.sweep(["canvas-1"]);

    advance(HISTORY_INTERVAL_MS);
    await cycle.tick();

    expect(chunks[0]).toMatchObject({ fromVersion: 41_000, toVersion: 41_001, count: 2 });
    expect(chunks[0]?.gaps).toEqual([{ from: 1, to: 40_999 }]);
  });

  // Quand le canvas a été récupéré, le saut de version n'est pas un trou : le premier chunk d'après note la récupération
  it("does not note the version jump of a recovery as a gap, and dates the recovery on the first chunk after it", async () => {
    const jump = 1_000_275;
    const streams = { "canvas-1": [placeEntry(jump + 1, "pafter0001"), placeEntry(jump + 2, "pafter0002")] };
    const { cycle, chunks, advance } = await setup(streams, {
      stored: [storedFile("canvas-1", 1, 270)],
      recovered: { "canvas-1": { at: t0 + 123, version: jump, snapshotVersion: 270 } },
    });
    await cycle.sweep(["canvas-1"]);

    advance(HISTORY_INTERVAL_MS);
    await cycle.tick();

    expect(chunks.map(({ fromVersion, toVersion }) => [fromVersion, toVersion])).toEqual([
      [1, 270],
      [jump + 1, jump + 2],
    ]);
    expect(chunks[1]?.gaps).toBeUndefined();
    expect(chunks[1]?.recoveredAt).toBe(t0 + 123);
  });

  // Curseur d'archive à 3, sauvegarde remise en place à 275, reprise à 1 000 275 : les versions 4 à 275 sont perdues et se notent
  it("notes the versions lost between the archive cursor and the restored save, with the date of the recovery", async () => {
    const jump = 1_000_275;
    const streams = { "canvas-1": [placeEntry(jump + 1, "pafter0001"), placeEntry(jump + 2, "pafter0002")] };
    const { cycle, chunks, advance } = await setup(streams, {
      stored: [storedFile("canvas-1", 1, 3)],
      recovered: { "canvas-1": { at: t0 + 123, version: jump, snapshotVersion: 275 } },
    });
    await cycle.sweep(["canvas-1"]);

    advance(HISTORY_INTERVAL_MS);
    await cycle.tick();

    expect(chunks[1]).toMatchObject({ fromVersion: jump + 1, toVersion: jump + 2, recoveredAt: t0 + 123 });
    expect(chunks[1]?.gaps).toEqual([{ from: 4, to: 275 }]);
  });

  // Curseur d'archive à 300, sauvegarde plus ancienne à 275 : tout était déjà archivé, aucun trou
  it("notes no gap when the restored save is older than the archive cursor", async () => {
    const jump = 1_000_300;
    const streams = { "canvas-1": [placeEntry(jump + 1, "pafter0001")] };
    const { cycle, chunks, advance } = await setup(streams, {
      stored: [storedFile("canvas-1", 1, 300)],
      recovered: { "canvas-1": { at: t0 + 123, version: jump, snapshotVersion: 275 } },
    });
    await cycle.sweep(["canvas-1"]);

    advance(HISTORY_INTERVAL_MS);
    await cycle.tick();

    expect(chunks[1]?.gaps).toBeUndefined();
    expect(chunks[1]?.recoveredAt).toBe(t0 + 123);
  });

  // Les versions perdues ne se notent qu'une fois : le chunk suivant, dont le curseur a passé la récupération, ne les porte plus
  it("notes the lost versions on the first chunk after the recovery only", async () => {
    const jump = 1_000_275;
    const streams = { "canvas-1": [placeEntry(jump + 1, "pafter0001")] };
    const { cycle, chunks, advance } = await setup(streams, {
      stored: [storedFile("canvas-1", 1, 3)],
      recovered: { "canvas-1": { at: t0 + 123, version: jump, snapshotVersion: 275 } },
    });
    await cycle.sweep(["canvas-1"]);
    advance(HISTORY_INTERVAL_MS);
    await cycle.tick();

    streams["canvas-1"].push(placeEntry(jump + 2, "pafter0002"));
    await cycle.sweep(["canvas-1"]);
    advance(HISTORY_INTERVAL_MS);
    await cycle.tick();

    expect(chunks.map(({ gaps }) => gaps)).toEqual([undefined, [{ from: 4, to: 275 }], undefined]);
  });

  // Quand le balayage ne voit que le saut d'une récupération, aucun chunk d'une entrée ne part tout de suite : le tour de cinq minutes
  it("starts no early chunk for a recovery jump alone: the five-minute turn takes what follows", async () => {
    const jump = 1_000_275;
    const streams = { "canvas-1": [placeEntry(jump + 1, "pafter0001")] };
    const { cycle, chunks, advance } = await setup(streams, {
      stored: [storedFile("canvas-1", 1, 270)],
      recovered: { "canvas-1": { at: t0 + 123, version: jump, snapshotVersion: 270 } },
    });
    await cycle.sweep(["canvas-1"]);

    await cycle.tick();
    expect(chunks).toHaveLength(1);

    advance(HISTORY_INTERVAL_MS);
    await cycle.tick();
    expect(chunks.map(({ fromVersion }) => fromVersion)).toEqual([1, jump + 1]);
  });

  // Quand le chunk d'après la récupération est rangé, les suivants ne la datent plus
  it("dates the recovery on one chunk only", async () => {
    const jump = 1_000_275;
    const streams = { "canvas-1": [placeEntry(jump + 1, "pafter0001")] };
    const { cycle, chunks, advance } = await setup(streams, {
      stored: [storedFile("canvas-1", 1, 270)],
      recovered: { "canvas-1": { at: t0 + 123, version: jump, snapshotVersion: 270 } },
    });
    await cycle.sweep(["canvas-1"]);
    advance(HISTORY_INTERVAL_MS);
    await cycle.tick();

    streams["canvas-1"].push(placeEntry(jump + 2, "pafter0002"));
    await cycle.sweep(["canvas-1"]);
    advance(HISTORY_INTERVAL_MS);
    await cycle.tick();

    expect(chunks.map(({ recoveredAt }) => recoveredAt)).toEqual([undefined, t0 + 123, undefined]);
  });

  // Quand une version n'a pas d'entrée parce que le streamer a changé la taille, c'est noté comme tel, pas comme une perte
  it("notes a resize as a resize, not as a loss", async () => {
    const { cycle, chunks, advance } = await setup(
      { "canvas-1": [placeEntry(1, "pfirst0001"), placeEntry(2, "pfirst0001"), placeEntry(4, "psecond001")] },
      { resizedAt: { "canvas-1": 3 } },
    );
    await cycle.sweep(["canvas-1"]);

    advance(HISTORY_INTERVAL_MS);
    await cycle.tick();

    expect(chunks[0]?.gaps).toBeUndefined();
    expect(chunks[0]?.resizedAt).toBe(3);
  });

  // Quand le canvas est archivé et que tout est rangé, il ne produit plus rien : plus de chunk, plus de lecture du flux
  it("produces nothing more for an archived canvas once everything is stored", async () => {
    const { cycle, chunks, reads, advance, emit } = await setup({
      "canvas-1": [placeEntry(1, "pfirst0001"), placeEntry(2, "psecond001")],
    });
    await cycle.sweep(["canvas-1"]);
    advance(HISTORY_INTERVAL_MS);
    await cycle.tick();
    const readsBeforeArchive = reads.length;

    emit("canvas-1", undefined, "archived");
    for (let turn = 0; turn < 5; turn++) {
      advance(HISTORY_INTERVAL_MS);
      await cycle.sweep(["canvas-1"]);
      await cycle.tick();
    }

    expect(chunks).toHaveLength(1);
    expect(reads).toHaveLength(readsBeforeArchive);
  });

  // Quand un canvas est archivé avec des entrées pas encore rangées, elles partent une dernière fois, puis plus rien
  it("stores the tail of an archived canvas once, then nothing", async () => {
    const streams = { "canvas-1": [placeEntry(1, "pfirst0001"), placeEntry(2, "psecond001")] };
    const { cycle, chunks, advance, emit } = await setup(streams);
    await cycle.sweep(["canvas-1"]);
    advance(HISTORY_INTERVAL_MS);
    await cycle.tick();
    streams["canvas-1"].push(placeEntry(3, "pthird0001"));
    emit("canvas-1", 3);
    emit("canvas-1", undefined, "archived");

    for (let turn = 0; turn < 4; turn++) {
      advance(HISTORY_INTERVAL_MS);
      await cycle.sweep(["canvas-1"]);
      await cycle.tick();
    }

    expect(chunks.map(({ fromVersion, toVersion }) => [fromVersion, toVersion])).toEqual([
      [1, 2],
      [3, 3],
    ]);
  });

  // Quand le canvas est supprimé, plus rien n'est rangé : ses chunks partent de Convex
  it("stores nothing for a canvas that was discarded", async () => {
    const streams = { "canvas-1": [placeEntry(1, "pfirst0001")] };
    const { cycle, chunks, advance, emit } = await setup(streams);
    await cycle.sweep(["canvas-1"]);
    emit("canvas-1", undefined, "discarded");

    advance(HISTORY_INTERVAL_MS * 3);
    await cycle.sweep(["canvas-1"]);
    await cycle.tick();

    expect(chunks).toEqual([]);
  });

  // Quand la version vue sur le canal dépasse le curseur sans balayage, le canvas est dû au tour de cinq minutes
  it("counts the versions seen on the live channel, without waiting for a sweep", async () => {
    const streams = { "canvas-1": [placeEntry(1, "pfirst0001")] };
    const { cycle, chunks, advance, emit } = await setup(streams);
    await cycle.sweep(["canvas-1"]);
    advance(HISTORY_INTERVAL_MS);
    await cycle.tick();

    streams["canvas-1"].push(placeEntry(2, "psecond001"));
    emit("canvas-1", 2);
    advance(HISTORY_INTERVAL_MS);
    await cycle.tick();

    expect(chunks.map(({ toVersion }) => toVersion)).toEqual([1, 2]);
  });

  // Quand 12 000 entrées attendent, chaque chunk en prend 5 000 au plus, à cinq secondes l'un de l'autre, le reste attend le tour
  it("stores a backlog in chunks of five thousand entries, five seconds apart, the rest at the turn", async () => {
    const entries = Array.from({ length: 12_000 }, (_, index) => placeEntry(index + 1, "pbacklog01"));
    const { cycle, chunks, advance } = await setup({ "canvas-1": entries });
    await cycle.sweep(["canvas-1"]);

    await cycle.tick();
    await cycle.tick();
    advance(HISTORY_MIN_INTERVAL_MS);
    await cycle.tick();
    advance(HISTORY_MIN_INTERVAL_MS);
    await cycle.tick();
    expect(chunks.map(({ count }) => count)).toEqual([HISTORY_PENDING_MAX, HISTORY_PENDING_MAX]);

    advance(HISTORY_INTERVAL_MS);
    await cycle.tick();
    expect(chunks.map(({ count }) => count)).toEqual([HISTORY_PENDING_MAX, HISTORY_PENDING_MAX, 2_000]);
  });

  // Quand la version de Redis est sous le curseur (un Redis revenu en arrière), rien n'est lu ni rangé
  it("reads and stores nothing when Redis is behind the cursor", async () => {
    const { cycle, chunks, reads, advance } = await setup(
      { "canvas-1": [placeEntry(1, "pfirst0001")] },
      { stored: [storedFile("canvas-1", 1, 50)], versions: { "canvas-1": 3 } },
    );
    await cycle.sweep(["canvas-1"]);

    advance(HISTORY_INTERVAL_MS * 3);
    await cycle.tick();

    expect(chunks).toHaveLength(1);
    expect(reads).toEqual([]);
  });

  // Quand le flux est vide pour une version qui n'a pas d'entrée (la taille seule), le cycle lit une fois, pas à chaque tour
  it("reads once for a version that has no entry, not at every turn", async () => {
    const { cycle, chunks, reads, advance } = await setup(
      { "canvas-1": [] },
      { versions: { "canvas-1": 3 } },
    );
    await cycle.sweep(["canvas-1"]);

    for (let turn = 0; turn < 4; turn++) {
      advance(HISTORY_INTERVAL_MS);
      await cycle.tick();
    }

    expect(chunks).toEqual([]);
    expect(reads).toHaveLength(1);
  });

  // Quand Redis casse en pleine lecture, l'erreur est journalisée et le canvas réessaie après trente secondes, les autres passent
  it("retries a failing canvas after thirty seconds and still stores the others", async () => {
    const { cycle, chunks, failures, advance } = await setup({
      "canvas-1": [placeEntry(1, "pfirst0001")],
      "canvas-2": [placeEntry(1, "psecond001")],
    });
    failures.add("canvas-1");
    await cycle.sweep(["canvas-1", "canvas-2"]);

    advance(HISTORY_INTERVAL_MS);
    await cycle.tick();
    expect(chunks.map(({ canvasId }) => canvasId)).toEqual(["canvas-2"]);

    failures.delete("canvas-1");
    advance(HISTORY_RETRY_MS);
    await cycle.tick();
    expect(chunks.map(({ canvasId }) => canvasId)).toEqual(["canvas-2", "canvas-1"]);
  });
});
