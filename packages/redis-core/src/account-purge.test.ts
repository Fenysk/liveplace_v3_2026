import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  type CanvasMeta,
  DELETED_ACCOUNT_TTL_SECONDS,
  DELETED_AUTHOR,
  defaultCanvasMeta,
  toCellKey,
} from "@liveplace/domain";
import type { Moderation, PendingDeletion } from "@liveplace/domain/ports";
import type { Event } from "@liveplace/protocol";
import type { Redis } from "ioredis";
import { describe, expect, it, vi } from "vitest";
import { createAccountPurge } from "./account-purge";
import { createArchiveWrites } from "./archive-writes";
import { createSignInWrites, createTwitchWrites } from "./client";
import { createDeletedAccounts, toDeletedAccountKey, watchDeletedAccounts } from "./deleted-accounts";
import {
  ACTIVITY_GONE_TTL_SECONDS,
  buildActivityKeys,
  buildCanvasKeys,
  DELETED_MARKS_SYNCED_KEY,
  deletedAccountKey,
  ownerLockKey,
  REWRITE_AOF_KEY,
  twitchLiveKey,
  userKey,
} from "./keys";
import { createRedisHarness } from "./test-harness";
import { createTwitchLiveStore } from "./twitch-live";

// Un monde se construit en une centaine de commandes et le balayage lit tout Redis : sous la charge des autres fichiers, 5 s ne suffisent pas.
vi.setConfig({ testTimeout: 30_000 });

const harness = createRedisHarness();
const { redis, core, runId } = harness;
const SECRET = "un-secret-de-session-de-plus-de-32-octets";
const purge = createAccountPurge(redis, SECRET);
const deletedAccounts = createDeletedAccounts(redis, SECRET);
const archiveWrites = createArchiveWrites(redis);
const signIn = createSignInWrites(redis);
const twitchWrites = createTwitchWrites(redis, harness.secret);
const twitchLives = createTwitchLiveStore(redis, SECRET);

const now = 1_700_000_000_000;
const minute = 60_000;

const metaOf = (ownerId: string): CanvasMeta => ({
  ...defaultCanvasMeta(ownerId),
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  gaugeMaxStart: 1000,
  gaugeMaxCeiling: 1000,
  refillMs: 1000,
  obsDelayMs: 5000,
});

type Canvas = Awaited<ReturnType<typeof harness.readyCanvas>>;

// La lecture d'une clé selon son type, une seule commande par clé pour que les réponses se suivent.
const queueRead = (pipeline: ReturnType<Redis["pipeline"]>, name: string, type: unknown): void => {
  switch (type) {
    case "string":
      pipeline.get(name);
      break;
    case "hash":
      pipeline.hgetall(name);
      break;
    case "set":
      pipeline.smembers(name);
      break;
    case "zset":
      pipeline.zrange(name, "0", "-1", "WITHSCORES");
      break;
    case "list":
      pipeline.lrange(name, 0, -1);
      break;
    case "stream":
      pipeline.xrange(name, "-", "+");
      break;
    default:
      pipeline.type(name);
  }
};

// Tout ce qui, dans Redis, nomme `id` : dans le nom d'une clé, ou dans sa valeur quel que soit son type. Deux allers-retours
// par page de 1000 clés : le Redis de test est partagé avec les autres fichiers.
const listTraces = async (id: string): Promise<string[]> => {
  const found: string[] = [];
  for await (const page of redis.scanStream({ match: "*", count: 1000 })) {
    const names: string[] = [];
    // Les octets de `state` sont des pixels, jamais un nom.
    for (const name of page as string[]) {
      if (name.includes(id)) found.push(name);
      else if (!name.endsWith(":state")) names.push(name);
    }
    const typing = redis.pipeline();
    for (const name of names) typing.type(name);
    const types = ((await typing.exec()) ?? []).map(([, type]) => type);
    const reading = redis.pipeline();
    names.forEach((name, index) => {
      queueRead(reading, name, types[index]);
    });
    const values = (await reading.exec()) ?? [];
    names.forEach((name, index) => {
      const text = JSON.stringify(values[index]?.[1]);
      if (text.includes(id)) found.push(`${name} → ${text.slice(0, 200)}`);
    });
  }
  return found;
};

const drawingOf = async (canvas: Canvas): Promise<Buffer> =>
  Buffer.from((await core.getSnapshot(canvas.canvasId)).state);

const placeAs = (
  canvas: Canvas,
  userId: string,
  placementId: string,
  cells: readonly [number, number, number][],
  nowMs: number,
) =>
  harness.placeInBatches(
    canvas.canvasId,
    userId,
    placementId,
    cells.map(([x, y, colorIndex]) => ({ x, y, colorIndex })),
    nowMs,
  );

const moderateAll = async (canvas: Canvas, by: string, action: Moderation["action"], nowMs: number) => {
  let slice: Moderation["slice"] = "first";
  for (;;) {
    const result = await core.moderate(canvas.canvasId, { by, nowMs, action, slice });
    if (!result.ok) throw new Error(result.error);
    if (result.value.isDone) return;
    slice = "next";
  }
};

