import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { type CanvasMeta, toCellKey } from "@liveplace/domain";
import type { CanvasActivity, Moderation, Pixel } from "@liveplace/domain/ports";
import { type CanvasSnapshot, restoreState } from "@liveplace/domain/snapshot";
import { afterAll, describe, expect, it } from "vitest";
import { createArchiveWrites } from "./archive-writes";
import { createTwitchWrites } from "./client";
import { buildCanvasKeys, toPlacementKey } from "./keys";
import { createSnapshotSource } from "./snapshot";
import { createRedisHarness } from "./test-harness";

const harness = createRedisHarness();
const { redis, core, runId } = harness;
const watchSubscriber = redis.duplicate();
const twitchWrites = createTwitchWrites(redis);
const source = createSnapshotSource(redis, watchSubscriber);

afterAll(() => {
  watchSubscriber.disconnect();
});

const OWNER = "owner-1";
const now = 1_700_000_000_000;
const later = now + 60_000;
const takenAt = later + 1000;

const meta: CanvasMeta = {
  ownerId: OWNER,
  width: 60,
  height: 45,
  gaugeMaxStart: 1000,
  gaugeMaxCeiling: 1000,
  refillMs: 1000,
  refillCharges: 1,
  obsDelayMs: 5000,
  obsBackground: "transparent",
};

const readyCanvas = (overrides: Partial<CanvasMeta> = {}) => harness.readyCanvas({ ...meta, ...overrides });

const placeAs = (
  canvasId: string,
  userId: string,
  placementId: string,
  pixels: readonly Pixel[],
  nowMs = now,
) => harness.placeInBatches(canvasId, userId, placementId, pixels, nowMs);

// Ce que fait le gateway : la première tranche, puis les suivantes jusqu'à la fin (§5.4).
const moderateAll = async (canvasId: string, action: Moderation["action"], by = OWNER) => {
  const slice = async (which: "first" | "next") => {
    const result = await core.moderate(canvasId, { by, nowMs: later, action, slice: which });
    if (!result.ok) throw new Error(result.error);
    return result.value;
  };
  let last = await slice("first");
  while (!last.isDone) last = await slice("next");
};

const snapshotOf = async (canvasId: string): Promise<CanvasSnapshot> => {
  const players = (await source.listCanvases()).get(canvasId) ?? [];
  const snapshot = await source.getCanvasSnapshot(canvasId, players, takenAt);
  if (!snapshot) throw new Error(`pas de snapshot pour ${canvasId}`);
  return snapshot;
};

// Une case du snapshot, lisible : son auteur, sa pose et sa couleur.
const cellsOf = (snapshot: CanvasSnapshot) =>
  snapshot.cells.map(([cellKey, authorIndex, placementIndex, colorIndex, placedAt, version]) => ({
    cellKey,
    authorId: snapshot.authors[authorIndex],
    placementId: placementIndex === -1 ? null : snapshot.placements[placementIndex],
    colorIndex,
    placedAt,
    version,
  }));

const stateOf = async (canvasId: string) =>
  new Uint8Array((await redis.getBuffer(buildCanvasKeys(canvasId).state)) ?? []);

