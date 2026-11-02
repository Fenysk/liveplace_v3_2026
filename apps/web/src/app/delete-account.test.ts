// Le scénario complet de CDC §8, Supprimer son compte : un vrai Redis, les vrais vérificateurs de session, la vraie
// routine, et un Convex en mémoire qui tient ses tables comme les fonctions de `packages/durable/convex`. Un viewer qui
// dessine chez un streamer et chez un autre, banni, modérateur, signalant, classé, puis la suppression du viewer et celle du
// streamer ; un effacement coupé qui reprend ; une reconnexion qui crée un compte neuf.

import { randomUUID } from "node:crypto";
import { CANVAS_HEIGHT, CANVAS_WIDTH, DELETED_AUTHOR, defaultCanvasMeta } from "@liveplace/domain";
import type {
  AccountDeletionProof,
  DeletedAccountMark,
  DeletedProfile,
  DurableStore,
  OwnerCanvases,
} from "@liveplace/domain/ports";
import {
  createAccountList,
  createAccountPurge,
  createArchiveWrites,
  createDeletedAccounts,
  createSignInWrites,
  createTwitchLiveStore,
  DELETED_MARKS_SYNCED_KEY,
  toDeletedAccountKey,
  twitchLiveKey,
} from "@liveplace/redis-core";
import { SignJWT } from "jose";
import { describe, expect, it, vi } from "vitest";
// Le harnais de test de Redis n'est pas dans l'index du package : il ne sert qu'aux tests. Il lit `inject("redisPort")`, que
// le setup global déclare : ce fichier doit être dans le programme TypeScript du web pour que la déclaration s'applique.
import type {} from "../../../../packages/redis-core/src/test-global-setup";
import { createRedisHarness } from "../../../../packages/redis-core/src/test-harness";
import { createSessionSigner, createSessionVerifier } from "../infra/session";
import {
  type DeleteAccountDeps,
  deleteAccount,
  finishPendingDeletion,
  resumePendingDeletions,
} from "../usecase/delete-account";
import { resolveArchive } from "../usecase/resolve-archive";
import { resolveCanvas } from "../usecase/resolve-canvas";
import { trackKnownAccounts } from "../usecase/track-known-accounts";
import { createTwitchLiveTracker } from "../usecase/twitch-live";

vi.setConfig({ testTimeout: 30_000 });

const harness = createRedisHarness();
const { redis, core, runId } = harness;
const SECRET = "un-secret-de-session-de-plus-de-32-octets";
const deletedAccounts = createDeletedAccounts(redis, SECRET);
const signer = createSessionSigner(SECRET);
const verifier = createSessionVerifier(SECRET, deletedAccounts);
const archiveWrites = createArchiveWrites(redis);
const signIn = createSignInWrites(redis);

const startedAt = Date.now();
const minute = 60_000;

type Account = {
  userId: string;
  login: string;
  displayName: string;
  avatarUrl: string;
  email?: string;
  discoveredViaUserId?: string;
};
type StoredCanvas = { canvasId: string; ownerId: string; isActive: boolean; linkCode?: string };

