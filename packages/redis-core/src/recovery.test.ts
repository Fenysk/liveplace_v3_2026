import { setTimeout as delay } from "node:timers/promises";
import { type CanvasMeta, defaultCanvasMeta, toCellKey } from "@liveplace/domain";
import type { Moderation, RestoredUser } from "@liveplace/domain/ports";
import { type CanvasSnapshot, RECOVERY_VERSION_JUMP } from "@liveplace/domain/snapshot";
import { afterAll, describe, expect, it } from "vitest";
import { createArchiveWrites } from "./archive-writes";
import { createTwitchWrites } from "./client";
import { buildCanvasKeys, userKey } from "./keys";
import { createRecoveryMarks, createRecoveryTarget } from "./recovery";
import { createSnapshotSource } from "./snapshot";
import { createRedisHarness } from "./test-harness";

const harness = createRedisHarness();
const { redis, core, runId } = harness;
const watchSubscriber = redis.duplicate();
const source = createSnapshotSource(redis, watchSubscriber);
const target = createRecoveryTarget(redis);
const marks = createRecoveryMarks(redis);
const twitchWrites = createTwitchWrites(redis);
const archiveWrites = createArchiveWrites(redis);

afterAll(() => {
  watchSubscriber.disconnect();
});

const OWNER = "owner-1";
// Des identifiants à ce fichier : le nettoyage du harnais efface `user:<runId>-*`, les miroirs rendus par la récupération aussi.
const A = `${runId}-author-a`;
const B = `${runId}-author-b`;
const TROLL = `${runId}-troll`;
const now = 1_700_000_000_000;
const later = now + 60_000;
const takenAt = later + 1000;
const meta: CanvasMeta = { ...defaultCanvasMeta(OWNER), gaugeMaxStart: 1000, gaugeMaxCeiling: 1000 };

const readyCanvas = () => harness.readyCanvas(meta);
const placeAs = (
  canvasId: string,
  userId: string,
  placementId: string,
  pixels: { x: number; y: number }[],
  at = now,
) =>
  harness.placeInBatches(
    canvasId,
    userId,
    placementId,
    pixels.map((pixel) => ({ ...pixel, colorIndex: 3 })),
    at,
  );

const moderateAll = async (canvasId: string, action: Moderation["action"]) => {
  let last = await core.moderate(canvasId, { by: OWNER, nowMs: later, action, slice: "first" });
  while (last.ok && !last.value.isDone)
    last = await core.moderate(canvasId, { by: OWNER, nowMs: later, action, slice: "next" });
  if (!last.ok) throw new Error(last.error);
};

// La perte totale : tout ce qui est à ce canvas, et les miroirs des personnes que Redis garde à part.
const lose = async (canvasId: string, userIds: readonly string[] = []) => {
  const found: string[] = [];
  for await (const names of redis.scanStream({ match: `cv:${canvasId}:*`, count: 1000 }))
    found.push(...names);
  if (found.length > 0) await redis.unlink(...found);
  if (userIds.length > 0) await redis.unlink(...userIds.map(userKey));
};

const snapshotOf = async (canvasId: string, players: string[] = []): Promise<CanvasSnapshot> => {
  const snapshot = await source.getCanvasSnapshot(canvasId, players, takenAt);
  if (!snapshot) throw new Error(`pas de snapshot pour ${canvasId}`);
  return snapshot;
};

const users: RestoredUser[] = [
  { userId: A, login: "authora", displayName: "Author A", avatarUrl: "https://img/a.png" },
  { userId: B, login: "authorb", displayName: "Author B" },
  { userId: TROLL, login: TROLL, displayName: "Troll" },
];