const deleteWithoutOwnedCanvases = async (userId: string, trigger: PendingDeletion["trigger"] = "button") => {
  await purge.begin({ userId, runId: randomUUID(), trigger, startedAt: now, canvasIds: [] });
  await purge.purgeTraces(userId);
  await purge.purgeAccountKeys(userId);
  await purge.finish(userId);
};

// Un monde : un streamer (actif et archive), un autre streamer chez qui on dessine, et des viewers dont `viewer`, le compte
// qu'on supprime. Rien n'y est caché à un balayage : bannis, rôles, signalements, classement, noms, actions Twitch.
let worldCount = 0;
const buildWorld = async () => {
  worldCount += 1;
  const id = (name: string) => `${runId}-w${worldCount}-${name}`;
  const [streamer, viewer, other, third] = [id("streamer"), id("viewer"), id("other"), id("third")];
  const active = await harness.readyCanvas(metaOf(streamer));
  const archive = await harness.readyCanvas(metaOf(streamer));
  const elsewhere = await harness.readyCanvas(metaOf(other));

  // L'actif : le viewer dessine, un autre recouvre une de ses cases, puis il dessine encore.
  await placeAs(
    active,
    viewer,
    "pviewer001",
    [
      [0, 0, 5],
      [1, 0, 5],
      [2, 0, 5],
    ],
    now,
  );
  await placeAs(active, other, "pother0001", [[1, 0, 6]], now + minute);
  await placeAs(active, viewer, "pviewer002", [[0, 1, 7]], now + 2 * minute);
  await placeAs(active, other, "pother0002", [[7, 7, 3]], now + 3 * minute);
  await placeAs(active, viewer, "pviewer003", [[8, 8, 4]], now + 4 * minute);
  await placeAs(active, other, "pother0003", [[9, 9, 2]], now + 5 * minute);

  // L'archive : un dessin et un rôle de modérateur Twitch d'avant l'archivage, qui fige la fresque.
  await placeAs(archive, viewer, "pviewer011", [[5, 5, 8]], now);
  const asTwitchModerator = { userId: viewer, source: "twitch", isModerator: true } as const;
  expect((await core.setModerator(archive.canvasId, asTwitchModerator)).ok).toBe(true);
  await archiveWrites.markArchived(archive.canvasId, {
    archivedAt: now + minute,
    successorId: active.canvasId,
  });

  // Chez l'autre streamer : le viewer est banni après avoir dessiné ; ses pixels partent, un autre recouvre l'un d'eux.
  await placeAs(
    elsewhere,
    viewer,
    "pviewer021",
    [
      [3, 3, 9],
      [4, 3, 9],
    ],
    now,
  );
  await placeAs(elsewhere, third, "pthird0001", [[4, 3, 10]], now + minute);
  await moderateAll(elsewhere, other, { action: "ban", target: viewer }, now + 2 * minute);
  await moderateAll(elsewhere, other, { action: "clearUser", target: viewer }, now + 2 * minute);

  // Ses rôles ici, ses noms sans compte, son miroir et son live.
  const asModerator = { userId: viewer, source: "liveplace", isModerator: true } as const;
  expect((await core.setModerator(active.canvasId, asModerator)).ok).toBe(true);
  await twitchWrites.setTwitchUsers(active.canvasId, [
    { userId: viewer, login: "viewer", displayName: "Viewer" },
  ]);
  await signIn.setUser({ userId: viewer, login: "viewer", displayName: "Viewer" });
  await twitchLives.setTwitchLiveState(viewer, { twitchLive: { category: "Art" }, checkedAt: now });

  // Les signalements : le viewer signale une pose qui reste visible (seuil 2), une qu'il cache seul (seuil 1) ; un autre
  // signale sa pose assez pour la cacher du stream.
  const report = (
    canvas: Canvas,
    reporterId: string,
    x: number,
    y: number,
    placementId: string,
    threshold: number,
  ) => core.report(canvas.canvasId, { reporterId, x, y, placementId, threshold, nowMs: now + 6 * minute });
  expect((await report(active, viewer, 7, 7, "pother0002", 2)).ok).toBe(true);
  expect((await report(active, viewer, 9, 9, "pother0003", 1)).ok).toBe(true);
  expect((await report(active, third, 8, 8, "pviewer003", 1)).ok).toBe(true);
  expect((await report(active, third, 0, 1, "pviewer002", 2)).ok).toBe(true);

  // La provenance d'un nouveau compte (un jour inventé : les autres tests n'y touchent pas).
  const signups = `${buildActivityKeys().signups(runId)}-w${worldCount}`;
  await redis.hset(signups, { [streamer]: 4, [viewer]: 2, none: 1 });

  return { id, streamer, viewer, other, third, active, archive, elsewhere, signups };
};

type World = Awaited<ReturnType<typeof buildWorld>>;

const eventsOf = async (canvas: Canvas): Promise<Event[]> =>
  (await redis.xrange(buildCanvasKeys(canvas.canvasId).events, "-", "+")).map(([, fields]) =>
    JSON.parse(fields[fields.indexOf("e") + 1] ?? "null"),
  );

const deleteViewer = async (world: World) => {
  await deleteWithoutOwnedCanvases(world.viewer);
  await purge.rewriteAppendOnlyFile();
};

