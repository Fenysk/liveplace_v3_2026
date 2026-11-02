import { brotliCompressSync } from "node:zlib";
import { DELETED_AUTHOR } from "@liveplace/domain";
import { createAccountsFilter } from "@liveplace/domain/accounts-filter";
import { CHUNK_SCHEMA_VERSION, type Chunk } from "@liveplace/domain/chunk";
import type { ErasureStore } from "@liveplace/domain/ports";
import { type CanvasSnapshot, SNAPSHOT_SCHEMA_VERSION, type SnapshotTier } from "@liveplace/domain/snapshot";
import type { Event } from "@liveplace/protocol";
import { describe, expect, it } from "vitest";
import { createMemoryDurable } from "../../../../packages/durable/src/memory-durable";
import { decodeChunk, encodeChunk } from "../infra/chunk-codec";
import { decodeImage, encodeImage } from "../infra/image-codec";
import { decodeSnapshot, encodeSnapshot } from "../infra/snapshot-codec";
import { createErasureCycle } from "../usecase/erasure-cycle";

const t0 = 1_700_000_000_000;
const GONE = "gone-viewer-17";
const GONE_TOO = "gone-viewer-18";
const SCOPE = "prod";

const snapshotOf = (canvasId: string, version: number, names: readonly string[]): CanvasSnapshot => ({
  schemaVersion: SNAPSHOT_SCHEMA_VERSION,
  canvasId,
  version,
  takenAt: t0 + version,
  meta: { ownerId: "owner-1", width: "10", height: "10" },
  authors: ["owner-1", ...names],
  placements: names.map((_, index) => `pose000${index}`),
  cells: names.map((_, index): CanvasSnapshot["cells"][number] => [
    index + 1,
    index + 1,
    index,
    3,
    t0,
    version,
  ]),
  progress: Object.fromEntries(names.map((name) => [name, { counted: "2" }])),
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
  scoreboard: Object.fromEntries(names.map((name) => [name, "3"])),
  scoreboardBanned: {},
});

const eventOf = (version: number, authorId: string): Event => ({
  version,
  kind: "place",
  authorId,
  occurredAt: t0 + version,
  cells: [{ x: 1, y: 1, colorIndex: 3, previousColorIndex: 0, placedAt: t0 + version }],
});

const chunkOf = (canvasId: string, fromVersion: number, authors: readonly string[]): Chunk => ({
  schemaVersion: CHUNK_SCHEMA_VERSION,
  canvasId,
  fromVersion,
  toVersion: fromVersion + authors.length - 1,
  entries: authors.map((authorId, index) => [
    fromVersion + index,
    `pose${fromVersion + index}x`,
    eventOf(fromVersion + index, authorId),
  ]),
});

// Les fichiers, tels que le worker les range : un snapshot ou un chunk, avec ou sans le filtre de ses comptes.
const createWorld = () => {
  const memory = createMemoryDurable();
  const snapshots = memory.snapshotStore(SCOPE);
  const history = memory.historyStore(SCOPE);
  const addSnapshot = async (
    snapshot: CanvasSnapshot,
    options: { tier?: SnapshotTier; hasFilter?: boolean } = {},
  ) => {
    const { tier = "working", hasFilter = true } = options;
    const names = new Set([...snapshot.authors, ...Object.keys(snapshot.progress)]);
    await snapshots.storeSnapshot({
      canvasId: snapshot.canvasId,
      tier,
      version: snapshot.version,
      takenAt: snapshot.takenAt,
      schemaVersion: snapshot.schemaVersion,
      bytes: await encodeSnapshot(snapshot),
      ...(hasFilter ? { accountsFilter: createAccountsFilter(names) } : {}),
    });
  };
  const addChunk = async (chunk: Chunk, hasFilter = true) => {
    await history.storeChunk({
      canvasId: chunk.canvasId,
      fromVersion: chunk.fromVersion,
      toVersion: chunk.toVersion,
      fromTs: t0 + chunk.fromVersion,
      toTs: t0 + chunk.toVersion,
      count: chunk.entries.length,
      schemaVersion: chunk.schemaVersion,
      payload: await encodeChunk(chunk),
      ...(hasFilter
        ? { accountsFilter: createAccountsFilter(chunk.entries.map(([, , event]) => event.authorId ?? "")) }
        : {}),
    });
  };
  return { memory, addSnapshot, addChunk };
};