// Un canvas où il s'est passé de tout : poses recouvertes, un ban et son retrait, des modérateurs, un signalement, un thème.
const populate = async () => {
  const { canvasId, keys } = await readyCanvas();
  await placeAs(canvasId, A, "pbelow0001", [
    { x: 3, y: 2 },
    { x: 4, y: 2 },
  ]);
  await placeAs(
    canvasId,
    B,
    "pabove0001",
    [
      { x: 3, y: 2 },
      { x: 9, y: 9 },
    ],
    later,
  );
  await placeAs(canvasId, TROLL, "ptroll0001", [
    { x: 20, y: 20 },
    { x: 21, y: 20 },
  ]);
  await placeAs(canvasId, TROLL, "ptroll0002", [{ x: 22, y: 20 }]);
  await moderateAll(canvasId, { action: "ban", target: TROLL });
  await moderateAll(canvasId, { action: "clearUser", target: TROLL });
  await core.setModerator(canvasId, { userId: B, source: "liveplace", isModerator: true });
  await core.setModerator(canvasId, { userId: "mod-twitch", source: "twitch", isModerator: true });
  await twitchWrites.setTwitchUsers(canvasId, [
    { userId: "mod-twitch", login: "modtwitch", displayName: "ModTwitch" },
  ]);
  await core.report(canvasId, {
    reporterId: B,
    x: 4,
    y: 2,
    placementId: "pbelow0001",
    threshold: 1,
    nowMs: later,
  });
  await core.claimGauge(canvasId, { userId: A, requestId: crypto.randomUUID(), nowMs: now });
  await core.setObsBackground(canvasId, "black");
  await archiveWrites.setTheme(canvasId, "Ocean");
  return { canvasId, keys };
};