describe("getCanvasSnapshot: the pixels (Écart §7.2, JOURNAL 2026-10-06)", () => {
  // Chaque case porte le pixel visible : son auteur, sa pose, sa couleur, son heure et sa version
  it("carries, for each cell, the visible pixel with its author, placement, color, date and version", async () => {
    const { canvasId } = await readyCanvas();
    await placeAs(canvasId, "author-a", "pbelow001", [{ x: 3, y: 2, colorIndex: 5 }]);
    await placeAs(
      canvasId,
      "author-b",
      "pabove001",
      [
        { x: 3, y: 2, colorIndex: 6 },
        { x: 4, y: 2, colorIndex: 7 },
      ],
      later,
    );

    const snapshot = await snapshotOf(canvasId);

    expect(snapshot).toMatchObject({ schemaVersion: 1, canvasId, version: 2, takenAt });
    expect(cellsOf(snapshot)).toEqual(
      expect.arrayContaining([
        {
          cellKey: toCellKey(3, 2),
          authorId: "author-b",
          placementId: "pabove001",
          colorIndex: 6,
          placedAt: later,
          version: 2,
        },
        {
          cellKey: toCellKey(4, 2),
          authorId: "author-b",
          placementId: "pabove001",
          colorIndex: 7,
          placedAt: later,
          version: 2,
        },
      ]),
    );
    expect(snapshot.cells).toHaveLength(2);
    expect(snapshot.authors).toEqual(["author-b"]);
    expect(snapshot.placements).toEqual(["pabove001"]);
  });

  // Un pixel d'avant le protocole 6 n'a pas de pose : sa pose est sa version, et le snapshot ne l'invente pas
  it("keeps a pixel from before protocol 6 without a placement", async () => {
    const { canvasId, keys } = await readyCanvas();
    await redis.set(keys.version, 9);
    await redis.lpush(keys.hist(toCellKey(1, 1)), `old-author:4:${now}:9`);

    const snapshot = await snapshotOf(canvasId);

    expect(cellsOf(snapshot)).toEqual([
      {
        cellKey: toCellKey(1, 1),
        authorId: "old-author",
        placementId: null,
        colorIndex: 4,
        placedAt: now,
        version: 9,
      },
    ]);
  });

  // Une case hors du cadre garde sa pile : le snapshot la porte, et l'état refait ne l'écrit pas (§5.7)
  it("carries a cell outside the frame after a shrink, and leaves it out of the rebuilt state", async () => {
    const { canvasId } = await readyCanvas({ width: 100, height: 100 });
    await placeAs(canvasId, "author-a", "pinside001", [{ x: 10, y: 10, colorIndex: 3 }]);
    await placeAs(canvasId, "author-a", "poutside01", [{ x: 80, y: 90, colorIndex: 4 }]);
    const shrunk = await core.resizeCanvas(canvasId, { by: OWNER, width: 50, height: 50 });
    expect(shrunk).toEqual({ ok: true, value: undefined });

    const snapshot = await snapshotOf(canvasId);

    expect(
      cellsOf(snapshot)
        .map(({ cellKey }) => cellKey)
        .sort(),
    ).toEqual([toCellKey(10, 10), toCellKey(80, 90)].sort());
    expect(snapshot.meta).toMatchObject({ width: "50", height: "50" });
    expect(Array.from(restoreState({ width: 50, height: 50 }, snapshot.cells))).toEqual(
      Array.from(await stateOf(canvasId)),
    );
  });

  // Une pierre tombale couvre une tête que le retrait n'a pas encore dépilée : le pixel du dessous apparaît
  it("shows the pixel below a head a tombstone covers, as if the interrupted removal were over", async () => {
    const { canvasId, keys } = await readyCanvas();
    await placeAs(canvasId, "author-a", "pbelow001", [{ x: 3, y: 2, colorIndex: 5 }]);
    await placeAs(canvasId, "troll", "ptroll001", [
      { x: 3, y: 2, colorIndex: 6 },
      { x: 4, y: 2, colorIndex: 7 },
    ]);
    await redis.hset(keys.cleared, "troll", 3); // la première tranche est écrite, les piles pas encore dépilées

    const snapshot = await snapshotOf(canvasId);

    expect(cellsOf(snapshot)).toEqual([
      {
        cellKey: toCellKey(3, 2),
        authorId: "author-a",
        placementId: "pbelow001",
        colorIndex: 5,
        placedAt: now,
        version: 1,
      },
    ]);
    expect(snapshot.cleared).toEqual({ troll: "3" });
  });

  // Une pose retirée, ou une plage d'heures retirée, couvre aussi : elle ne revient pas
  it("also leaves out the heads covered by a cleared placement or a cleared time range", async () => {
    const { canvasId, keys } = await readyCanvas();
    await placeAs(canvasId, "troll", "ptroll001", [{ x: 1, y: 1, colorIndex: 6 }], now);
    await placeAs(canvasId, "troll", "ptroll002", [{ x: 2, y: 2, colorIndex: 6 }], later);
    await placeAs(canvasId, "troll", "ptroll003", [{ x: 3, y: 3, colorIndex: 6 }], later + 10_000);
    await redis.sadd(keys.clearedPlacements, toPlacementKey({ authorId: "troll", placementId: "ptroll001" }));
    await redis.hset(keys.clearedRanges, "troll", JSON.stringify([[later, later]]));

    const snapshot = await snapshotOf(canvasId);

    expect(cellsOf(snapshot).map(({ placementId }) => placementId)).toEqual(["ptroll003"]);
  });

  // Une case jamais posée n'a pas d'entrée : un canvas vide donne un snapshot sans case
  it("has no cell for a canvas where nothing visible was placed", async () => {
    const { canvasId, keys } = await readyCanvas();
    await redis.incr(keys.version);

    expect((await snapshotOf(canvasId)).cells).toEqual([]);
  });
});