// Convex en mémoire : les tables, et ce que les mutations de `packages/durable/convex` font de ces tables.
const createConvex = () => {
  const users: Account[] = [];
  const canvases: StoredCanvas[] = [];
  const proofs: AccountDeletionProof[] = [];
  const erasures: string[] = []; // les comptes dont les sauvegardes restent à réécrire : le worker, hors de ce scénario
  const marks: DeletedAccountMark[] = []; // les empreintes de session que Convex garde
  const ownerCanvases = (ownerId: string): OwnerCanvases => {
    const owned = canvases.filter((canvas) => canvas.ownerId === ownerId);
    const active = owned.find((canvas) => canvas.isActive);
    const toSize = ({ canvasId }: StoredCanvas) => ({ canvasId, width: 10, height: 10, createdAt: 1 });
    return {
      active: active ? toSize(active) : null,
      archives: owned
        .filter((canvas) => !canvas.isActive)
        .map((canvas) => ({ ...toSize(canvas), archivedAt: 2, linkCode: canvas.linkCode ?? "ABCDEFGHJK" })),
    };
  };
  const durable: Pick<
    DurableStore,
    | "getUserByLogin"
    | "getActiveCanvasForOwner"
    | "getArchiveByLinkCode"
    | "listCanvasesForOwner"
    | "discardOwnedCanvases"
    | "requestErasure"
    | "keepDeletedAccount"
    | "syncDeletedAccounts"
    | "deleteUser"
    | "detachDiscoveredAccounts"
  > = {
    getUserByLogin: async (login) => users.find((user) => user.login === login) ?? null,
    getActiveCanvasForOwner: async (ownerId) => ownerCanvases(ownerId).active,
    getArchiveByLinkCode: async (ownerId, linkCode) => {
      const archive = ownerCanvases(ownerId).archives.find((candidate) => candidate.linkCode === linkCode);
      return archive ? { status: "archived", archive } : null;
    },
    listCanvasesForOwner: async (ownerId) => ownerCanvases(ownerId),
    discardOwnedCanvases: async (ownerId) => {
      const discarded = canvases.filter((canvas) => canvas.ownerId === ownerId);
      for (const canvas of discarded) canvases.splice(canvases.indexOf(canvas), 1);
      return discarded.map(({ canvasId }) => canvasId);
    },
    requestErasure: async (userId) => {
      erasures.push(userId);
    },
    keepDeletedAccount: async (mark) => {
      marks.push(mark);
    },
    syncDeletedAccounts: async (since) => marks.filter(({ deletedAt }) => deletedAt >= since),
    deleteUser: async (userId, proof) => {
      const found = users.find((user) => user.userId === userId);
      if (found) users.splice(users.indexOf(found), 1);
      if (!proofs.some(({ runId: known }) => known === proof.runId)) proofs.push(proof);
      return found ? { login: found.login, avatarUrl: found.avatarUrl } : null;
    },
    detachDiscoveredAccounts: async (userId) => {
      for (const user of users) if (user.discoveredViaUserId === userId) delete user.discoveredViaUserId;
    },
  };
  return { users, canvases, proofs, marks, durable };
};

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

const placeAs = (
  canvas: Canvas,
  userId: string,
  placementId: string,
  x: number,
  y: number,
  colorIndex: number,
  at: number,
) => harness.placeInBatches(canvas.canvasId, userId, placementId, [{ x, y, colorIndex }], at);

const drawingOf = async (canvas: Canvas): Promise<Buffer> =>
  Buffer.from((await core.getSnapshot(canvas.canvasId)).state);