describe("restore: a lost canvas comes back as it was saved (Écart §7.2, JOURNAL 2026-10-08)", () => {
  // Tout ce que la sauvegarde porte revient champ par champ : le dessin, la modération, le classement, les progressions, `meta`
  it("brings back everything the snapshot holds, field by field", async () => {
    const { canvasId } = await populate();
    const saved = await snapshotOf(canvasId);
    const stateBefore = new Uint8Array((await redis.getBuffer(buildCanvasKeys(canvasId).state)) ?? []);
    await lose(canvasId);
    expect(await target.listLostCanvases([canvasId])).toEqual([canvasId]);

    expect(await target.beginRestore(canvasId)).toBe("begun");
    const version = saved.version + RECOVERY_VERSION_JUMP;
    expect(await target.restore(canvasId, { snapshot: saved, users, version, at: takenAt })).toBe("restored");

    const back = await snapshotOf(canvasId);
    const { recoveredAt, recoveredAtVersion, recoveredSnapshotVersion, ...metaBack } = back.meta;
    expect(recoveredAt).toBe(String(takenAt));
    expect(recoveredAtVersion).toBe(String(version));
    expect(recoveredSnapshotVersion).toBe(String(saved.version)); // la version de la sauvegarde, que le saut ne dit pas toujours
    expect({ ...back, meta: metaBack }).toEqual({ ...saved, version });
    expect(new Uint8Array((await redis.getBuffer(buildCanvasKeys(canvasId).state)) ?? [])).toEqual(
      stateBefore,
    );
    expect(back.meta).not.toHaveProperty("ready", "0");
  });

  // Le canvas revient prêt, avec la version qui saute : toute page qui revient prend un snapshot entier
  it("makes the canvas ready again at a version a million above its save", async () => {
    const { canvasId, keys } = await populate();
    const saved = await snapshotOf(canvasId);
    await lose(canvasId);
    await target.beginRestore(canvasId);
    expect(await core.getCanvas(canvasId)).toBeNull();

    const version = saved.version + RECOVERY_VERSION_JUMP;
    await target.restore(canvasId, { snapshot: saved, users, version, at: takenAt });

    expect(Number(await redis.get(keys.version))).toBe(saved.version + 1_000_000);
    expect(await core.getCanvas(canvasId)).toMatchObject({
      ownerId: OWNER,
      obsBackground: "black",
      theme: "Ocean",
    });
    expect((await core.getSnapshot(canvasId)).version).toBe(version);
  });

  // L'inspection d'un pixel visible donne son auteur par son pseudo, pas par son identifiant
  it("names the author of a visible pixel by his nickname after the recovery", async () => {
    const { canvasId } = await populate();
    const saved = await snapshotOf(canvasId);
    await lose(canvasId, [A, B]);
    await target.beginRestore(canvasId);

    await target.restore(canvasId, {
      snapshot: saved,
      users,
      version: saved.version + RECOVERY_VERSION_JUMP,
      at: takenAt,
    });

    expect(await core.inspect(canvasId, 4, 2)).toMatchObject({ login: "authora", displayName: "Author A" });
    expect(await core.inspect(canvasId, 3, 2)).toMatchObject({ login: "authorb", displayName: "Author B" });
  });

  // « Retirer tous ses pixels » retire bien ceux d'un auteur restauré, et rien de plus
  it("lets the moderators remove every pixel of a restored author, and only his", async () => {
    const { canvasId } = await populate();
    const saved = await snapshotOf(canvasId);
    await lose(canvasId);
    await target.beginRestore(canvasId);
    await target.restore(canvasId, {
      snapshot: saved,
      users,
      version: saved.version + RECOVERY_VERSION_JUMP,
      at: takenAt,
    });
    const colorAt = (x: number, y: number) => harness.colorAt(canvasId, x, y, meta.width);
    expect([await colorAt(4, 2), await colorAt(3, 2), await colorAt(9, 9)]).toEqual([3, 3, 3]);

    await moderateAll(canvasId, { action: "clearUser", target: B });

    expect([await colorAt(4, 2), await colorAt(3, 2), await colorAt(9, 9)]).toEqual([3, 0, 0]);
  });

  // Un ban d'avant la perte n'est jamais oublié : le banni ne pose rien, et sa preuve revient
  it("keeps a ban from before the loss: the banned user places nothing", async () => {
    const { canvasId } = await populate();
    const saved = await snapshotOf(canvasId);
    await lose(canvasId);
    await target.beginRestore(canvasId);
    await target.restore(canvasId, {
      snapshot: saved,
      users,
      version: saved.version + RECOVERY_VERSION_JUMP,
      at: takenAt,
    });

    expect(await core.isBanned(canvasId, TROLL)).toBe(true);
    const refused = await core.place(canvasId, {
      userId: TROLL,
      requestId: crypto.randomUUID(),
      placementId: "pagain0001",
      nowMs: later,
      pixels: [{ x: 30, y: 30, colorIndex: 4 }],
    });
    expect(refused).toMatchObject({ ok: true, value: { accepted: 0 } });
    expect(await core.listBans(canvasId)).toEqual([expect.objectContaining({ userId: TROLL })]);
  });

  // La récupération commence par `ready` à 0 : on ne sert pas le canvas, et le gateway le dit « en récupération »
  it("is in recovery while ready is 0: not served, and told apart from a missing canvas", async () => {
    const { canvasId } = await populate();
    const saved = await snapshotOf(canvasId);
    await lose(canvasId);
    expect(await core.isRecovering(canvasId)).toBe(false);

    await target.beginRestore(canvasId);
    expect(await core.isRecovering(canvasId)).toBe(true);
    expect(await core.getCanvas(canvasId)).toBeNull();

    await target.restore(canvasId, {
      snapshot: saved,
      users,
      version: saved.version + RECOVERY_VERSION_JUMP,
      at: takenAt,
    });
    expect(await core.isRecovering(canvasId)).toBe(false);
  });

  // Le canvas neuf d'un archivage (sans `ready`, avec `version`) n'est ni perdu ni en récupération
  it("takes the new canvas of an archive, without ready but with a version, for neither lost nor recovering", async () => {
    const canvasId = `${runId}-preparing`;
    await archiveWrites.prepareCanvas(canvasId, meta);

    expect(await target.listLostCanvases([canvasId])).toEqual([]);
    expect(await core.isRecovering(canvasId)).toBe(false);
    expect(await target.beginRestore(canvasId)).toBe("already_live");
    expect(await core.isRecovering(canvasId)).toBe(false);
  });

  // Un canvas recréé vide pendant la marque (`version` à 0, `ready` toujours à 0) reste perdu : la récupération le remplace
  it("still recovers a canvas created empty while it was marked: ready never left 0", async () => {
    const { canvasId } = await populate();
    const saved = await snapshotOf(canvasId);
    await lose(canvasId);
    await marks.markRecovering(canvasId);
    await core.createCanvas(canvasId, meta);
    expect(await target.listLostCanvases([canvasId])).toEqual([canvasId]);

    expect(await target.beginRestore(canvasId)).toBe("begun");
    await target.restore(canvasId, {
      snapshot: saved,
      users,
      version: saved.version + RECOVERY_VERSION_JUMP,
      at: takenAt,
    });

    const back = await snapshotOf(canvasId);
    expect(back.cells).toEqual(saved.cells);
    expect(back.bans).toEqual(saved.bans);
  });

  // Un canvas qui vit déjà n'est jamais écrasé, ni par le début ni par la fin d'une récupération
  it("never overwrites a canvas that is already live", async () => {
    const { canvasId, keys } = await populate();
    const saved = await snapshotOf(canvasId);
    const versionBefore = await redis.get(keys.version);

    expect(await target.beginRestore(canvasId)).toBe("already_live");
    const answer = await target.restore(canvasId, {
      snapshot: { ...saved, bans: [] },
      users,
      version: 5,
      at: takenAt,
    });

    expect(answer).toBe("already_live");
    expect(await redis.get(keys.version)).toBe(versionBefore);
    expect(await core.isBanned(canvasId, TROLL)).toBe(true);
    expect(await redis.hget(keys.meta, "ready")).toBe("1");
  });

  // Un canvas que Convex a oublié n'est plus en récupération : sa marque part
  it("clears the recovery mark of a canvas Convex no longer knows", async () => {
    const { canvasId, keys } = await readyCanvas();
    await lose(canvasId);
    await target.beginRestore(canvasId);

    await target.cancelRestore(canvasId);

    expect(await core.isRecovering(canvasId)).toBe(false);
    expect(await redis.hexists(keys.meta, "ready")).toBe(0);
  });

  // Ce qui est arrivé pendant la perte reste : le nom Twitch noté par le web, et une synchro Twitch plus récente que la sauvegarde
  it("keeps what was written since the loss: Twitch names and a newer Twitch sync", async () => {
    const { canvasId, keys } = await populate();
    await twitchWrites.setTwitchSync(canvasId, { status: "ok", syncedAt: now });
    const saved = await snapshotOf(canvasId);
    await lose(canvasId);
    await twitchWrites.setTwitchUsers(canvasId, [
      { userId: "new-ban", login: "newban", displayName: "NewBan" },
    ]);
    await twitchWrites.setTwitchSync(canvasId, { status: "revoked", syncedAt: later });
    await target.beginRestore(canvasId);

    await target.restore(canvasId, {
      snapshot: saved,
      users,
      version: saved.version + RECOVERY_VERSION_JUMP,
      at: takenAt,
    });

    expect(Object.keys(await redis.hgetall(keys.twitchUsers)).sort()).toEqual(["mod-twitch", "new-ban"]);
    expect(await redis.hget(keys.meta, "twitchSync")).toBe("revoked");
  });

  // Une sauvegarde d'avant le classement revient sans classement, jamais en erreur
  it("restores a snapshot saved before the scoreboard without a scoreboard", async () => {
    const { canvasId, keys } = await populate();
    const { scoreboard: _scoreboard, scoreboardBanned: _banned, ...older } = await snapshotOf(canvasId);
    await lose(canvasId);
    await target.beginRestore(canvasId);

    await target.restore(canvasId, {
      snapshot: older,
      users,
      version: older.version + RECOVERY_VERSION_JUMP,
      at: takenAt,
    });

    expect(await redis.zcard(keys.scoreboard)).toBe(0);
    expect(await core.getCanvas(canvasId)).not.toBeNull();
  });

  // Les pages restées connectées prennent un snapshot entier : un `ctl` resize leur est publié à la fin
  it("tells the pages still connected to take a whole snapshot, with a resize control at the end", async () => {
    const { canvasId, keys } = await populate();
    const saved = await snapshotOf(canvasId);
    await lose(canvasId);
    await target.beginRestore(canvasId);
    const listener = redis.duplicate();
    const messages: string[] = [];
    listener.on("message", (_channel, message) => messages.push(message));
    await listener.subscribe(keys.live);

    await target.restore(canvasId, {
      snapshot: saved,
      users,
      version: saved.version + RECOVERY_VERSION_JUMP,
      at: takenAt,
    });
    await delay(100);
    listener.disconnect();

    expect(messages).toEqual(['{"ctl":{"t":"resize"}}']);
  });

  // Une grande salve d'auteurs et de cases revient entière : la restauration ne s'arrête pas à un lot de pipeline
  it("brings back a canvas of several thousand visible cells in one piece", async () => {
    const { canvasId } = await harness.readyCanvas({ ...meta, width: 100, height: 100 });
    const cells = Array.from({ length: 5000 }, (_, index) => ({
      x: index % 100,
      y: Math.floor(index / 100),
    }));
    for (let start = 0; start < cells.length; start += 1000) {
      const author = `${runId}-bulk-${start / 1000}`;
      await placeAs(canvasId, author, `pbulk${start / 1000}000`, cells.slice(start, start + 1000));
    }
    const saved = await snapshotOf(canvasId);
    await lose(canvasId);
    await target.beginRestore(canvasId);

    await target.restore(canvasId, {
      snapshot: saved,
      users,
      version: saved.version + RECOVERY_VERSION_JUMP,
      at: takenAt,
    });

    const back = await snapshotOf(canvasId);
    expect(back.cells).toHaveLength(5000);
    expect(back.cells).toEqual(saved.cells);
    expect(back.cells[0]?.[0]).toBe(toCellKey(0, 0));
  });
});