describe("deleting a viewer: traces on other canvases (CDC §8, Supprimer son compte)", () => {
  // Plus aucune clé ni valeur ne le nomme ; le dessin de chaque fresque est identique, case par case
  it("leaves no key or value that names it, and every canvas draws the same, cell by cell", async () => {
    const world = await buildWorld();
    const before = await Promise.all([world.active, world.archive, world.elsewhere].map(drawingOf));
    expect((await listTraces(world.viewer)).length).toBeGreaterThan(10);

    await deleteViewer(world);

    expect(await listTraces(world.viewer)).toEqual([]);
    expect(await Promise.all([world.active, world.archive, world.elsewhere].map(drawingOf))).toEqual(before);
  });

  // Ses pixels restent, sans auteur : la couleur, la date et la pose sont celles d'avant
  it("keeps its pixels under the deleted author, with the same color, date and placement", async () => {
    const world = await buildWorld();
    const [x, y] = [0, 0];
    const before = await core.inspect(world.active.canvasId, x, y);
    expect(before).toMatchObject({
      userId: world.viewer,
      colorIndex: 5,
      placedAt: now,
      placementId: "pviewer001",
    });

    await deleteViewer(world);

    expect(await core.inspect(world.active.canvasId, x, y)).toMatchObject({
      userId: DELETED_AUTHOR,
      colorIndex: 5,
      placedAt: now,
      placementId: "pviewer001",
    });
    const pile = await redis.lrange(buildCanvasKeys(world.active.canvasId).hist(toCellKey(1, 0)), 0, -1);
    expect(pile).toEqual([
      `${world.other}:6:${now + minute}:2:pother0001`,
      `${DELETED_AUTHOR}:5:${now}:1:pviewer001`,
    ]);
    expect(await redis.smembers(buildCanvasKeys(world.active.canvasId).cells(DELETED_AUTHOR))).toEqual(
      expect.arrayContaining([String(toCellKey(0, 0)), String(toCellKey(0, 1))]),
    );
  });

  // Il disparaît du classement, des bannis, des rôles, des noms et des signalements
  it("disappears from the scoreboard, bans, roles, names and reports", async () => {
    const world = await buildWorld();
    const keys = buildCanvasKeys(world.active.canvasId);
    expect(await redis.zscore(keys.scoreboard, world.viewer)).not.toBeNull();
    expect(await redis.sismember(buildCanvasKeys(world.elsewhere.canvasId).bans, world.viewer)).toBe(1);

    await deleteViewer(world);

    expect(await redis.zscore(keys.scoreboard, world.viewer)).toBeNull();
    expect((await core.listScoreboard(world.active.canvasId)).map(({ login }) => login)).toEqual([
      world.other,
    ]);
    expect(await core.listBans(world.elsewhere.canvasId)).toEqual([]);
    expect(await redis.smembers(keys.mods)).toEqual([]);
    expect(await redis.hlen(keys.twitchUsers)).toBe(0);
    expect(await redis.exists(userKey(world.viewer), twitchLiveKey(world.viewer))).toBe(0);
  });

  // Ses bans reçus partent : revenu, il faut le bannir de nouveau
  it("forgets the bans it received: a viewer coming back is not banned any more", async () => {
    const world = await buildWorld();
    const keys = buildCanvasKeys(world.elsewhere.canvasId);

    await deleteViewer(world);

    expect(await core.isBanned(world.elsewhere.canvasId, world.viewer)).toBe(false);
    expect(await redis.exists(keys.ban(world.viewer), keys.cleared, keys.clearedPlacements)).toBe(0);
    expect(await redis.hlen(keys.cleared)).toBe(0);
  });

  // Une pose qu'une pierre tombale couvrait ne revient pas quand on retire le pixel qui la recouvre
  it("never brings back a buried pixel it had cleared once its cover is cleared", async () => {
    const world = await buildWorld();
    const pile = buildCanvasKeys(world.elsewhere.canvasId).hist(toCellKey(4, 3));
    expect(await redis.llen(pile)).toBe(2);

    await deleteViewer(world);

    // Sa pose couverte est partie de la pile : seule celle d'un autre reste.
    expect(await redis.llen(pile)).toBe(1);
    await moderateAll(
      world.elsewhere,
      world.other,
      { action: "clearUser", target: world.third },
      now + 10 * minute,
    );
    expect(await harness.colorAt(world.elsewhere.canvasId, 4, 3, CANVAS_WIDTH)).toBe(0);
  });

  // Ni une pose retirée, ni une plage d'heures retirée, ne reviennent non plus : leurs entrées enterrées partent de la pile
  it("never brings back a buried pixel whose placement, or whose time range, a moderator had cleared", async () => {
    const world = await buildWorld();
    const { active } = world;
    const piles = [30, 31].map((x) => buildCanvasKeys(active.canvasId).hist(toCellKey(x, x)));
    await placeAs(active, world.viewer, "pburied001", [[30, 30, 5]], now + 10 * minute);
    await placeAs(active, world.viewer, "pburied002", [[31, 31, 6]], now + 11 * minute);
    await placeAs(
      active,
      world.other,
      "pcover0001",
      [
        [30, 30, 7],
        [31, 31, 7],
      ],
      now + 12 * minute,
    );
    // La pose de (30, 30), et la plage d'une minute qui couvre celle de (31, 31) : toutes deux sous la pose d'un autre.
    await moderateAll(
      active,
      world.streamer,
      {
        action: "clearPlacement",
        target: world.viewer,
        placementId: "pburied001",
        range: { from: now + 11 * minute, to: now + 11 * minute },
      },
      now + 13 * minute,
    );
    expect(await Promise.all(piles.map((pile) => redis.llen(pile)))).toEqual([2, 2]);

    await deleteViewer(world);

    expect(await Promise.all(piles.map((pile) => redis.llen(pile)))).toEqual([1, 1]);
    await moderateAll(
      active,
      world.streamer,
      { action: "clearUser", target: world.other },
      now + 14 * minute,
    );
    for (const x of [30, 31]) expect(await harness.colorAt(active.canvasId, x, x, CANVAS_WIDTH)).toBe(0);
  });

  // Une pose cachée du stream le reste, sous l'auteur supprimé, et ses signaleurs restent comptés
  it("keeps a placement hidden from the stream hidden, under the deleted author", async () => {
    const world = await buildWorld();
    const keys = buildCanvasKeys(world.active.canvasId);
    expect(await redis.smembers(keys.offStream)).toEqual(
      expect.arrayContaining([`${world.viewer}:pviewer003`, `${world.other}:pother0003`]),
    );

    await deleteViewer(world);

    expect(new Set(await redis.smembers(keys.offStream))).toEqual(
      new Set([`${DELETED_AUTHOR}:pviewer003`, `${world.other}:pother0003`]),
    );
    // Les poses signalées qu'il a reçues restent à trancher ; celle qu'il avait cachée seul reste cachée avec un signaleur anonyme.
    const reports = await core.listReports(world.active.canvasId);
    expect(
      reports.map(({ userId, placementId, reportCount, isOffStream }) => [
        userId,
        placementId,
        reportCount,
        isOffStream,
      ]),
    ).toEqual(
      expect.arrayContaining([
        [DELETED_AUTHOR, "pviewer003", 1, true],
        [DELETED_AUTHOR, "pviewer002", 1, false],
        [world.other, "pother0003", 1, true],
      ]),
    );
    // Sa pose signalée qui n'était pas cachée, et dont il était seul signaleur, n'est plus signalée.
    expect(await redis.zscore(keys.reported, `${world.other}:pother0002`)).toBeNull();
    expect(await redis.exists(keys.reports(`${world.other}:pother0002`))).toBe(0);
    expect(await redis.smembers(keys.reports(`${world.other}:pother0003`))).toEqual([DELETED_AUTHOR]);
  });

  // Le flux garde toutes ses versions : aucune pose n'est perdue, le rattrapage marche encore
  it("rewrites the event stream without losing an event: the resync still works", async () => {
    const world = await buildWorld();
    const keys = buildCanvasKeys(world.active.canvasId);
    const before = await eventsOf(world.active);
    expect(JSON.stringify(before)).toContain(world.viewer);

    await deleteViewer(world);

    const after = await eventsOf(world.active);
    expect(after.map(({ version, kind, cells }) => [version, kind, cells])).toEqual(
      before.map(({ version, kind, cells }) => [version, kind, cells]),
    );
    expect(after.filter((event) => event.authorId === DELETED_AUTHOR).length).toBeGreaterThan(0);
    expect(JSON.stringify(after)).not.toContain(world.viewer);
    expect(await core.listEvents(world.active.canvasId, 1, 1000)).toEqual(after);
    expect(await redis.exists(`${keys.events}:rewrite`)).toBe(0);
    // Une pose après la réécriture continue le flux.
    const result = await core.place(world.active.canvasId, {
      userId: world.other,
      requestId: randomUUID(),
      placementId: "pother0009",
      nowMs: now + 20 * minute,
      pixels: [{ x: 20, y: 20, colorIndex: 1 }],
    });
    expect(result.ok).toBe(true);
    expect((await eventsOf(world.active)).length).toBe(after.length + 1);
  });

  // Un flux de plus d'une tranche se recopie en entier, dans l'ordre, sous les mêmes identifiants, et accepte la pose suivante
  it("copies a stream longer than one slice whole, in order, under the same ids, and takes the next placement", async () => {
    const owner = `${runId}-long-owner`;
    const canvas = await harness.readyCanvas(metaOf(owner));
    const viewer = `${runId}-long-viewer`;
    const keys = buildCanvasKeys(canvas.canvasId);
    const entryOf = (version: number) => ({
      version,
      kind: version % 7 === 0 ? "clear" : "place",
      authorId: version % 3 === 0 ? viewer : owner,
      occurredAt: now + version,
      cells: [],
      ...(version % 7 === 0 ? { moderation: { action: "ban", target: viewer } } : {}),
    });
    const writing = redis.pipeline();
    for (let version = 1; version <= 1200; version += 1)
      writing.xadd(keys.events, `${version}-0`, "e", JSON.stringify(entryOf(version)), "p", `pl${version}`);
    await writing.exec();
    await redis.set(keys.version, 1200);

    await deleteWithoutOwnedCanvases(viewer);

    const entries = await redis.xrange(keys.events, "-", "+");
    expect(entries.map(([id]) => id)).toEqual(Array.from({ length: 1200 }, (_, index) => `${index + 1}-0`));
    for (const [index, [, fields]] of entries.entries()) {
      const version = index + 1;
      const expected = JSON.stringify(entryOf(version)).replaceAll(`"${viewer}"`, `"${DELETED_AUTHOR}"`);
      expect(fields).toEqual(["e", expected, "p", `pl${version}`]);
    }
    const next = await core.place(canvas.canvasId, {
      userId: owner,
      requestId: randomUUID(),
      placementId: "pnext00001",
      nowMs: now,
      pixels: [{ x: 1, y: 1, colorIndex: 1 }],
    });
    expect(next.ok && next.value.version).toBe(1201);
    expect(await redis.exists(`${keys.events}:rewrite`)).toBe(0);
  });

  // L'origine d'un nouveau compte venu de sa page ne le nomme plus : ses comptes passent à « sans origine »
  it("moves the sign-ups it brought to « no origin » when it is the streamer of origin", async () => {
    const world = await buildWorld();

    await deleteWithoutOwnedCanvases(world.streamer);

    expect(await redis.hgetall(world.signups)).toEqual({ [world.viewer]: "2", none: "5" });
  });
});