type World = ReturnType<typeof createWorld>;

// Le contenu lisible de tous les fichiers du déploiement : ce qu'un porteur de la base y trouverait.
const readableFiles = async (world: World): Promise<string[]> =>
  Promise.all(
    [...world.memory.files.values()].map(async (bytes) => {
      const snapshot = await decodeSnapshot(bytes);
      if (snapshot.ok) return JSON.stringify(snapshot.value);
      const chunk = await decodeChunk(bytes);
      if (chunk.ok) return JSON.stringify(chunk.value);
      const image = await decodeImage(bytes);
      return image.ok ? "image" : "illisible";
    }),
  );

const setup = (world: World, options: { store?: (store: ErasureStore) => ErasureStore } = {}) => {
  let clock = t0;
  const logged: string[] = [];
  const store = options.store ? options.store(world.memory.erasureStore) : world.memory.erasureStore;
  const cycle = createErasureCycle({
    store,
    decodeSnapshot,
    encodeSnapshot,
    decodeChunk,
    encodeChunk,
    now: () => clock,
    log: (message) => logged.push(message),
  });
  return {
    cycle,
    logged,
    advance: (ms: number) => {
      clock += ms;
    },
    // Des tours jusqu'à ce que plus aucune demande ne reste, ou que le nombre de tours borne la preuve.
    settle: async (maxTicks = 50) => {
      for (let tick = 0; tick < maxTicks && world.memory.pendingErasures.length > 0; tick += 1) {
        await cycle.tick();
        clock += 1;
      }
    },
  };
};

// Un monde : trois fresques, des snapshots de chaque palier et des chunks qui nomment le compte, et d'autres qui ne le nomment pas.
const buildWorld = async (): Promise<World> => {
  const world = createWorld();
  // Fresque A : deux sauvegardes de travail, une horaire, une quotidienne complète, une hebdomadaire en dessin seul.
  await world.addSnapshot(snapshotOf("canvas-a", 10, [GONE, "other-1"]));
  await world.addSnapshot(snapshotOf("canvas-a", 20, [GONE, "other-1"]));
  await world.addSnapshot(snapshotOf("canvas-a", 15, [GONE, "other-1"]), { tier: "hourly" });
  await world.addSnapshot(snapshotOf("canvas-a", 8, ["other-1"]), { tier: "daily" });
  await world.memory.retentionStore(SCOPE).storeStateOnly({
    canvasId: "canvas-a",
    tier: "weekly",
    version: 5,
    takenAt: t0 + 5,
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    bytes: await encodeImage({
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      canvasId: "canvas-a",
      version: 5,
      takenAt: t0 + 5,
      width: 2,
      height: 2,
      state: new Uint8Array(4),
    }),
  });
  // Fresque B : une sauvegarde qui ne nomme pas le compte. Fresque C : une qui le nomme.
  await world.addSnapshot(snapshotOf("canvas-b", 10, ["other-1"]));
  await world.addSnapshot(snapshotOf("canvas-c", 10, [GONE]));
  // Les chunks : deux nomment le compte, deux non.
  await world.addChunk(chunkOf("canvas-a", 1, [GONE, "other-1", GONE]));
  await world.addChunk(chunkOf("canvas-a", 4, ["other-1", "other-1"]));
  await world.addChunk(chunkOf("canvas-b", 1, ["other-1"]));
  await world.addChunk(chunkOf("canvas-c", 1, ["other-1", GONE]));
  return world;
};

