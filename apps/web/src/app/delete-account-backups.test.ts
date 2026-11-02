// Le scénario des sauvegardes de CDC §8, Supprimer son compte (JOURNAL 2026-11-02) : un vrai Redis, la vraie routine, les vrais
// cycles du worker (snapshots, historique, rétention, réécriture, récupération) et leurs vrais codecs, sur un Convex en mémoire.
// Un viewer dessine, modère et signale sur les fresques d'autrui ; le worker prend des sauvegardes de chaque palier et des chunks
// pendant neuf jours ; puis la suppression. Plus aucun fichier ni aucune ligne ne nomme le compte, le dessin est celui d'avant, et
// un Redis perdu puis restauré ne le fait pas revenir.

import { randomUUID } from "node:crypto";
import { CANVAS_HEIGHT, CANVAS_WIDTH, DELETED_AUTHOR, defaultCanvasMeta } from "@liveplace/domain";
import type { DurableStore, ErasureStore, SnapshotStore } from "@liveplace/domain/ports";
import { restoreState } from "@liveplace/domain/snapshot";
import {
  createAccountPurge,
  createArchiveWrites,
  createHistorySource,
  createRecoveryTarget,
  createSnapshotSource,
  toDeletedAccountKey,
} from "@liveplace/redis-core";
import { describe, expect, it, vi } from "vitest";
import { createMemoryDurable } from "../../../../packages/durable/src/memory-durable";
// Le harnais de test de Redis n'est pas dans l'index du package : il ne sert qu'aux tests (voir delete-account.test.ts).
import type {} from "../../../../packages/redis-core/src/test-global-setup";
import { createRedisHarness } from "../../../../packages/redis-core/src/test-harness";
import { decodeChunk, encodeChunk } from "../../../worker/src/infra/chunk-codec";
import { decodeImage, encodeImage } from "../../../worker/src/infra/image-codec";
import { decodeSnapshot, encodeSnapshot } from "../../../worker/src/infra/snapshot-codec";
import { createErasureCycle } from "../../../worker/src/usecase/erasure-cycle";
import { createHistoryCycle } from "../../../worker/src/usecase/history-cycle";
import { createHistoryPlan } from "../../../worker/src/usecase/history-plan";
import { createRecoveryCycle } from "../../../worker/src/usecase/recovery-cycle";
import { createRetentionCycle } from "../../../worker/src/usecase/retention-cycle";
import { createSnapshotCycle } from "../../../worker/src/usecase/snapshot-cycle";
import { createSnapshotPlan } from "../../../worker/src/usecase/snapshot-plan";
import { type DeleteAccountDeps, deleteAccount } from "../usecase/delete-account";

vi.setConfig({ testTimeout: 60_000 });

const harness = createRedisHarness();
const { redis, core, runId } = harness;
const SECRET = "un-secret-de-session-de-plus-de-32-octets";
const SCOPE = "prod";
const archiveWrites = createArchiveWrites(redis);
const realPurge = createAccountPurge(redis, SECRET);

const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;
// Un lundi, à 10 h UTC : la semaine du 5 octobre se ferme le 12, un jour entier se ferme à minuit.
const MONDAY = Date.UTC(2026, 9, 5, 10, 0);

type Canvas = Awaited<ReturnType<typeof harness.readyCanvas>>;

const metaOf = (ownerId: string) => ({
  ...defaultCanvasMeta(ownerId),
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  gaugeMaxStart: 1000,
  gaugeMaxCeiling: 1000,
  refillMs: 1000,
  obsDelayMs: 5000,
});

const drawingOf = async (canvas: Canvas): Promise<Buffer> =>
  Buffer.from((await core.getSnapshot(canvas.canvasId)).state);

// Tout ce que ce monde a mis dans Redis et qui nomme `id`, dans le nom d'une clé ou dans sa valeur.
const listTraces = async (id: string): Promise<string[]> => {
  const found: string[] = [];
  for await (const page of redis.scanStream({ match: "*", count: 1000 })) {
    for (const name of page as string[]) {
      if (name.includes(id)) found.push(name);
      else if (!name.endsWith(":state") && JSON.stringify(await getKey(name)).includes(id)) found.push(name);
    }
  }
  return found;
};

const getKey = async (name: string): Promise<unknown> => {
  switch (await redis.type(name)) {
    case "string":
      return redis.get(name);
    case "hash":
      return redis.hgetall(name);
    case "set":
      return redis.smembers(name);
    case "zset":
      return redis.zrange(name, "0", "-1", "WITHSCORES");
    case "list":
      return redis.lrange(name, 0, -1);
    case "stream":
      return redis.xrange(name, "-", "+");
    default:
      return null;
  }
};