describe("deleting a streamer: its canvases (CDC §8, Supprimer son compte)", () => {
  // La fresque active et l'archive disparaissent avec leurs clés, leurs statistiques et leur verrou ; les pages l'apprennent
  it("deletes the active canvas and the archive with their keys, statistics and lock, and tells the open pages", async () => {
    const world = await buildWorld();
    const day = buildActivityKeys().canvas(world.active.canvasId);
    await redis.hset(day.days, { people: 3 });
    await redis.pfadd(day.activePlayers("2026-11-01"), world.viewer);
    await redis.hset(buildActivityKeys().seen, {
      [world.active.canvasId]: now,
      [world.archive.canvasId]: now,
    });
    await redis.set(ownerLockKey(world.streamer), "holder");
    const statuses: string[] = [];
    const unsubscribe = await core.subscribe(world.active.canvasId, (message) => {
      if ("ctl" in message && message.ctl.t === "canvasStatus") statuses.push(message.ctl.status);
    });
    const elsewhereBefore = await drawingOf(world.elsewhere);

    const canvasIds = [world.active.canvasId, world.archive.canvasId];
    await purge.begin({
      userId: world.streamer,
      runId: randomUUID(),
      trigger: "button",
      startedAt: now,
      canvasIds,
    });
    await purge.purgeOwnedCanvases(world.streamer, canvasIds);
    await purge.purgeTraces(world.streamer);
    await purge.purgeAccountKeys(world.streamer);
    await purge.finish(world.streamer);
    await delay(50);
    await unsubscribe();

    expect(statuses).toEqual(["discarded"]);
    for (const canvas of [world.active, world.archive]) {
      expect(await core.getCanvas(canvas.canvasId)).toBeNull();
      expect(await archiveWrites.getCanvas(canvas.canvasId)).toBeNull();
      expect(await redis.keys(`cv:${canvas.canvasId}:*`)).toEqual([]);
      expect(await redis.keys(`${buildActivityKeys().canvasPrefix}${canvas.canvasId}:*`)).toEqual([]);
    }
    expect(await redis.hexists(buildActivityKeys().seen, world.active.canvasId)).toBe(0);
    // Le suivi d'activité ne les recrée pas : ils sont inscrits parmi les fresques disparues, deux jours (JOURNAL 2026-11-02).
    const { gone } = buildActivityKeys();
    expect(await redis.smismember(gone, ...canvasIds)).toEqual([1, 1]);
    expect(await redis.ttl(gone)).toBeGreaterThan(ACTIVITY_GONE_TTL_SECONDS - 60);
    expect(await redis.exists(ownerLockKey(world.streamer))).toBe(0);
    expect(await listTraces(world.streamer)).toEqual([]);
    // Les autres fresques gardent leur dessin.
    expect(await drawingOf(world.elsewhere)).toEqual(elsewhereBefore);
  });

  // Aucun compte ne reste nommé par les pages qu'il possédait : le viewer qui y avait dessiné n'y laisse rien ailleurs
  it("leaves nothing of the streamer's canvases to name the viewers who drew on them", async () => {
    const world = await buildWorld();
    const canvasIds = [world.active.canvasId, world.archive.canvasId];
    await purge.begin({
      userId: world.streamer,
      runId: randomUUID(),
      trigger: "button",
      startedAt: now,
      canvasIds,
    });
    await purge.purgeOwnedCanvases(world.streamer, canvasIds);
    await purge.purgeTraces(world.streamer);
    await purge.purgeAccountKeys(world.streamer);
    await purge.finish(world.streamer);

    const owned = (await listTraces(world.viewer)).filter(
      (trace) => trace.includes(world.active.canvasId) || trace.includes(world.archive.canvasId),
    );
    expect(owned).toEqual([]);
  });
});