// Tout ce qui, dans Redis, nomme `id` : dans le nom d'une clé, ou dans sa valeur quel que soit son type.
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
const buildWorld = async () => {
  worldCount += 1;
  const id = (name: string) => `${runId}-s${worldCount}-${name}`;
  const [streamer, other, viewer, bystander] = [id("streamer"), id("other"), id("viewer"), id("bystander")];
  const convex = createConvex();
  const person = (userId: string, name: string, more: Partial<Account> = {}): Account => ({
    userId,
    login: `${name}-s${worldCount}`,
    displayName: name,
    avatarUrl: `https://avatar/${name}`,
    ...more,
  });
  convex.users.push(
    person(streamer, "streamer", { email: "streamer@example.com" }),
    person(other, "other"),
    person(viewer, "viewer", { email: "viewer@example.com", discoveredViaUserId: streamer }),
    person(bystander, "bystander", { discoveredViaUserId: streamer }),
  );
  const make = async (ownerId: string, isActive = true) => {
    const canvas = await harness.readyCanvas(metaOf(ownerId));
    convex.canvases.push({ canvasId: canvas.canvasId, ownerId, isActive });
    return canvas;
  };
  const active = await make(streamer);
  const archive = await make(streamer, false);
  const elsewhere = await make(other);
  for (const account of convex.users) await signIn.setUser(account);

  // L'actif et l'archive du streamer, la fresque de l'autre : le viewer y dessine, un autre recouvre une de ses cases.
  await placeAs(active, viewer, "pviewer001", 0, 0, 5, startedAt);
  await placeAs(active, bystander, "pbystand01", 0, 0, 6, startedAt + minute);
  await placeAs(active, viewer, "pviewer002", 4, 4, 7, startedAt + 2 * minute);
  await placeAs(active, streamer, "pstreamer1", 9, 9, 3, startedAt + 3 * minute);
  await placeAs(archive, viewer, "pviewer011", 5, 5, 8, startedAt);
  await placeAs(elsewhere, viewer, "pviewer021", 3, 3, 9, startedAt);
  await placeAs(elsewhere, streamer, "pstreamer2", 8, 8, 4, startedAt + minute);
  await placeAs(elsewhere, bystander, "pbystand02", 3, 3, 10, startedAt + 2 * minute);
  // Le viewer est banni chez l'autre ; il est modérateur chez le streamer ; il signale une pose ; on signale la sienne.
  const banViewer = { by: other, nowMs: startedAt + 3 * minute, slice: "first" } as const;
  await core.moderate(elsewhere.canvasId, { ...banViewer, action: { action: "ban", target: viewer } });
  await core.moderate(elsewhere.canvasId, { ...banViewer, action: { action: "clearUser", target: viewer } });
  await core.setModerator(active.canvasId, { userId: viewer, source: "liveplace", isModerator: true });
  const report = (reporterId: string, x: number, y: number, placementId: string) =>
    core.report(active.canvasId, {
      reporterId,
      x,
      y,
      placementId,
      threshold: 1,
      nowMs: startedAt + 4 * minute,
    });
  await report(viewer, 0, 0, "pbystand01");
  await report(bystander, 4, 4, "pviewer002");
  await archiveWrites.markArchived(archive.canvasId, {
    archivedAt: startedAt + 5 * minute,
    successorId: active.canvasId,
  });
  const signups = `activity:signups:${runId}-s${worldCount}`;
  await redis.hset(signups, { [streamer]: 2, none: 1 });

  const forgotten: DeletedProfile[] = [];
  const subscriptionsDeleted: string[] = [];
  const failures = { purgeTraces: 0 };
  const realPurge = createAccountPurge(redis, SECRET);
  const deps: DeleteAccountDeps = {
    durable: convex.durable,
    purge: {
      ...realPurge,
      purgeTraces: async (userId) => {
        if (failures.purgeTraces-- > 0) throw new Error("coupure");
        return realPurge.purgeTraces(userId);
      },
    },
    eventSub: {
      deleteSubscriptions: async (userId) => {
        subscriptionsDeleted.push(userId);
      },
    },
    forgetOwner: (profile) => forgotten.push(profile),
    now: () => startedAt,
    randomRunId: randomUUID,
  };
  const drawings = () => Promise.all([active, archive, elsewhere].map(drawingOf));
  return {
    id,
    streamer,
    other,
    viewer,
    bystander,
    convex,
    active,
    archive,
    elsewhere,
    signups,
    deps,
    failures,
    forgotten,
    subscriptionsDeleted,
    drawings,
  };
};

const rowsNaming = (convex: ReturnType<typeof createConvex>, id: string) =>
  JSON.stringify([convex.users, convex.canvases, convex.proofs]).includes(id);