let worldCount = 0;

// Le monde : un streamer (actif et archive), un autre streamer, un viewer qui sera supprimé et deux autres comptes. Le worker de
// ce monde ne regarde que les fresques de ce monde : le Redis de test est partagé avec les autres fichiers.
const buildWorld = async () => {
  worldCount += 1;
  const id = (name: string) => `${runId}-b${worldCount}-${name}`;
  const [streamer, other, viewer, bystander] = [id("streamer"), id("other"), id("viewer"), id("bystander")];
  const memory = createMemoryDurable();
  const active = await harness.readyCanvas(metaOf(streamer));
  const archive = await harness.readyCanvas(metaOf(streamer));
  const elsewhere = await harness.readyCanvas(metaOf(other));
  const canvases = [active, archive, elsewhere];
  const mine = new Set(canvases.map(({ canvasId }) => canvasId));
  for (const { canvasId } of canvases) memory.canvases.add(canvasId);
  for (const [userId, login] of [
    [streamer, "streamer"],
    [other, "other"],
    [bystander, "bystander"],
  ] as const)
    memory.users.set(userId, { userId, login, displayName: login });

  let clock = MONDAY;
  const logged: string[] = [];
  const log = (message: string): void => {
    logged.push(message);
  };

  const place = (canvas: Canvas, userId: string, placementId: string, x: number, y: number, color: number) =>
    harness.placeInBatches(canvas.canvasId, userId, placementId, [{ x, y, colorIndex: color }], clock);
  const moderate = async (
    canvas: Canvas,
    by: string,
    action: Parameters<typeof core.moderate>[1]["action"],
  ) => {
    let slice: "first" | "next" = "first";
    for (;;) {
      const result = await core.moderate(canvas.canvasId, { by, nowMs: clock, action, slice });
      if (!result.ok) throw new Error(result.error);
      if (result.value.isDone) return;
      slice = "next";
    }
  };
  const report = (canvas: Canvas, reporterId: string, x: number, y: number, placementId: string) =>
    core.report(canvas.canvasId, { reporterId, x, y, placementId, threshold: 1, nowMs: clock });

  // Le worker de ce monde : les mêmes cycles que `apps/worker/src/app/main.ts`, sur un Convex en mémoire.
  const snapshotSource = createSnapshotSource(redis, redis);
  const historySource = createHistorySource(redis, redis);
  const retention = createRetentionCycle({
    store: memory.retentionStore(SCOPE),
    decode: decodeSnapshot,
    encodeImage,
    now: () => clock,
    log,
  });
  let storeSnapshot: SnapshotStore["storeSnapshot"] = (file) =>
    memory.snapshotStore(SCOPE).storeSnapshot(file);
  const snapshots = createSnapshotCycle({
    source: {
      ...snapshotSource,
      listCanvases: async () =>
        new Map([...(await snapshotSource.listCanvases())].filter(([canvasId]) => mine.has(canvasId))),
      watch: async () => async () => undefined,
    },
    store: { ...memory.snapshotStore(SCOPE), storeSnapshot: (file) => storeSnapshot(file) },
    plan: createSnapshotPlan(),
    encode: encodeSnapshot,
    now: () => clock,
    log,
    onStored: (stored) => retention.noteStored(stored),
  });
  const historyPlan = createHistoryPlan();
  const histories = createHistoryCycle({
    source: { ...historySource, watch: async () => async () => undefined },
    store: memory.historyStore(SCOPE),
    plan: historyPlan,
    encode: encodeChunk,
    now: () => clock,
    log,
  });
  await snapshots.start();
  await histories.start();
  await retention.start();

  // Un passage du worker à l'heure `at` : il voit les versions, attend le calme de cinq minutes, sauvegarde, range l'historique et
  // ses paliers.
  const workerAt = async (at: number) => {
    clock = at;
    const found = await snapshots.sweep();
    await histories.sweep(found.keys());
    clock += 6 * minute;
    await snapshots.tick();
    await histories.tick();
    for (let pass = 0; pass < 3; pass += 1) {
      clock += 61_000;
      await retention.tick();
    }
  };

  // La réécriture des sauvegardes : ses tours, jusqu'à ce que plus aucune demande ne reste.
  let erasureStore: ErasureStore = memory.erasureStore;
  const erasure = createErasureCycle({
    store: {
      listPendingErasures: () => erasureStore.listPendingErasures(),
      completeErasure: (userId) => erasureStore.completeErasure(userId),
      listFiles: (...args) => erasureStore.listFiles(...args),
      getFile: (...args) => erasureStore.getFile(...args),
      replaceFile: (...args) => erasureStore.replaceFile(...args),
      stampFilter: (...args) => erasureStore.stampFilter(...args),
      discardFile: (...args) => erasureStore.discardFile(...args),
    },
    decodeSnapshot,
    encodeSnapshot,
    decodeChunk,
    encodeChunk,
    now: () => clock,
    log,
  });
  const settleErasure = async (maxTicks = 80) => {
    for (let tick = 0; tick < maxTicks && memory.pendingErasures.length > 0; tick += 1) {
      await erasure.tick();
      clock += 1_000;
    }
  };

  const deps: DeleteAccountDeps = {
    durable: {
      listCanvasesForOwner: async () => ({ active: null, archives: [] }),
      discardOwnedCanvases: async () => [],
      requestErasure: (userId) => memory.requestErasure(userId),
      keepDeletedAccount: async () => undefined,
      syncDeletedAccounts: async () => [],
      deleteUser: async () => null,
      detachDiscoveredAccounts: async () => undefined,
    } satisfies Pick<
      DurableStore,
      | "listCanvasesForOwner"
      | "discardOwnedCanvases"
      | "requestErasure"
      | "keepDeletedAccount"
      | "syncDeletedAccounts"
      | "deleteUser"
      | "detachDiscoveredAccounts"
    >,
    purge: realPurge,
    eventSub: { deleteSubscriptions: async () => undefined },
    forgetOwner: () => undefined,
    now: () => clock,
    randomRunId: randomUUID,
  };

  // Neuf jours de vie : le viewer dessine chez le streamer et chez l'autre, modère, signale, est banni ; le worker passe quatre fois.
  await place(active, viewer, "pviewer001", 0, 0, 5);
  await place(active, bystander, "pbystand01", 0, 0, 6);
  await place(active, viewer, "pviewer002", 4, 4, 7);
  await place(archive, viewer, "pviewer011", 5, 5, 8);
  await place(elsewhere, viewer, "pviewer021", 3, 3, 9);
  await place(elsewhere, bystander, "pbystand02", 3, 3, 10);
  await core.setModerator(active.canvasId, { userId: viewer, source: "liveplace", isModerator: true });
  await core.setModerator(archive.canvasId, { userId: viewer, source: "twitch", isModerator: true });
  await archiveWrites.markArchived(archive.canvasId, { archivedAt: clock, successorId: active.canvasId });
  await workerAt(MONDAY);

  clock = MONDAY + 2 * hour;
  await place(active, viewer, "pviewer003", 8, 8, 4);
  await place(elsewhere, viewer, "pviewer022", 6, 6, 4);
  await place(elsewhere, bystander, "pbystand03", 7, 7, 3);
  await report(active, viewer, 0, 0, "pbystand01");
  await report(active, bystander, 8, 8, "pviewer003");
  await moderate(active, viewer, { action: "clearPlacement", target: bystander, placementId: "pbystand01" });
  await moderate(elsewhere, other, { action: "ban", target: viewer });
  await moderate(elsewhere, other, { action: "clearUser", target: viewer });
  await workerAt(MONDAY + 2 * hour);

  clock = MONDAY + 2 * day + hour;
  await place(active, bystander, "pbystand04", 9, 9, 2);
  await place(elsewhere, bystander, "pbystand05", 10, 10, 2);
  await workerAt(MONDAY + 2 * day + hour);

  clock = MONDAY + 8 * day + hour;
  await place(active, bystander, "pbystand06", 11, 11, 2);
  await place(elsewhere, bystander, "pbystand07", 12, 12, 2);
  await workerAt(MONDAY + 8 * day + hour);
  clock = MONDAY + 8 * day + 3 * hour;

  return {
    id,
    streamer,
    other,
    viewer,
    bystander,
    canvases,
    active,
    archive,
    elsewhere,
    memory,
    logged,
    deps,
    workerAt,
    settleErasure,
    getClock: () => clock,
    advance: (ms: number) => {
      clock += ms;
    },
    setStoreSnapshot: (replacement: SnapshotStore["storeSnapshot"]) => {
      storeSnapshot = replacement;
    },
    setErasureStore: (replacement: ErasureStore) => {
      erasureStore = replacement;
    },
    snapshots,
    histories,
    historyPlan,
    place,
  };
};