describe("the record of a deletion in progress (CDC §8)", () => {
  // Marque l'effacement, garde l'empreinte de la session, annonce le compte aux gateways ; finir efface l'identifiant
  it("marks the deletion, keeps a session fingerprint, tells the gateways, and drops the identifier at the end", async () => {
    const userId = `${runId}-solo`;
    const heard: string[] = [];
    const subscriber = redis.duplicate();
    // Le canal est celui de tout le Redis de test : les suppressions des autres fichiers y passent aussi, pas les siennes.
    const unwatch = await watchDeletedAccounts(subscriber, (deleted) => {
      if (deleted === userId) heard.push(deleted);
    });
    const deletion: PendingDeletion = {
      userId,
      runId: randomUUID(),
      trigger: "twitch",
      startedAt: now,
      canvasIds: ["c1"],
    };

    await purge.begin(deletion);
    await delay(50);

    expect(await purge.getPending(userId)).toEqual(deletion);
    expect(await purge.listPending()).toEqual(expect.arrayContaining([deletion]));
    expect(heard).toEqual([userId]);
    const key = toDeletedAccountKey(SECRET, userId);
    expect(key).not.toContain(userId);
    expect(await redis.get(key)).toBe(String(now));
    expect(await redis.ttl(key)).toBeGreaterThan(DELETED_ACCOUNT_TTL_SECONDS - 60);

    await purge.finish(userId);
    await delay(50);
    await unwatch();
    subscriber.disconnect();

    expect(await purge.getPending(userId)).toBeNull();
    expect(await listTraces(userId)).toEqual([]);
    expect(heard).toEqual([userId, userId]);
  });

  // Une deuxième marque ne change ni le `runId` ni l'heure : la reprise garde l'effacement d'origine
  it("keeps the original run and time when it is marked again", async () => {
    const userId = `${runId}-twice`;
    const first: PendingDeletion = {
      userId,
      runId: randomUUID(),
      trigger: "button",
      startedAt: now,
      canvasIds: [],
    };

    await purge.begin(first);
    await purge.begin({ ...first, runId: randomUUID(), startedAt: now + 99 * minute });

    expect(await purge.getPending(userId)).toEqual(first);
    expect(await redis.get(toDeletedAccountKey(SECRET, userId))).toBe(String(now));
    await purge.finish(userId);
  });

  // Une session émise avant la suppression est refusée ; celle d'une reconnexion, après, passe
  it("refuses a session issued before the deletion, and accepts the one of a reconnection", async () => {
    const userId = `${runId}-session`;
    const deletedAtSeconds = Math.floor(now / 1000);
    expect(await deletedAccounts.isSessionRevoked(userId, deletedAtSeconds - 100)).toBe(false);

    await purge.begin({ userId, runId: randomUUID(), trigger: "button", startedAt: now, canvasIds: [] });

    expect(await deletedAccounts.isSessionRevoked(userId, deletedAtSeconds - 1)).toBe(true);
    expect(await deletedAccounts.isSessionRevoked(userId, deletedAtSeconds)).toBe(false);
    expect(await deletedAccounts.isSessionRevoked(userId, deletedAtSeconds + 3600)).toBe(false);
    expect(await deletedAccounts.isSessionRevoked(`${userId}-autre`, deletedAtSeconds - 1)).toBe(false);
    await purge.finish(userId);
  });

  // L'AOF se réécrit après la suppression, sans erreur si une réécriture tourne déjà ; le marqueur reste tant qu'elle n'est pas partie
  it("rewrites the append-only file after a deletion, and tolerates a rewrite already running", async () => {
    const userId = `${runId}-aof`;
    await purge.begin({ userId, runId: randomUUID(), trigger: "button", startedAt: now, canvasIds: [] });
    await purge.finish(userId);
    expect(await redis.exists(REWRITE_AOF_KEY)).toBe(1);

    // Une réécriture déjà en cours a commencé avant nos dernières écritures : sans erreur, mais le marqueur reste.
    const busy = new Proxy(redis, {
      get(target, property) {
        const value = Reflect.get(target, property);
        if (property === "bgrewriteaof")
          return () =>
            Promise.reject(new Error("ERR Background append only file rewriting already in progress"));
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    expect(await createAccountPurge(busy, SECRET).rewriteAppendOnlyFile()).toBe(false);
    expect(await redis.exists(REWRITE_AOF_KEY)).toBe(1);

    expect(await purge.rewriteAppendOnlyFile()).toBe(true);
    expect(await redis.exists(REWRITE_AOF_KEY)).toBe(0);
    expect(await purge.rewriteAppendOnlyFile()).toBe(true); // plus rien à réécrire
    await delay(300); // la réécriture lancée se termine avant la fermeture du Redis du test
  });

  // Un identifiant qui n'est pas celui d'un compte n'entre jamais dans un motif ni dans un script
  it("refuses an identifier that is not an account", async () => {
    await expect(purge.purgeTraces("*")).rejects.toThrow("identifiant de compte invalide");
    await expect(purge.purgeTraces(DELETED_AUTHOR)).rejects.toThrow("identifiant de compte invalide");
    await expect(
      purge.begin({ userId: "a:b", runId: "r", trigger: "button", startedAt: now, canvasIds: [] }),
    ).rejects.toThrow("identifiant de compte invalide");
  });
});

// Une connexion à Redis qui lâche au n-ième script, comme un process qui s'arrête en plein effacement.
const interruptedAt = (failAt: number): Redis => {
  let calls = 0;
  return new Proxy(redis, {
    get(target, property) {
      const value = Reflect.get(target, property);
      if (typeof value !== "function") return value;
      if (property !== "eval") return value.bind(target);
      return (...args: unknown[]) => {
        calls += 1;
        if (calls === failAt) return Promise.reject(new Error("coupure"));
        return value.apply(target, args);
      };
    },
  });
};

describe("an interrupted deletion resumes by itself and can be run again (CDC §8)", () => {
  // Coupée à n'importe quel script, elle reprend et finit : plus rien ne nomme le compte, le dessin est celui d'avant
  it.each([1, 2, 3, 4, 6])("resumes and finishes after a cut at script %i", async (failAt) => {
    const world = await buildWorld();
    const before = await Promise.all([world.active, world.archive, world.elsewhere].map(drawingOf));
    const deletion: PendingDeletion = {
      userId: world.viewer,
      runId: randomUUID(),
      trigger: "button",
      startedAt: now,
      canvasIds: [],
    };
    await purge.begin(deletion);

    await expect(createAccountPurge(interruptedAt(failAt), SECRET).purgeTraces(world.viewer)).rejects.toThrow(
      "coupure",
    );
    expect(await purge.getPending(world.viewer)).toEqual(deletion);

    for (const pending of await purge.listPending()) {
      if (pending.userId !== world.viewer) continue;
      await purge.purgeTraces(pending.userId);
      await purge.purgeAccountKeys(pending.userId);
      await purge.finish(pending.userId);
    }

    expect(await listTraces(world.viewer)).toEqual([]);
    expect(await Promise.all([world.active, world.archive, world.elsewhere].map(drawingOf))).toEqual(before);
    expect((await core.listEvents(world.active.canvasId, 1, 1000))?.length).toBeGreaterThan(0);
  });

  // Relancée sur un compte déjà effacé, elle ne change rien
  it("changes nothing when it is run again on an account already deleted", async () => {
    const world = await buildWorld();
    await deleteViewer(world);
    const snapshot = async () =>
      JSON.stringify(
        await Promise.all(
          [world.active, world.archive, world.elsewhere].flatMap(async (canvas) => [
            await redis.hgetall(buildCanvasKeys(canvas.canvasId).meta),
            await core.listEvents(canvas.canvasId, 1, 1000),
            await redis.smembers(buildCanvasKeys(canvas.canvasId).offStream),
          ]),
        ),
      );
    const settled = await snapshot();

    expect(await purge.purgeTraces(world.viewer)).toBe(0);
    await purge.purgeAccountKeys(world.viewer);

    expect(await snapshot()).toBe(settled);
    expect(await listTraces(world.viewer)).toEqual([]);
  });
});

describe("the author left by a deleted account (CDC §8, Inspection et Modération)", () => {
  // L'inspection dit un compte supprimé : ni pseudo, ni nom, ni photo, mais la couleur, la date et la pose d'avant
  it("is inspected as a deleted account, with no name, and the color, date and placement from before", async () => {
    const world = await buildWorld();
    await deleteViewer(world);

    expect(await core.inspect(world.active.canvasId, 0, 0)).toEqual({
      userId: DELETED_AUTHOR,
      login: "",
      displayName: "",
      isDeleted: true,
      colorIndex: 5,
      placedAt: now,
      placementId: "pviewer001",
    });
  });

  // Les signalements qu'il a reçus portent la même marque, et aucun nom
  it("carries the same mark in the reports it received, and no name", async () => {
    const world = await buildWorld();
    await deleteViewer(world);

    const reports = await core.listReports(world.active.canvasId);

    expect(reports.find(({ placementId }) => placementId === "pviewer003")).toMatchObject({
      userId: DELETED_AUTHOR,
      login: "",
      displayName: "",
      hasAccount: false,
      isDeleted: true,
    });
    expect(reports.find(({ userId }) => userId === world.other)).not.toHaveProperty("isDeleted");
  });

  // Le streamer retire la pose inspectée, sans plage : les cases de cette pose seulement se vident
  it("lets the owner clear the inspected placement, and only its cells", async () => {
    const world = await buildWorld();
    await deleteViewer(world);

    await moderateAll(
      world.active,
      world.streamer,
      { action: "clearPlacement", target: DELETED_AUTHOR, placementId: "pviewer001" },
      now + 30 * minute,
    );

    for (const x of [0, 2]) expect(await harness.colorAt(world.active.canvasId, x, 0, CANVAS_WIDTH)).toBe(0);
    expect(await harness.colorAt(world.active.canvasId, 0, 1, CANVAS_WIDTH)).toBe(7); // une autre pose, la sienne aussi
    expect(await harness.colorAt(world.active.canvasId, 1, 0, CANVAS_WIDTH)).toBe(6);
  });

  // Ni ban, ni déban, ni retrait en bloc, ni plage : le script refuse, même au streamer
  it("refuses a ban, an unban, a clear of all its pixels and a time range, even to the owner", async () => {
    const world = await buildWorld();
    await deleteViewer(world);
    const refused = async (action: Moderation["action"]) =>
      core.moderate(world.active.canvasId, {
        by: world.streamer,
        nowMs: now + 30 * minute,
        action,
        slice: "first",
      });

    for (const action of [
      { action: "ban", target: DELETED_AUTHOR },
      { action: "unban", target: DELETED_AUTHOR },
      { action: "clearUser", target: DELETED_AUTHOR },
      {
        action: "clearPlacement",
        target: DELETED_AUTHOR,
        placementId: "pviewer001",
        range: { from: now, to: now + 10 * minute },
      },
    ] as const)
      expect(await refused(action)).toEqual({ ok: false, error: "forbidden" });
    expect(await core.isBanned(world.active.canvasId, DELETED_AUTHOR)).toBe(false);
  });

  // Rétablir une pose cachée de ce compte reste possible : elle revient sur le stream
  it("lets a moderator restore a hidden placement of a deleted account", async () => {
    const world = await buildWorld();
    await deleteViewer(world);
    const keys = buildCanvasKeys(world.active.canvasId);
    expect(await redis.sismember(keys.offStream, `${DELETED_AUTHOR}:pviewer003`)).toBe(1);

    await moderateAll(
      world.active,
      world.streamer,
      { action: "approvePlacement", target: DELETED_AUTHOR, placementId: "pviewer003" },
      now + 30 * minute,
    );

    expect(await redis.sismember(keys.offStream, `${DELETED_AUTHOR}:pviewer003`)).toBe(0);
    expect(await redis.sismember(keys.approved, `${DELETED_AUTHOR}:pviewer003`)).toBe(1);
  });

  // Signaler sa pose se fait seule, sans plage
  it("can be reported alone, never with a time range", async () => {
    const world = await buildWorld();
    await deleteViewer(world);
    const report = (placementId: string, range?: { from: number; to: number }) =>
      core.report(world.active.canvasId, {
        reporterId: world.third,
        x: 0,
        y: 0,
        placementId,
        ...(range ? { range } : {}),
        threshold: 2,
        nowMs: now + 30 * minute,
      });

    expect(await report("pviewer001", { from: now, to: now + 10 * minute })).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect((await report("pviewer001")).ok).toBe(true);
  });
});

describe("the session fingerprints kept in Convex and put back (CDC §8, JOURNAL 2026-11-02)", () => {
  // L'empreinte d'un compte est la même que celle de sa clé, et ne dit rien de l'identifiant
  it("hands out the fingerprint that names the key, without the identifier in it", () => {
    const userId = `${runId}-fingerprint`;

    const fingerprint = purge.getFingerprint(userId);

    expect(deletedAccountKey(fingerprint)).toBe(toDeletedAccountKey(SECRET, userId));
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprint).not.toContain(userId);
  });

  // Une perte de Redis : la sentinelle manque, les empreintes reviennent avec le temps qui leur reste, la sentinelle est reposée
  it("puts the fingerprints back with the time they have left, and marks them as put back", async () => {
    const ids = { recent: `${runId}-recent`, old: `${runId}-old`, expired: `${runId}-expired` };
    const keys = {
      recent: toDeletedAccountKey(SECRET, ids.recent),
      old: toDeletedAccountKey(SECRET, ids.old),
      expired: toDeletedAccountKey(SECRET, ids.expired),
    };
    await redis.del(DELETED_MARKS_SYNCED_KEY, keys.recent, keys.old, keys.expired);
    expect(await purge.areMarksRestored()).toBe(false);
    const day = 24 * 3600 * 1000;

    await purge.restoreMarks(
      [
        { fingerprint: purge.getFingerprint(ids.recent), deletedAt: now - 1000 },
        { fingerprint: purge.getFingerprint(ids.old), deletedAt: now - 30 * day },
        { fingerprint: purge.getFingerprint(ids.expired), deletedAt: now - 32 * day },
      ],
      now,
    );

    expect(await purge.areMarksRestored()).toBe(true);
    expect(await redis.get(keys.recent)).toBe(String(now - 1000));
    expect(await redis.ttl(keys.recent)).toBeGreaterThan(DELETED_ACCOUNT_TTL_SECONDS - 60);
    expect(await redis.ttl(keys.old)).toBeLessThanOrEqual(day / 1000);
    expect(await redis.ttl(keys.old)).toBeGreaterThan(day / 1000 - 60);
    expect(await redis.exists(keys.expired)).toBe(0);
    await redis.del(keys.recent, keys.old);
  });

  // Une empreinte posée depuis la perte garde son heure : la remettre ne la réécrit pas
  it("keeps the time of a fingerprint already there", async () => {
    const userId = `${runId}-kept`;
    const key = toDeletedAccountKey(SECRET, userId);
    await redis.set(key, String(now), "EX", 600);

    await purge.restoreMarks([{ fingerprint: purge.getFingerprint(userId), deletedAt: now - 5000 }], now);

    expect(await redis.get(key)).toBe(String(now));
    expect(await redis.ttl(key)).toBeLessThanOrEqual(600);
    await redis.del(key);
  });
});