describe("getCanvasSnapshot: the rest of what binds a canvas to its streamer (Écart §7.2, JOURNAL 2026-10-06)", () => {
  // Le state refait des cases visibles est celui de Redis, après des poses, un retrait, un ban et une pose retirée
  it("rebuilds exactly the state Redis holds after placements, removals and bans", async () => {
    const { canvasId } = await readyCanvas();
    await placeAs(canvasId, "author-a", "pbelow001", [
      { x: 0, y: 0, colorIndex: 2 },
      { x: 1, y: 0, colorIndex: 2 },
      { x: 2, y: 0, colorIndex: 2 },
    ]);
    await placeAs(canvasId, "troll", "ptroll001", [
      { x: 0, y: 0, colorIndex: 3 },
      { x: 5, y: 5, colorIndex: 3 },
    ]);
    await placeAs(canvasId, "author-c", "pcover001", [{ x: 1, y: 0, colorIndex: 4 }]);
    await placeAs(canvasId, "troll", "ptroll002", [{ x: 2, y: 0, colorIndex: 9 }]);
    await moderateAll(canvasId, { action: "ban", target: "troll" });
    await moderateAll(canvasId, { action: "clearUser", target: "troll" });
    await moderateAll(canvasId, { action: "clearPlacement", target: "author-c", placementId: "pcover001" });

    const snapshot = await snapshotOf(canvasId);

    expect(Array.from(restoreState({ width: meta.width, height: meta.height }, snapshot.cells))).toEqual(
      Array.from(await stateOf(canvasId)),
    );
    expect(cellsOf(snapshot).map(({ authorId }) => authorId)).not.toContain("troll");
  });

  // La modération entière : bannis et leur origine, preuves, pierres tombales, modérateurs et leur origine, noms Twitch
  it("carries the whole moderation: bans, proofs, tombstones, moderators and Twitch names", async () => {
    const { canvasId, keys } = await readyCanvas();
    await placeAs(canvasId, "troll", "ptroll001", [{ x: 1, y: 1, colorIndex: 6 }]);
    await placeAs(canvasId, "ghost", "pghost001", [{ x: 2, y: 2, colorIndex: 6 }]);
    await core.moderate(canvasId, {
      by: OWNER,
      nowMs: later,
      action: { action: "ban", target: "troll" },
      slice: "first",
      source: "twitch",
    });
    await moderateAll(canvasId, { action: "clearUser", target: "troll" });
    await moderateAll(canvasId, { action: "clearPlacement", target: "ghost", placementId: "pghost001" });
    await core.setModerator(canvasId, { userId: "mod-twitch", source: "twitch", isModerator: true });
    await core.setModerator(canvasId, { userId: "mod-here", source: "liveplace", isModerator: true });
    await twitchWrites.setTwitchUsers(canvasId, [
      { userId: "mod-twitch", login: "modtwitch", displayName: "ModTwitch" },
    ]);
    await redis.hset(keys.clearedRanges, "ghost", JSON.stringify([[now, later]]));

    const snapshot = await snapshotOf(canvasId);

    expect(snapshot.bans).toEqual(["troll"]);
    expect(snapshot.bansTwitch).toEqual(["troll"]);
    expect(snapshot.banProofs).toEqual({ troll: { [String(toCellKey(1, 1))]: "6" } });
    expect(snapshot.cleared).toEqual({ troll: expect.any(String) });
    expect(snapshot.clearedPlacements).toEqual([
      toPlacementKey({ authorId: "ghost", placementId: "pghost001" }),
    ]);
    expect(snapshot.clearedRanges).toEqual({ ghost: JSON.stringify([[now, later]]) });
    expect(snapshot.mods.sort()).toEqual(["mod-here", "mod-twitch"]);
    expect(snapshot.modsTwitch).toEqual(["mod-twitch"]);
    expect(snapshot.modsLiveplace).toEqual(["mod-here"]);
    expect(snapshot.twitchUsers).toEqual({
      "mod-twitch": JSON.stringify({ login: "modtwitch", displayName: "ModTwitch" }),
    });
  });

  // Les signalements en attente, ceux qui les ont faits, les poses cachées du stream et les poses rétablies
  it("carries the pending reports, who made them, the hidden placements and the approved ones", async () => {
    const { canvasId } = await readyCanvas();
    await placeAs(canvasId, "troll", "ptroll001", [{ x: 0, y: 0, colorIndex: 4 }]);
    await placeAs(canvasId, "troll", "ptroll002", [{ x: 1, y: 0, colorIndex: 4 }]);
    await placeAs(canvasId, "troll", "ptroll003", [{ x: 2, y: 0, colorIndex: 4 }]);
    const report = (reporterId: string, x: number, placementId: string, threshold: number) =>
      core.report(canvasId, { reporterId, x, y: 0, placementId, threshold, nowMs: later });
    await report("viewer-1", 0, "ptroll001", 2); // en attente, pas cachée
    await report("viewer-1", 1, "ptroll002", 1); // cachée du stream
    await report("viewer-2", 2, "ptroll003", 1);
    await moderateAll(canvasId, { action: "approvePlacement", target: "troll", placementId: "ptroll003" });

    const snapshot = await snapshotOf(canvasId);

    const pending = toPlacementKey({ authorId: "troll", placementId: "ptroll001" });
    const offStreamKey = toPlacementKey({ authorId: "troll", placementId: "ptroll002" });
    const approved = toPlacementKey({ authorId: "troll", placementId: "ptroll003" });
    expect(snapshot.reported.map(([placementKey, reportedAt]) => [placementKey, reportedAt]).sort()).toEqual(
      [
        [pending, later],
        [offStreamKey, later],
      ].sort(),
    );
    expect(snapshot.reports).toEqual({ [pending]: ["viewer-1"], [offStreamKey]: ["viewer-1"] });
    expect(snapshot.offStream).toEqual([offStreamKey]);
    expect(snapshot.approved).toEqual([approved]);
  });

  // `meta` porte tout, réglages OBS et suivi Twitch compris, sauf `ready` : la restauration le pose elle-même
  it("carries meta whole, OBS settings and Twitch sync included, except ready", async () => {
    const { canvasId } = await readyCanvas();
    await placeAs(canvasId, "author-a", "pbelow001", [{ x: 0, y: 0, colorIndex: 2 }]);
    await core.setObsDelay(canvasId, 20_000);
    await core.setObsBackground(canvasId, "white");
    await core.setGaugeLimits(canvasId, { gaugeMaxStart: 20, gaugeMaxCeiling: 200 });
    await twitchWrites.setTwitchSync(canvasId, { status: "ok", syncedAt: later });

    const { meta: saved } = await snapshotOf(canvasId);

    expect(saved).toMatchObject({
      ownerId: OWNER,
      width: "60",
      height: "45",
      obsDelayMs: "20000",
      obsBackground: "white",
      gaugeMaxStart: "20",
      gaugeMaxCeiling: "200",
      twitchSync: "ok",
      twitchSyncedAt: String(later),
    });
    expect(saved).not.toHaveProperty("ready");
  });

  // La progression des joueurs, champ par champ, y compris pour qui n'a plus aucun pixel visible : son bonus ne se perd pas
  it("carries every player's progress field by field, even one with no visible pixel left", async () => {
    const { canvasId } = await readyCanvas({ gaugeMaxStart: 100, gaugeMaxCeiling: 150 }); // de la place pour un bonus
    const wall = Array.from({ length: 16 }, (_, index) => ({ x: index, y: 0, colorIndex: 2 }));
    await placeAs(canvasId, "buried", "pburied001", wall);
    await core.claimGauge(canvasId, { userId: "buried", requestId: randomUUID(), nowMs: now });
    await placeAs(
      canvasId,
      "cover",
      "pcover0001",
      wall.map((pixel) => ({ ...pixel, colorIndex: 3 })),
    );

    const snapshot = await snapshotOf(canvasId);

    expect(snapshot.authors).toEqual(["cover"]);
    expect(snapshot.progress.buried).toMatchObject({ counted: "16", claimed: "1" });
    expect(snapshot.progress.cover).toMatchObject({ counted: "16" });
  });

  // Les joueurs connus d'avance s'ajoutent aux auteurs visibles : un joueur donné qui n'a pas de progression est ignoré
  it("adds the known players to the visible authors, and skips one without progress", async () => {
    const { canvasId } = await readyCanvas();
    await placeAs(canvasId, "author-a", "pbelow001", [{ x: 0, y: 0, colorIndex: 2 }]);

    const snapshot = await source.getCanvasSnapshot(canvasId, ["never-played"], takenAt);

    expect(Object.keys(snapshot?.progress ?? {})).toEqual(["author-a"]);
  });
});