describe("the marks the web writes while a page renders (JOURNAL 2026-10-08)", () => {
  // Un canvas qui vit : ni perdu, rien à marquer
  it("tells a live canvas from a lost one", async () => {
    const live = await readyCanvas();
    const lost = `${runId}-lost`;

    expect(await marks.isCanvasLive(live.canvasId)).toBe(true);
    expect(await marks.isCanvasLive(lost)).toBe(false);
  });

  // Marquer un canvas perdu le met en récupération ; marquer un canvas qui vit n'y change rien
  it("puts a lost canvas in recovery, and leaves a live one alone", async () => {
    const live = await readyCanvas();
    const lost = `${runId}-lost-2`;

    await marks.markRecovering(lost);
    await marks.markRecovering(live.canvasId);

    expect(await core.isRecovering(lost)).toBe(true);
    expect(await core.isRecovering(live.canvasId)).toBe(false);
    expect(await redis.hget(live.keys.meta, "ready")).toBe("1");
  });

  // Le canvas neuf d'un archivage (version posée, pas encore prêt) vit pour le web : le marquer n'y touche pas
  it("takes the new canvas of an archive for live, and marking it leaves it alone", async () => {
    const canvasId = `${runId}-preparing-2`;
    await archiveWrites.prepareCanvas(canvasId, meta);

    expect(await marks.isCanvasLive(canvasId)).toBe(true);
    await marks.markRecovering(canvasId);

    expect(await core.isRecovering(canvasId)).toBe(false);
    expect(await redis.hexists(buildCanvasKeys(canvasId).meta, "ready")).toBe(0);
  });

  // Une connexion qui crée le canvas pendant la marque ne le sert jamais à moitié : `ready` ne repasse pas à 1
  it("keeps a canvas created while it is marked from becoming ready on its own", async () => {
    const canvasId = `${runId}-lost-3`;
    await marks.markRecovering(canvasId);

    await core.createCanvas(canvasId, meta);

    expect(await core.getCanvas(canvasId)).toBeNull();
    expect(await core.isRecovering(canvasId)).toBe(true);
  });
});