type World = Awaited<ReturnType<typeof buildWorld>>;

// Tout fichier du déploiement, lu avec le codec du worker : un fichier que le codec ne lit pas ne passerait pas ce filtre.
const listStoredFiles = async (world: World) => {
  const read: { kind: "snapshot" | "chunk" | "image"; text: string }[] = [];
  for (const bytes of world.memory.files.values()) {
    const snapshot = await decodeSnapshot(bytes);
    if (snapshot.ok) read.push({ kind: "snapshot", text: JSON.stringify(snapshot.value) });
    else {
      const chunk = await decodeChunk(bytes);
      if (chunk.ok) read.push({ kind: "chunk", text: JSON.stringify(chunk.value) });
      else if ((await decodeImage(bytes)).ok) read.push({ kind: "image", text: "image" });
      else throw new Error("un fichier que ni le snapshot, ni le chunk, ni le dessin seul ne lisent");
    }
  }
  return read;
};

const rowsText = (world: World): string => JSON.stringify([world.memory.snapshots, world.memory.chunks]);

// Le dessin que chaque sauvegarde complète rend : `state` refait de ses cases, par ligne.
const drawingsOfSnapshots = async (world: World): Promise<Map<string, number[]>> => {
  const drawings = new Map<string, number[]>();
  for (const row of world.memory.snapshots.filter(({ isStateOnly }) => !isStateOnly)) {
    const decoded = await decodeSnapshot(world.memory.files.get(row.storageId) ?? new Uint8Array());
    if (!decoded.ok) throw new Error("sauvegarde illisible");
    const { width, height } = {
      width: Number(decoded.value.meta.width),
      height: Number(decoded.value.meta.height),
    };
    drawings.set(`${row.canvasId}/${row.tier}/${row.takenAt}`, [
      ...restoreState({ width, height }, decoded.value.cells),
    ]);
  }
  return drawings;
};