describe("getCanvasSnapshot: the scoreboard and the archive fields (JOURNAL 2026-10-08)", () => {
  // Le classement part tel que Redis le garde : les scores en chaînes, et les bannis à part avec le leur
  it("carries the scoreboard and the banned scores exactly as Redis holds them", async () => {
    const { canvasId, keys } = await readyCanvas();
    await placeAs(canvasId, "first", "pfirst0001", [
      { x: 0, y: 0, colorIndex: 2 },
      { x: 1, y: 0, colorIndex: 2 },
    ]);
    await placeAs(canvasId, "second", "psecond001", [{ x: 2, y: 0, colorIndex: 3 }]);
    await placeAs(canvasId, "troll", "ptroll0001", [{ x: 3, y: 0, colorIndex: 4 }]);
    await moderateAll(canvasId, { action: "ban", target: "troll" });

    const snapshot = await snapshotOf(canvasId);

    const flat = await redis.zrange(keys.scoreboard, "0", "-1", "WITHSCORES");
    const fromRedis = Object.fromEntries(
      flat.flatMap((member, index) => (index % 2 === 0 ? [[member, flat[index + 1] ?? ""]] : [])),
    );
    expect(Object.keys(fromRedis).sort()).toEqual(["first", "second"]);
    expect(snapshot.scoreboard).toEqual(fromRedis);
    expect(snapshot.scoreboardBanned).toEqual(await redis.hgetall(keys.scoreboardBanned));
    expect(Object.keys(snapshot.scoreboardBanned ?? {})).toEqual(["troll"]);
  });

  // Un canvas sans classement en donne un vide : le champ est toujours écrit par ce code
  it("writes empty scoreboards for a canvas that has none yet", async () => {
    const { canvasId } = await readyCanvas();
    await placeAs(canvasId, "someone", "pone000001", [{ x: 0, y: 0, colorIndex: 2 }]);
    await redis.del(buildCanvasKeys(canvasId).scoreboard);

    const snapshot = await snapshotOf(canvasId);

    expect(snapshot.scoreboard).toEqual({});
    expect(snapshot.scoreboardBanned).toEqual({});
  });

  // Ce qu'un archivage, un thème ou un fond noir ajoutent à `meta` part avec lui, champ par champ
  it("carries the meta fields of an archive: theme, archive date, successor and the black OBS background", async () => {
    const { canvasId } = await readyCanvas();
    await placeAs(canvasId, "author-a", "pbelow001", [{ x: 0, y: 0, colorIndex: 2 }]);
    const writes = createArchiveWrites(redis);
    await core.setObsBackground(canvasId, "black");
    await writes.setTheme(canvasId, "Ocean");
    await writes.markArchived(canvasId, { archivedAt: later, successorId: `${runId}-successor` });

    const { meta: saved } = await snapshotOf(canvasId);

    expect(saved).toMatchObject({
      obsBackground: "black",
      theme: "Ocean",
      archivedAt: String(later),
      successorId: `${runId}-successor`,
    });
    expect(saved).not.toHaveProperty("ready");
  });
});