describe("rewriting the backup files of a deleted account (CDC §8, JOURNAL 2026-11-02)", () => {
  // Après la passe, aucun fichier du déploiement ne nomme le compte, de chaque palier, et chaque chunk
  it("leaves no file of any tier or chunk that names the account", async () => {
    const world = await buildWorld();
    expect((await readableFiles(world)).join("").includes(GONE)).toBe(true);
    await world.memory.requestErasure(GONE);
    const { settle } = setup(world);

    await settle();

    expect(world.memory.pendingErasures).toEqual([]);
    expect((await readableFiles(world)).some((text) => text.includes(GONE))).toBe(false);
  });

  // Le dessin et l'historique restent : mêmes cases, mêmes versions, mêmes poses, les auteurs de la personne sous `deleted`
  it("keeps the drawing and the history, with the account's pixels under the deleted author", async () => {
    const world = await buildWorld();
    await world.memory.requestErasure(GONE);

    await setup(world).settle();

    const latest = await world.memory.snapshotStore(SCOPE).getLatestSnapshot("canvas-a", "working");
    const snapshot = await decodeSnapshot(latest?.bytes ?? new Uint8Array());
    expect(snapshot.ok && snapshot.value.cells).toEqual(snapshotOf("canvas-a", 20, [GONE, "other-1"]).cells);
    expect(snapshot.ok && snapshot.value.authors).toEqual(["owner-1", DELETED_AUTHOR, "other-1"]);
    const chunk = world.memory.chunks.find((row) => row.canvasId === "canvas-a" && row.fromVersion === 1);
    const decoded = await decodeChunk(world.memory.files.get(chunk?.storageId ?? "") ?? new Uint8Array());
    expect(
      decoded.ok && decoded.value.entries.map(([version, placementId]) => [version, placementId]),
    ).toEqual([
      [1, "pose1x"],
      [2, "pose2x"],
      [3, "pose3x"],
    ]);
    expect(decoded.ok && decoded.value.entries.map(([, , event]) => event.authorId)).toEqual([
      DELETED_AUTHOR,
      "other-1",
      DELETED_AUTHOR,
    ]);
  });

  // Les lignes décrivent leur nouveau fichier, et les compteurs de Convex restent ceux que les lignes donnent
  it("updates the rows and keeps the byte counters equal to what the rows say", async () => {
    const world = await buildWorld();
    await world.memory.requestErasure(GONE);

    await setup(world).settle();

    expect(world.memory.usage).toEqual(world.memory.recountUsage());
    for (const row of [...world.memory.snapshots, ...world.memory.chunks])
      expect(row.size).toBe(world.memory.files.get(row.storageId)?.byteLength);
  });

  // Un fichier dont le filtre dit « non » n'est jamais téléchargé ; le dessin seul non plus
  it("downloads only the files whose filter may name the account", async () => {
    const world = await buildWorld();
    await world.memory.requestErasure(GONE);
    const downloads: string[] = [];
    const { settle } = setup(world, {
      store: (store) => ({
        ...store,
        getFile: (kind, storageId) => {
          downloads.push(storageId);
          return store.getFile(kind, storageId);
        },
      }),
    });
    await settle();

    // Six fichiers nomment le compte (quatre snapshots, deux chunks) ; quatre autres et le dessin seul ne le nomment pas.
    expect(downloads.length).toBe(6);
  });

  // Un fichier d'avant les filtres est lu une fois, marqué s'il est propre : la passe suivante ne le télécharge plus
  it("reads a file saved before the filters once and marks it", async () => {
    const world = createWorld();
    await world.addSnapshot(snapshotOf("canvas-b", 10, ["other-1"]), { hasFilter: false });
    await world.addChunk(chunkOf("canvas-b", 1, ["other-1"]), false);
    const downloads: string[] = [];
    const { settle } = setup(world, {
      store: (store) => ({
        ...store,
        getFile: (kind, storageId) => {
          downloads.push(storageId);
          return store.getFile(kind, storageId);
        },
      }),
    });
    await world.memory.requestErasure(GONE);

    await settle();
    expect(downloads.length).toBe(2);
    expect(world.memory.snapshots[0]?.accountsFilter).toBeDefined();
    expect(world.memory.chunks[0]?.accountsFilter).toBeDefined();

    await world.memory.requestErasure(GONE_TOO);
    await setup(world).settle();
    expect(downloads.length).toBe(2);
  });

  // Une promotion partage le fichier de sa source : réécrit une fois, il l'est pour toutes ses lignes
  it("rewrites a file that several rows share once, for all its rows", async () => {
    const world = createWorld();
    await world.addSnapshot(snapshotOf("canvas-a", 10, [GONE]));
    await world.memory
      .retentionStore(SCOPE)
      .promote("canvas-a", { tier: "working", version: 10, takenAt: t0 + 10, isStateOnly: false }, "hourly");
    expect(new Set(world.memory.snapshots.map((row) => row.storageId)).size).toBe(1);
    let replacements = 0;
    await world.memory.requestErasure(GONE);

    await setup(world, {
      store: (store) => ({
        ...store,
        replaceFile: (...args) => {
          replacements += 1;
          return store.replaceFile(...args);
        },
      }),
    }).settle();

    expect(replacements).toBe(1);
    expect(new Set(world.memory.snapshots.map((row) => row.storageId)).size).toBe(1);
    expect(world.memory.files.size).toBe(1);
    expect((await readableFiles(world)).some((text) => text.includes(GONE))).toBe(false);
    expect(world.memory.usage).toEqual(world.memory.recountUsage());
  });

  // Deux comptes demandés dans la même passe : un fichier qui les nomme tous les deux est réécrit une fois
  it("serves every requested account in one pass, with one rewrite per file", async () => {
    const world = createWorld();
    await world.addSnapshot(snapshotOf("canvas-a", 10, [GONE, GONE_TOO, "other-1"]));
    await world.addChunk(chunkOf("canvas-a", 1, [GONE, GONE_TOO]));
    let replacements = 0;
    await world.memory.requestErasure(GONE);
    await world.memory.requestErasure(GONE_TOO);

    await setup(world, {
      store: (store) => ({
        ...store,
        replaceFile: (...args) => {
          replacements += 1;
          return store.replaceFile(...args);
        },
      }),
    }).settle();

    expect(replacements).toBe(2);
    expect(world.memory.pendingErasures).toEqual([]);
    const text = (await readableFiles(world)).join("");
    expect(text.includes(GONE) || text.includes(GONE_TOO)).toBe(false);
  });

  // Un fichier illisible ne peut pas être prouvé propre et personne ne peut le restaurer : il part avec ses lignes
  it("discards a file the codec cannot read, with its rows", async () => {
    const world = await buildWorld();
    const row = world.memory.chunks[0];
    if (!row) throw new Error("monde sans chunk");
    world.memory.files.set(row.storageId, new TextEncoder().encode("pas du brotli"));
    delete row.accountsFilter;
    await world.memory.requestErasure(GONE);

    await setup(world).settle();

    expect(world.memory.chunks.some((known) => known.storageId === row.storageId)).toBe(false);
    expect(world.memory.files.has(row.storageId)).toBe(false);
    expect(world.memory.pendingErasures).toEqual([]);
    expect(world.memory.usage).toEqual(world.memory.recountUsage());
  });

  // Un format que ce worker ne sait pas écrire (un worker plus ancien que les fichiers) garde la demande
  it("keeps the request when a file has a format this worker does not know", async () => {
    const world = await buildWorld();
    const row = world.memory.chunks[0];
    if (!row) throw new Error("monde sans chunk");
    world.memory.files.set(row.storageId, brotliCompressSync(JSON.stringify({ schemaVersion: 2 })));
    delete row.accountsFilter;
    await world.memory.requestErasure(GONE);
    const { settle, logged } = setup(world);

    await settle(8);

    expect(world.memory.pendingErasures).toEqual([GONE]);
    expect(logged.some((message) => message.includes("format inconnu"))).toBe(true);
  });

  // Coupée au milieu de la réécriture, la passe repart de zéro cinq minutes plus tard et finit sans refaire ce qui est fait
  it("resumes after a cut in the middle and does not rewrite again what is done", async () => {
    const world = await buildWorld();
    await world.memory.requestErasure(GONE);
    let replacements = 0;
    let isCutArmed = true;
    const { settle, advance, cycle, logged } = setup(world, {
      store: (store) => ({
        ...store,
        replaceFile: async (...args) => {
          if (replacements === 2 && isCutArmed) {
            isCutArmed = false;
            throw new Error("Convex a coupé");
          }
          replacements += 1;
          return store.replaceFile(...args);
        },
      }),
    });

    await settle(4);
    expect(world.memory.pendingErasures).toEqual([GONE]);
    expect(logged.some((message) => message.includes("interrompue"))).toBe(true);
    expect(replacements).toBe(2);

    await cycle.tick(); // pas avant le délai
    expect(replacements).toBe(2);
    advance(5 * 60_000);
    await settle();

    expect(world.memory.pendingErasures).toEqual([]);
    expect(replacements).toBe(6); // les 6 fichiers qui nomment le compte, chacun une fois
    expect((await readableFiles(world)).some((text) => text.includes(GONE))).toBe(false);
    expect(world.memory.usage).toEqual(world.memory.recountUsage());
  });

  // Rejouée sur un compte déjà effacé, la passe ne réécrit rien
  it("rewrites nothing when the account is requested again after the first pass", async () => {
    const world = await buildWorld();
    await world.memory.requestErasure(GONE);
    await setup(world).settle();
    const before = new Map(world.memory.files);
    let replacements = 0;
    await world.memory.requestErasure(GONE);

    await setup(world, {
      store: (store) => ({
        ...store,
        replaceFile: (...args) => {
          replacements += 1;
          return store.replaceFile(...args);
        },
      }),
    }).settle();

    expect(replacements).toBe(0);
    expect(world.memory.files).toEqual(before);
    expect(world.memory.pendingErasures).toEqual([]);
  });

  // Un tour rend la main avant la fin du bail : une longue passe s'étend sur plusieurs tours et ne solde la demande qu'à la fin
  it("spreads a long pass over several ticks and completes the request only at the end", async () => {
    const world = await buildWorld();
    await world.memory.requestErasure(GONE);
    let clock = t0;
    const slowDownloads = (store: ErasureStore): ErasureStore => ({
      ...store,
      getFile: (kind, storageId) => {
        clock += 3_000; // un téléchargement lent : deux par tour de 5 s
        return store.getFile(kind, storageId);
      },
    });
    const cycle = createErasureCycle({
      store: slowDownloads(world.memory.erasureStore),
      decodeSnapshot,
      encodeSnapshot,
      decodeChunk,
      encodeChunk,
      now: () => clock,
      log: () => undefined,
    });

    await cycle.tick();
    expect(world.memory.pendingErasures).toEqual([GONE]);
    let ticks = 1;
    while (world.memory.pendingErasures.length > 0 && ticks < 30) {
      await cycle.tick();
      ticks += 1;
    }

    expect(ticks).toBeGreaterThan(2);
    expect(world.memory.pendingErasures).toEqual([]);
    expect((await readableFiles(world)).some((text) => text.includes(GONE))).toBe(false);
  });

  // Sans demande, le cycle ne lit les demandes que toutes les cinq minutes et ne touche à aucun fichier
  it("reads the requests every five minutes only, and touches no file without a request", async () => {
    const world = await buildWorld();
    const calls: string[] = [];
    const { cycle, advance } = setup(world, {
      store: (store) => ({
        ...store,
        listPendingErasures: () => {
          calls.push("listPending");
          return store.listPendingErasures();
        },
        listFiles: (...args) => {
          calls.push("listFiles");
          return store.listFiles(...args);
        },
      }),
    });

    await cycle.tick();
    await cycle.tick();
    advance(5 * 60_000);
    await cycle.tick();

    expect(calls).toEqual(["listPending", "listPending"]);
  });
});