// L'historique que chaque chunk rend, sans ses auteurs : de quoi le rejouer.
const historyOfChunks = async (world: World) => {
  const history = new Map<string, unknown>();
  for (const row of world.memory.chunks) {
    const decoded = await decodeChunk(world.memory.files.get(row.storageId) ?? new Uint8Array());
    if (!decoded.ok) throw new Error("chunk illisible");
    history.set(
      `${row.canvasId}/${row.fromVersion}`,
      decoded.value.entries.map(([version, placementId, event]) => [
        version,
        placementId,
        event.kind,
        event.occurredAt,
        event.cells,
        event.moderation?.action,
        event.moderation?.placementId,
      ]),
    );
  }
  return history;
};

const authorsOfChunks = async (world: World): Promise<string[]> => {
  const authors: string[] = [];
  for (const row of world.memory.chunks) {
    const decoded = await decodeChunk(world.memory.files.get(row.storageId) ?? new Uint8Array());
    if (decoded.ok)
      for (const [, , event] of decoded.value.entries) authors.push(event.authorId ?? "système");
  }
  return authors;
};

// La perte totale d'un Redis, puis le tour de la récupération du worker. Le Redis de test est partagé avec les autres fichiers,
// et un FLUSHALL les arrêterait : on efface tout ce que ce monde y avait mis, `deleted:account:` du viewer compris.
const loseRedisAndRecover = async (world: World) => {
  const lost = [...(await redis.keys(`cv:${runId}-*`)), ...(await redis.keys(`user:${runId}-*`))];
  await redis.del(...lost, toDeletedAccountKey(SECRET, world.viewer));
  expect(await redis.exists(...world.canvases.map(({ canvasId }) => `cv:${canvasId}:version`))).toBe(0);
  const recovery = createRecoveryCycle({
    target: createRecoveryTarget(redis),
    store: world.memory.recoveryStore(SCOPE),
    decode: decodeSnapshot,
    getCursor: world.historyPlan.getCursor,
    now: () => world.getClock(),
    log: () => undefined,
  });
  for (const { canvasId } of world.canvases) recovery.noteSaved(canvasId);
  await recovery.tick();
};

// Les fresques sont revenues, rien ne nomme le viewer, et l'Inspection de sa case dit « Compte supprimé ».
const expectViewerGone = async (world: World, [x, y]: [number, number]) => {
  for (const canvas of world.canvases) expect(await core.getCanvas(canvas.canvasId)).not.toBeNull();
  expect(await listTraces(world.viewer)).toEqual([]);
  expect(await core.inspect(world.active.canvasId, x, y)).toMatchObject({
    userId: DELETED_AUTHOR,
    isDeleted: true,
    login: "",
    displayName: "",
    colorIndex: 7,
  });
  expect(await core.isBanned(world.elsewhere.canvasId, world.viewer)).toBe(false);
};