describe("getCanvasSnapshot: a canvas at version 0 (JOURNAL 2026-10-08)", () => {
  // Le canvas neuf d'un archivage : aucune pose, mais les bannis, les modérateurs et la progression recopiés
  it("is saved when it holds a banned user, a moderator or a progress, and empty of pixels", async () => {
    const withBan = await readyCanvas();
    const withModerator = await readyCanvas();
    const withProgress = await readyCanvas();
    await redis.sadd(withBan.keys.bans, "troll");
    await redis.hset(withBan.keys.ban("troll"), { [String(toCellKey(1, 1))]: "6" });
    await core.setModerator(withModerator.canvasId, {
      userId: "mod-1",
      source: "liveplace",
      isModerator: true,
    });
    await redis.hset(withProgress.keys.progress("player-1"), { counted: "40", claimed: "2" });

    const [ban, moderator, progress] = await Promise.all([
      source.getCanvasSnapshot(withBan.canvasId, [], takenAt),
      source.getCanvasSnapshot(withModerator.canvasId, [], takenAt),
      source.getCanvasSnapshot(withProgress.canvasId, ["player-1"], takenAt),
    ]);

    expect(ban).toMatchObject({ version: 0, cells: [], bans: ["troll"] });
    expect(ban?.banProofs).toEqual({ troll: { [String(toCellKey(1, 1))]: "6" } });
    expect(moderator).toMatchObject({ version: 0, cells: [], mods: ["mod-1"] });
    expect(progress).toMatchObject({
      version: 0,
      cells: [],
      progress: { "player-1": { counted: "40", claimed: "2" } },
    });
  });

  // Un canvas prêt, en version 0, sans banni, modérateur ni progression : rien à garder
  it("is not saved when it holds nothing at all, even with players the sweep knows", async () => {
    const { canvasId } = await readyCanvas();

    expect(await source.getCanvasSnapshot(canvasId, ["no-progress"], takenAt)).toBeNull();
  });
});