describe("deleting a viewer, then a streamer (CDC §8, Supprimer son compte)", () => {
  // Un viewer supprimé : plus rien ne le nomme, ni dans Redis ni dans Convex, et les fresques des autres dessinent la même chose
  it("leaves nothing that names a deleted viewer in Redis or Convex, and the others' canvases draw the same", async () => {
    const world = await buildWorld();
    const before = await world.drawings();
    expect((await listTraces(world.viewer)).length).toBeGreaterThan(10);

    const result = await deleteAccount(world.deps, { userId: world.viewer, trigger: "button" });

    expect(result).toEqual({ ok: true, value: undefined });
    expect(await listTraces(world.viewer)).toEqual([]);
    expect(rowsNaming(world.convex, world.viewer)).toBe(false);
    expect(JSON.stringify(world.convex)).not.toContain("viewer@example.com");
    expect(await world.drawings()).toEqual(before);
    // Ses pixels restent, sans auteur ; le classement et les bannis ne le montrent plus.
    expect(await core.inspect(world.active.canvasId, 0, 0)).toMatchObject({
      userId: world.bystander,
      colorIndex: 6,
    });
    expect(await core.inspect(world.active.canvasId, 4, 4)).toMatchObject({
      userId: DELETED_AUTHOR,
      isDeleted: true,
      login: "",
      displayName: "",
      colorIndex: 7,
    });
    expect((await core.listScoreboard(world.active.canvasId)).map(({ login }) => login)).not.toContain(
      world.viewer,
    );
    expect(await core.listBans(world.elsewhere.canvasId)).toEqual([]);
    // La preuve : la date, le déclencheur, ce qui est parti (son e-mail), et rien qui le nomme.
    expect(world.convex.proofs).toEqual([
      { runId: expect.any(String), deletedAt: startedAt, trigger: "button", ownedCanvases: 0 },
    ]);
  });

  // Un streamer supprimé : sa fresque et ses archives partent, `/{login}` et ses archives disent « introuvable », ses comptes découverts le perdent
  it("deletes a streamer's canvases, makes its page and archives unknown, and detaches the accounts it brought", async () => {
    const world = await buildWorld();
    const ownerLogin = world.convex.users.find((user) => user.userId === world.streamer)?.login ?? "";
    const elsewhereBefore = await drawingOf(world.elsewhere);
    expect(await resolveCanvas(world.convex.durable, ownerLogin)).toMatchObject({
      canvasId: world.active.canvasId,
    });
    expect(await resolveArchive(world.convex.durable, ownerLogin, "ABCDEFGHJK")).toMatchObject({
      status: "archived",
    });

    await deleteAccount(world.deps, { userId: world.streamer, trigger: "twitch" });

    expect(await listTraces(world.streamer)).toEqual([]);
    expect(rowsNaming(world.convex, world.streamer)).toBe(false);
    expect(world.convex.users.map(({ discoveredViaUserId }) => discoveredViaUserId)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    // « Ce pseudo n'a pas encore de fresque » : plus de ligne `users`, donc plus de canvas à servir ; l'archive « n'existe pas ».
    expect(await resolveCanvas(world.convex.durable, ownerLogin)).toBeNull();
    expect(await resolveArchive(world.convex.durable, ownerLogin, "ABCDEFGHJK")).toBeNull();
    expect(await core.getCanvas(world.active.canvasId)).toBeNull();
    expect(await core.getCanvas(world.archive.canvasId)).toBeNull();
    expect(await redis.keys(`cv:${world.active.canvasId}:*`)).toEqual([]);
    expect(world.forgotten).toEqual([{ login: ownerLogin, avatarUrl: "https://avatar/streamer" }]);
    expect(world.convex.proofs).toEqual([
      { runId: expect.any(String), deletedAt: startedAt, trigger: "twitch", ownedCanvases: 2 },
    ]);
    expect(await drawingOf(world.elsewhere)).toEqual(elsewhereBefore);
    // Son pixel chez l'autre streamer reste, sous « Compte supprimé ».
    expect(await core.inspect(world.elsewhere.canvasId, 8, 8)).toMatchObject({
      userId: DELETED_AUTHOR,
      isDeleted: true,
      colorIndex: 4,
    });
  });

  // Le viewer puis le streamer du même monde : après chacun, plus rien ne le nomme, et la suppression du second ne ressuscite pas le premier
  it("deletes the viewer, then the streamer of the same world, and nothing of either remains after each", async () => {
    const world = await buildWorld();
    const elsewhereBefore = await drawingOf(world.elsewhere);

    await deleteAccount(world.deps, { userId: world.viewer, trigger: "button" });
    expect(await listTraces(world.viewer)).toEqual([]);
    expect(rowsNaming(world.convex, world.viewer)).toBe(false);
    expect(await drawingOf(world.elsewhere)).toEqual(elsewhereBefore);

    await deleteAccount(world.deps, { userId: world.streamer, trigger: "button" });
    expect(await listTraces(world.streamer)).toEqual([]);
    expect(await listTraces(world.viewer)).toEqual([]);
    expect(rowsNaming(world.convex, world.streamer)).toBe(false);
    expect(rowsNaming(world.convex, world.viewer)).toBe(false);
    expect(await drawingOf(world.elsewhere)).toEqual(elsewhereBefore);
    expect(world.convex.proofs.map(({ trigger }) => trigger)).toEqual(["button", "button"]);
  });

  // Relancée sur un compte déjà effacé, la routine ne change rien
  it("changes nothing when it runs again on an account already deleted", async () => {
    const world = await buildWorld();
    await deleteAccount(world.deps, { userId: world.viewer, trigger: "button" });
    const settled = await world.drawings();

    expect((await deleteAccount(world.deps, { userId: world.viewer, trigger: "button" })).ok).toBe(true);

    expect(await world.drawings()).toEqual(settled);
    expect(await listTraces(world.viewer)).toEqual([]);
  });
});

describe("the session of a deleted account, and a reconnection (CDC §8)", () => {
  const cookie = (value: string) => `lp_session=${value}`;
  const issuedLongBefore = (userId: string) =>
    new SignJWT({ sub: userId, login: "viewer", displayName: "Viewer" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(startedAt / 1000) - 100)
      .setExpirationTime("30d")
      .sign(new TextEncoder().encode(SECRET));

  // Refuse la session émise avant la suppression, accepte celle d'une reconnexion, et la reconnexion repart de zéro
  it("refuses a session issued before the deletion, accepts a reconnection, and starts again from zero", async () => {
    const world = await buildWorld();
    const staleCookie = cookie(await issuedLongBefore(world.viewer));
    expect(await verifier.verify(staleCookie)).toMatchObject({ userId: world.viewer });

    await deleteAccount(world.deps, { userId: world.viewer, trigger: "button" });

    expect(await verifier.verify(staleCookie)).toBeNull();
    const reconnected = cookie(
      await signer.sign({ userId: world.viewer, login: "viewer", displayName: "Viewer" }),
    );
    expect(await verifier.verify(reconnected)).toMatchObject({ userId: world.viewer });
    // Le compte neuf : ni ban, ni jauge, ni classement d'avant ; il dessine de nouveau chez celui qui l'avait banni.
    expect(await core.isBanned(world.elsewhere.canvasId, world.viewer)).toBe(false);
    await placeAs(world.elsewhere, world.viewer, "pviewer031", 20, 20, 1, startedAt + 10 * minute);
    const ranks = await core.listScoreboardRanks(world.elsewhere.canvasId, [world.viewer]);
    expect(ranks.get(world.viewer)?.pixels).toBe(1);
    const gauge = await core.getGauge(world.elsewhere.canvasId, world.viewer, startedAt + 10 * minute);
    expect(gauge.claimable).toBe(0);
  });

  // Redis perd l'empreinte : la session de 30 jours redevient valide, jusqu'à ce que la reprise la remette depuis Convex
  it("refuses the session again once the resume puts back the fingerprint that Redis lost", async () => {
    const world = await buildWorld();
    const staleCookie = cookie(await issuedLongBefore(world.viewer));
    await deleteAccount(world.deps, { userId: world.viewer, trigger: "button" });
    expect(world.convex.marks).toHaveLength(1);
    expect(JSON.stringify(world.convex.marks)).not.toContain(world.viewer);

    await redis.del(toDeletedAccountKey(SECRET, world.viewer), DELETED_MARKS_SYNCED_KEY);
    expect(await verifier.verify(staleCookie)).toMatchObject({ userId: world.viewer });
    await resumePendingDeletions(world.deps);

    expect(await verifier.verify(staleCookie)).toBeNull();
    const reconnected = cookie(
      await signer.sign({ userId: world.viewer, login: "viewer", displayName: "Viewer" }),
    );
    expect(await verifier.verify(reconnected)).toMatchObject({ userId: world.viewer });
  });
});

describe("an interrupted deletion (CDC §8)", () => {
  // Coupée en pleines traces, elle dit `failed` ; la reconnexion du même compte la finit avant de recréer quoi que ce soit
  it("says failed when it is cut, and the reconnection of the same account finishes it", async () => {
    const world = await buildWorld();
    world.failures.purgeTraces = 1;
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const cut = await deleteAccount(world.deps, { userId: world.viewer, trigger: "button" });

    expect(cut).toEqual({ ok: false, error: "failed" });
    expect((await listTraces(world.viewer)).length).toBeGreaterThan(0); // l'identifiant reste, le temps de l'effacement
    expect(world.convex.users.some((user) => user.userId === world.viewer)).toBe(true);

    await finishPendingDeletion(world.deps, world.viewer);

    expect(await listTraces(world.viewer)).toEqual([]);
    expect(rowsNaming(world.convex, world.viewer)).toBe(false);
    expect(world.convex.proofs).toHaveLength(1);
    vi.restoreAllMocks();
  });
});

// Le suivi du live d'un compte (JOURNAL 2026-11-02) : des doubles pour Twitch, le vrai Redis pour la garde.
const trackerOf = (
  world: Awaited<ReturnType<typeof buildWorld>>,
  options: { listing?: Promise<void> } = {},
) => {
  const created: string[] = [];
  const removed = world.subscriptionsDeleted;
  const store = createTwitchLiveStore(redis, SECRET);
  const accounts = createAccountList(redis, SECRET);
  const tracker = createTwitchLiveTracker({
    source: {
      // Twitch répond après que l'effacement a eu le temps de passer.
      getLive: async () => {
        await options.listing;
        return { category: "Art" };
      },
      getCategory: async () => "Art",
    },
    eventSub: {
      subscribeToLive: async (userId) => {
        await options.listing;
        created.push(userId);
      },
      deleteSubscriptions: async (userId) => {
        removed.push(userId);
      },
    },
    accounts,
    store,
    now: () => startedAt,
  });
  const commandsOf = async (userId: string) =>
    (await redis.xrange("twitch:commands", "-", "+")).filter(([, fields]) =>
      fields.some((field) => field.includes(userId)),
    );
  return { tracker, store, accounts, created, removed, commandsOf };
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 50));

describe("the live tracking racing a deletion (CDC §8, JOURNAL 2026-11-02)", () => {
  // Un suivi parti avant l'effacement, dont Twitch répond après : il n'écrit ni état, ni action pour le gateway
  it("writes no state and no gateway action for a tracking that answers after the deletion", async () => {
    const world = await buildWorld();
    let answer = (): void => undefined;
    const listing = new Promise<void>((resolve) => {
      answer = resolve;
    });
    const { tracker, commandsOf } = trackerOf(world, { listing });

    tracker.track(world.viewer); // Twitch ne répond pas encore
    await deleteAccount(world.deps, { userId: world.viewer, trigger: "button" });
    answer();
    await flush();

    expect(await redis.exists(twitchLiveKey(world.viewer))).toBe(0);
    expect(await commandsOf(world.viewer)).toEqual([]);
    expect(await listTraces(world.viewer)).toEqual([]);
  });

  // Les abonnements créés pour lui pendant l'effacement sont retirés, car l'effacement avait déjà fini de retirer les siens
  it("removes the subscriptions created for the account while its deletion was passing", async () => {
    const world = await buildWorld();
    let answer = (): void => undefined;
    const listing = new Promise<void>((resolve) => {
      answer = resolve;
    });
    const { tracker, created, removed } = trackerOf(world, { listing });

    tracker.track(world.viewer);
    await deleteAccount(world.deps, { userId: world.viewer, trigger: "button" });
    const removedByDeletion = removed.length;
    answer();
    await flush();

    expect(created).toEqual([world.viewer]);
    expect(removed.slice(removedByDeletion)).toEqual([world.viewer]);
  });

  // La liste du démarrage date de minutes : un compte supprimé depuis n'est plus suivi, ni abonné, ni interrogé
  it("tracks no more an account of the start-up list that was deleted since", async () => {
    const world = await buildWorld();
    const { tracker, accounts, created, commandsOf } = trackerOf(world);
    const listed = await accounts.listAccountIds();
    expect(listed).toContain(world.viewer);
    await deleteAccount(world.deps, { userId: world.viewer, trigger: "button" });
    const seen: string[] = [];

    await trackKnownAccounts({
      accounts: { ...accounts, listAccountIds: async () => [world.viewer] },
      tracker: {
        track: (userId) => {
          seen.push(userId);
          tracker.track(userId);
        },
      },
      wait: async () => undefined,
    });
    await flush();

    expect(seen).toEqual([]);
    expect(created).toEqual([]);
    expect(await redis.exists(twitchLiveKey(world.viewer))).toBe(0);
    expect(await commandsOf(world.viewer)).toEqual([]);
  });

  // Un événement de Twitch en route pendant l'effacement et livré après n'écrit rien non plus
  it("writes nothing for an event Twitch delivers after the deletion", async () => {
    const world = await buildWorld();
    const { tracker, commandsOf } = trackerOf(world);
    await deleteAccount(world.deps, { userId: world.viewer, trigger: "twitch" });

    await tracker.apply({ kind: "online", broadcasterId: world.viewer });

    expect(await redis.exists(twitchLiveKey(world.viewer))).toBe(0);
    expect(await commandsOf(world.viewer)).toEqual([]);
  });

  // Se reconnecter avec le même compte Twitch crée un compte neuf, qui est suivi de nouveau
  it("tracks again an account that signs in again after its deletion", async () => {
    const world = await buildWorld();
    const { tracker, store, created, commandsOf } = trackerOf(world);
    await deleteAccount(world.deps, { userId: world.viewer, trigger: "button" });
    await signIn.setUser({
      userId: world.viewer,
      login: "viewer",
      displayName: "Viewer",
      avatarUrl: "https://avatar/viewer",
    });

    tracker.track(world.viewer);
    await flush();

    expect(created).toEqual([world.viewer]);
    expect(await store.getTwitchLiveState(world.viewer)).toEqual({
      twitchLive: { category: "Art" },
      checkedAt: startedAt,
    });
    expect((await commandsOf(world.viewer)).length).toBe(1);
  });

  // Pendant l'effacement lui-même, avant que l'identifiant soit effacé : le suivi n'écrit rien non plus
  it("writes nothing while the deletion is still in progress", async () => {
    const world = await buildWorld();
    world.failures.purgeTraces = 1;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { tracker, commandsOf } = trackerOf(world);
    await deleteAccount(world.deps, { userId: world.viewer, trigger: "button" }); // coupé, en cours

    tracker.track(world.viewer);
    await flush();

    expect(await redis.exists(twitchLiveKey(world.viewer))).toBe(0);
    expect(await commandsOf(world.viewer)).toEqual([]);
    vi.restoreAllMocks();
  });
});