describe("the backups of a deleted account (CDC §8, JOURNAL 2026-11-02)", () => {
  // Le monde a bien tout ce que la preuve cherche : chaque palier, des chunks, et le compte nommé partout
  it("builds a world with every tier, chunks, and the account named in the files", async () => {
    const world = await buildWorld();

    const tiers = new Set(world.memory.snapshots.map(({ tier }) => tier));
    expect([...tiers].sort()).toEqual(["daily", "hourly", "weekly", "working"]);
    for (const tier of ["working", "hourly", "daily"] as const)
      expect(world.memory.snapshots.some((row) => row.tier === tier && !row.isStateOnly)).toBe(true);
    expect(world.memory.snapshots.some((row) => row.tier === "weekly" && row.isStateOnly)).toBe(true);
    expect(world.memory.chunks.length).toBeGreaterThan(3);
    const files = await listStoredFiles(world);
    expect(files.filter(({ text }) => text.includes(world.viewer)).length).toBeGreaterThan(5);
  });

  // La suppression : plus aucun fichier ni aucune ligne ne nomme le compte, de chaque palier, ni chunk
  it("leaves no file or row that names the account, in any tier or chunk", async () => {
    const world = await buildWorld();
    const drawingsBefore = await Promise.all(world.canvases.map(drawingOf));

    const result = await deleteAccount(world.deps, { userId: world.viewer, trigger: "button" });
    await world.settleErasure();

    expect(result).toEqual({ ok: true, value: undefined });
    expect(world.memory.pendingErasures).toEqual([]);
    const files = await listStoredFiles(world);
    expect(files.some(({ text }) => text.includes(world.viewer))).toBe(false);
    expect(rowsText(world)).not.toContain(world.viewer);
    expect(await listTraces(world.viewer)).toEqual([]);
    expect(await Promise.all(world.canvases.map(drawingOf))).toEqual(drawingsBefore);
    expect(world.memory.usage).toEqual(world.memory.recountUsage());
  });

  // Le dessin de chaque sauvegarde est identique, case par case, et l'historique se rejoue : mêmes versions, poses, cases et dates
  it("keeps every backup's drawing identical cell by cell and every chunk replayable", async () => {
    const world = await buildWorld();
    const drawingsBefore = await drawingsOfSnapshots(world);
    const historyBefore = await historyOfChunks(world);
    expect(drawingsBefore.size).toBeGreaterThan(5);
    expect((await authorsOfChunks(world)).includes(world.viewer)).toBe(true);

    await deleteAccount(world.deps, { userId: world.viewer, trigger: "button" });
    await world.settleErasure();

    expect(await drawingsOfSnapshots(world)).toEqual(drawingsBefore);
    expect(await historyOfChunks(world)).toEqual(historyBefore);
    const authors = await authorsOfChunks(world);
    expect(authors).toContain(DELETED_AUTHOR);
    expect(authors).not.toContain(world.viewer);
  });

  // La preuve de la course : un snapshot lu dans Redis avant la purge et enregistré après elle est réécrit aussi
  it("rewrites a snapshot read before the purge and stored after the request", async () => {
    const world = await buildWorld();
    const stale: { canvasId: string }[] = [];
    // La page lit Redis, puis la suppression passe entière, puis le fichier est enregistré : il nomme encore le compte.
    world.setStoreSnapshot(async (file) => {
      const snapshots = world.memory.snapshotStore(SCOPE);
      if (stale.length === 0) {
        stale.push({ canvasId: file.canvasId });
        await deleteAccount(world.deps, { userId: world.viewer, trigger: "button" });
      }
      return snapshots.storeSnapshot(file);
    });
    await world.place(world.active, world.bystander, "pbystand08", 13, 13, 2);
    await world.workerAt(world.getClock());
    expect(stale).toHaveLength(1);
    const staleFile = await decodeSnapshot(
      world.memory.files.get(
        world.memory.snapshots
          .filter((row) => row.canvasId === stale[0]?.canvasId)
          .sort((a, b) => b.takenAt - a.takenAt)[0]?.storageId ?? "",
      ) ?? new Uint8Array(),
    );
    expect(staleFile.ok && JSON.stringify(staleFile.value).includes(world.viewer)).toBe(true);

    await world.settleErasure();

    expect((await listStoredFiles(world)).some(({ text }) => text.includes(world.viewer))).toBe(false);
  });

  // Même course pour un chunk : lu dans le flux avant la purge, rangé après la demande
  it("rewrites a chunk read from the stream before the purge and stored after the request", async () => {
    const world = await buildWorld();
    const chunkStore = world.memory.historyStore(SCOPE);
    let isRaced = false;
    const racing = createHistoryCycle({
      source: { ...createHistorySource(redis, redis), watch: async () => async () => undefined },
      store: {
        ...chunkStore,
        storeChunk: async (file) => {
          if (!isRaced) {
            isRaced = true;
            await deleteAccount(world.deps, { userId: world.viewer, trigger: "button" });
          }
          return chunkStore.storeChunk(file);
        },
      },
      plan: world.historyPlan,
      encode: encodeChunk,
      now: () => world.getClock() + 10 * minute,
      log: () => undefined,
    });
    // Une pose du viewer que le flux garde et que aucun chunk n'a rangée.
    await world.place(world.active, world.viewer, "pviewer009", 20, 20, 3);
    await world.place(world.elsewhere, world.bystander, "pbystand09", 21, 21, 3);
    await racing.sweep(world.canvases.map(({ canvasId }) => canvasId));
    await racing.tick();
    expect(isRaced).toBe(true);

    await world.settleErasure();

    expect((await listStoredFiles(world)).some(({ text }) => text.includes(world.viewer))).toBe(false);
    expect(await authorsOfChunks(world)).not.toContain(world.viewer);
  });

  // Coupée au milieu de la réécriture, la réécriture reprend seule et finit ; rejouée ensuite elle ne change rien
  it("resumes after a cut in the middle of the rewriting, and changes nothing when it runs again", async () => {
    const world = await buildWorld();
    let replacements = 0;
    let isCut = false;
    world.setErasureStore({
      ...world.memory.erasureStore,
      replaceFile: async (...args) => {
        replacements += 1;
        if (replacements === 4 && !isCut) {
          isCut = true;
          throw new Error("Convex a coupé");
        }
        return world.memory.erasureStore.replaceFile(...args);
      },
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await deleteAccount(world.deps, { userId: world.viewer, trigger: "button" });

    await world.settleErasure(5);
    expect(world.memory.pendingErasures).toEqual([world.viewer]);
    expect(isCut).toBe(true);
    world.advance(6 * minute); // le délai de reprise de la réécriture
    await world.settleErasure();

    expect(world.memory.pendingErasures).toEqual([]);
    expect((await listStoredFiles(world)).some(({ text }) => text.includes(world.viewer))).toBe(false);
    const settled = new Map(world.memory.files);
    replacements = 0;
    await deleteAccount(world.deps, { userId: world.viewer, trigger: "button" });
    await world.settleErasure();
    expect(replacements).toBe(0);
    expect(world.memory.files).toEqual(settled);
    vi.restoreAllMocks();
  });

  // Redis perd tout, la récupération remet les fresques : le compte ne revient pas, et l'Inspection de sa case dit « Compte supprimé »
  it("does not bring the account back when Redis loses everything and the worker restores the canvases", async () => {
    const world = await buildWorld();
    const [x, y] = [4, 4];
    expect(await core.inspect(world.active.canvasId, x, y)).toMatchObject({ userId: world.viewer });
    const drawingsBefore = await Promise.all(world.canvases.map(drawingOf));
    await deleteAccount(world.deps, { userId: world.viewer, trigger: "button" });
    await world.settleErasure();

    await loseRedisAndRecover(world);

    await expectViewerGone(world, [x, y]);
    expect(await Promise.all(world.canvases.map(drawingOf))).toEqual(drawingsBefore);
  });

  // Même perte alors que la réécriture n'a pas commencé : les fichiers nomment encore le compte, la récupération ne le remet pas
  it("does not bring the account back either when Redis is lost before the files are rewritten", async () => {
    const world = await buildWorld();
    await deleteAccount(world.deps, { userId: world.viewer, trigger: "button" });
    expect(world.memory.pendingErasures).toEqual([world.viewer]);
    expect((await listStoredFiles(world)).some(({ text }) => text.includes(world.viewer))).toBe(true);

    await loseRedisAndRecover(world);

    await expectViewerGone(world, [4, 4]);
    await world.settleErasure();
    expect((await listStoredFiles(world)).some(({ text }) => text.includes(world.viewer))).toBe(false);
  });
});