describe("listPlayers and getSuccessorId (JOURNAL 2026-10-08)", () => {
  // Les joueurs d'un seul canvas, sans ceux d'un autre, même quand leur identifiant commence pareil
  it("lists the players of one canvas only", async () => {
    const mine = await readyCanvas();
    const other = await readyCanvas();
    await redis.hset(mine.keys.progress("player-1"), { counted: "1" });
    await redis.hset(mine.keys.progress("player-2"), { counted: "1" });
    await redis.hset(other.keys.progress("player-3"), { counted: "1" });

    expect((await source.listPlayers(mine.canvasId)).sort()).toEqual(["player-1", "player-2"]);
    expect(await source.listPlayers(`${runId}-absent`)).toEqual([]);
  });

  // Un identifiant qui ressemble à un motif ne balaie rien d'autre
  it("treats a canvas id as a name, never as a pattern", async () => {
    const mine = await readyCanvas();
    await redis.hset(mine.keys.progress("player-1"), { counted: "1" });

    expect(await source.listPlayers("*")).toEqual([]);
    expect(await source.listPlayers(`${runId}-[0-9]`)).toEqual([]);
  });

  // Le successeur est celui que l'archivage a posé dans `meta`, ou `null`
  it("gives the successor an archive set in meta, null otherwise", async () => {
    const { canvasId } = await readyCanvas();
    expect(await source.getSuccessorId(canvasId)).toBeNull();

    await createArchiveWrites(redis).markArchived(canvasId, {
      archivedAt: later,
      successorId: "successor-1",
    });

    expect(await source.getSuccessorId(canvasId)).toBe("successor-1");
  });
});

describe("getCanvasSnapshot: when there is nothing to save", () => {
  // Absent, pas prêt (une restauration l'écrira), ou jamais touché : ni snapshot, ni erreur
  it("returns null for a canvas that is absent, not ready, or never touched", async () => {
    const touched = await readyCanvas();
    await placeAs(touched.canvasId, "author-a", "pbelow001", [{ x: 0, y: 0, colorIndex: 2 }]);
    await redis.hset(touched.keys.meta, "ready", 0);
    const untouched = await readyCanvas();

    expect(await source.getCanvasSnapshot(`${runId}-absent`, [], takenAt)).toBeNull();
    expect(await source.getCanvasSnapshot(touched.canvasId, [], takenAt)).toBeNull();
    expect(await source.getCanvasSnapshot(untouched.canvasId, [], takenAt)).toBeNull();
  });
});

describe("getVersion and listCanvases", () => {
  // La version est celle du canvas, ou `null` s'il n'existe pas
  it("reads the version of a canvas, null when it does not exist", async () => {
    const { canvasId } = await readyCanvas();
    await placeAs(canvasId, "author-a", "pbelow001", [{ x: 0, y: 0, colorIndex: 2 }]);

    expect(await source.getVersion(canvasId)).toBe(1);
    expect(await source.getVersion(`${runId}-absent`)).toBeNull();
  });

  // Un balayage rend chaque canvas avec ses joueurs, y compris celui où personne n'a posé : il a pu être dessiné avant la progression
  it("lists every canvas with its players, even one where nobody has progress", async () => {
    const first = await readyCanvas();
    const second = await readyCanvas();
    const empty = await readyCanvas();
    await placeAs(first.canvasId, "player-1", "pfirst0001", [{ x: 0, y: 0, colorIndex: 2 }]);
    await placeAs(first.canvasId, "player-2", "psecond001", [{ x: 1, y: 0, colorIndex: 2 }]);
    await placeAs(second.canvasId, "player-1", "pthird0001", [{ x: 0, y: 0, colorIndex: 2 }]);

    const players = await source.listCanvases();

    expect(players.get(first.canvasId)?.sort()).toEqual(["player-1", "player-2"]);
    expect(players.get(second.canvasId)).toEqual(["player-1"]);
    expect(players.get(empty.canvasId)).toEqual([]);
  });
});

describe("watch", () => {
  // Une pose attend son tour ; tout le reste (modération, réglage, taille, modérateur) est du travail pressé
  it("tells a placement from everything else, canvas by canvas", async () => {
    const { canvasId } = await readyCanvas();
    const seen: CanvasActivity[] = [];
    const unwatch = await source.watch((activity) => seen.push(activity));

    await placeAs(canvasId, "author-a", "pbelow001", [{ x: 0, y: 0, colorIndex: 2 }]);
    await moderateAll(canvasId, { action: "ban", target: "troll" });
    await core.setObsDelay(canvasId, 20_000);
    await core.setModerator(canvasId, { userId: "mod-1", source: "liveplace", isModerator: true });
    await delay(150);
    await unwatch();
    await core.setObsDelay(canvasId, 10_000);
    await delay(100);

    const mine = seen.filter((activity) => activity.canvasId === canvasId);
    expect(mine.map(({ isPlacement }) => isPlacement)).toEqual([true, false, false, false, false]);
  });

  // Le statut que le web publie suit l'activité : archivé, redevenu actif, supprimé (JOURNAL 2026-10-08)
  it("carries the status the web publishes, and none for anything else", async () => {
    const { canvasId } = await readyCanvas();
    const seen: CanvasActivity[] = [];
    const unwatch = await source.watch((activity) => seen.push(activity));

    const writes = createArchiveWrites(redis);
    for (const status of ["archived", "active", "discarded"] as const)
      await writes.publishStatus(canvasId, status);
    await core.setObsDelay(canvasId, 20_000);
    await delay(150);
    await unwatch();

    const mine = seen.filter((activity) => activity.canvasId === canvasId);
    expect(mine).toEqual([
      { canvasId, isPlacement: false, status: "archived" },
      { canvasId, isPlacement: false, status: "active" },
      { canvasId, isPlacement: false, status: "discarded" },
      { canvasId, isPlacement: false },
    ]);
  });
});
