// La règle des sauvegardes (`domain/account-erasure.ts`) et celle de Redis (`account-purge.ts`) ne sont écrites qu'une fois
// chacune, dans deux langages : ce test les fait tourner sur le même monde, avec le vrai Redis, et exige le même résultat
// (JOURNAL 2026-11-02). Le snapshot et les chunks d'un canvas, lus avant la purge puis réécrits par la règle des fichiers,
// doivent être ceux que le worker lirait dans Redis après la purge.

import { CANVAS_HEIGHT, CANVAS_WIDTH, type CanvasMeta, defaultCanvasMeta } from "@liveplace/domain";
import { deleteAccountFromChunk, deleteAccountFromSnapshot } from "@liveplace/domain/account-erasure";
import type { Chunk } from "@liveplace/domain/chunk";
import { CHUNK_SCHEMA_VERSION } from "@liveplace/domain/chunk";
import type { Moderation } from "@liveplace/domain/ports";
import type { CanvasSnapshot } from "@liveplace/domain/snapshot";
import { describe, expect, it, vi } from "vitest";
import { createAccountPurge } from "./account-purge";
import { createArchiveWrites } from "./archive-writes";
import { createTwitchWrites } from "./client";
import { createHistorySource } from "./history";
import { createSnapshotSource } from "./snapshot";
import { createRedisHarness } from "./test-harness";

vi.setConfig({ testTimeout: 30_000 });

const harness = createRedisHarness();
const { redis, core, runId } = harness;
const SECRET = "un-secret-de-session-de-plus-de-32-octets";
const purge = createAccountPurge(redis, SECRET);
const archiveWrites = createArchiveWrites(redis);
const twitchWrites = createTwitchWrites(redis, harness.secret);
const snapshots = createSnapshotSource(redis, redis);
const histories = createHistorySource(redis, redis);

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

// Le monde du lot 1 : un viewer qui dessine, est recouvert, banni, retiré, modérateur, signaleur, signalé, classé, nommé.
let worldCount = 0;
const buildWorld = async () => {
  worldCount += 1;
  const id = (name: string) => `${runId}-e${worldCount}-${name}`;
  const [streamer, viewer, other, third] = [id("streamer"), id("viewer"), id("other"), id("third")];
  const active = await harness.readyCanvas(metaOf(streamer));
  const archive = await harness.readyCanvas(metaOf(streamer));
  const elsewhere = await harness.readyCanvas(metaOf(other));

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

  await placeAs(archive, viewer, "pviewer011", [[5, 5, 8]], now);
  expect(
    (await core.setModerator(archive.canvasId, { userId: viewer, source: "twitch", isModerator: true })).ok,
  ).toBe(true);
  await archiveWrites.markArchived(archive.canvasId, {
    archivedAt: now + minute,
    successorId: active.canvasId,
  });

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
  // Une pose du viewer retirée seule, avec sa plage d'heures, puis rétablie ailleurs : toutes les pierres tombales.
  await placeAs(elsewhere, viewer, "pviewer022", [[6, 6, 4]], now + 3 * minute);
  await placeAs(elsewhere, third, "pthird0002", [[6, 6, 11]], now + 4 * minute);
  await moderateAll(
    elsewhere,
    other,
    { action: "clearPlacement", target: viewer, placementId: "pviewer022", range: { from: 0, to: now } },
    now + 5 * minute,
  );

  await moderateAll(elsewhere, other, { action: "ban", target: viewer }, now + 6 * minute);
  await moderateAll(elsewhere, other, { action: "clearUser", target: viewer }, now + 6 * minute);

  expect(
    (await core.setModerator(active.canvasId, { userId: viewer, source: "liveplace", isModerator: true })).ok,
  ).toBe(true);
  await twitchWrites.setTwitchUsers(active.canvasId, [
    { userId: viewer, login: "viewer", displayName: "Viewer" },
  ]);
  // Il modère aussi : le retrait de la pose d'un autre, une entrée du flux dont il est l'auteur.
  await moderateAll(
    active,
    viewer,
    { action: "clearPlacement", target: other, placementId: "pother0001" },
    now + 5 * minute,
  );

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
  // Une pose du viewer cachée du stream puis rétablie par le streamer : elle devient « approuvée ».
  await placeAs(active, viewer, "pviewer004", [[10, 10, 6]], now + 7 * minute);
  expect((await report(active, third, 10, 10, "pviewer004", 1)).ok).toBe(true);
  await moderateAll(
    active,
    streamer,
    { action: "approvePlacement", target: viewer, placementId: "pviewer004" },
    now + 8 * minute,
  );

  return { viewer, other, third, canvases: [active, archive, elsewhere] };
};

// Un snapshot comparable : les cases disent leur auteur et leur pose en clair, et chaque liste est un ensemble.
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value))
    return value
      .map(canonical)
      .sort((first, second) => (JSON.stringify(first) < JSON.stringify(second) ? -1 : 1));
  if (typeof value === "object" && value !== null)
    return Object.fromEntries(
      Object.entries(value)
        .sort(([first], [second]) => (first < second ? -1 : 1))
        .map(([key, member]) => [key, canonical(member)]),
    );
  return value;
};

const comparable = ({ authors, placements, cells, ...rest }: CanvasSnapshot) =>
  canonical({
    ...rest,
    cells: cells.map(([cellKey, authorIndex, placementIndex, colorIndex, placedAt, version]) => [
      cellKey,
      authors[authorIndex],
      placementIndex === -1 ? null : placements[placementIndex],
      colorIndex,
      placedAt,
      version,
    ]),
  });

// Les champs d'un snapshot où `userId` figure, en clé ou en valeur.
const namedFields = (all: readonly CanvasSnapshot[], userId: string): string[] =>
  all.flatMap((snapshot) =>
    Object.entries(snapshot).flatMap(([field, value]) =>
      JSON.stringify(value).includes(userId) ? [field] : [],
    ),
  );

const snapshotOf = async (canvas: Canvas): Promise<CanvasSnapshot> => {
  const players = await snapshots.listPlayers(canvas.canvasId);
  const snapshot = await snapshots.getCanvasSnapshot(canvas.canvasId, players, now + 10 * minute);
  if (!snapshot) throw new Error("canvas sans snapshot");
  return snapshot;
};

const chunkOf = async (canvas: Canvas): Promise<Chunk> => {
  const { entries } = await histories.listHistory(canvas.canvasId, 0, 10_000);
  const [first, last] = [entries[0]?.[0] ?? 0, entries.at(-1)?.[0] ?? 0];
  return {
    schemaVersion: CHUNK_SCHEMA_VERSION,
    canvasId: canvas.canvasId,
    fromVersion: first,
    toVersion: last,
    entries,
  };
};

describe("the rule of the backups equals the rule of the Redis purge (CDC §8, JOURNAL 2026-11-02)", () => {
  // Le snapshot lu avant la purge puis réécrit est celui que le worker lirait après elle, sur chaque fresque du monde
  it("rewrites a snapshot into the one the worker reads from Redis after the purge", async () => {
    const world = await buildWorld();
    const before = await Promise.all(world.canvases.map(snapshotOf));
    expect(JSON.stringify(before)).toContain(world.viewer);

    await purge.purgeTraces(world.viewer);

    const after = await Promise.all(world.canvases.map(snapshotOf));
    expect(JSON.stringify(after)).not.toContain(world.viewer);
    before.forEach((snapshot, index) => {
      expect(comparable(deleteAccountFromSnapshot(snapshot, world.viewer))).toEqual(
        comparable(after[index] as CanvasSnapshot),
      );
    });
  });

  // Le chunk lu avant la purge puis réécrit est celui du flux après elle : mêmes versions, mêmes poses, même ordre
  it("rewrites a chunk into the one Redis keeps in its stream after the purge", async () => {
    const world = await buildWorld();
    const before = await Promise.all(world.canvases.map(chunkOf));
    expect(JSON.stringify(before)).toContain(world.viewer);

    await purge.purgeTraces(world.viewer);

    const after = await Promise.all(world.canvases.map(chunkOf));
    expect(JSON.stringify(after)).not.toContain(world.viewer);
    before.forEach((chunk, index) => {
      expect(deleteAccountFromChunk(chunk, world.viewer)).toEqual(after[index]);
    });
  });

  // La preuve n'est pas vide : le monde nomme le compte à chacun des endroits que la règle réécrit
  it("is not an empty proof: the world names the account in every field the rule rewrites", async () => {
    const world = await buildWorld();
    const snapshotText = JSON.stringify(await Promise.all(world.canvases.map(snapshotOf)));
    const chunkText = JSON.stringify(await Promise.all(world.canvases.map(chunkOf)));

    for (const field of [
      "progress",
      "bans",
      "banProofs",
      "cleared",
      "clearedPlacements",
      "clearedRanges",
      "mods",
      "modsTwitch",
      "modsLiveplace",
      "twitchUsers",
      "scoreboard",
      "scoreboardBanned",
      "reports",
      "offStream",
      "approved",
    ])
      expect(namedFields(await Promise.all(world.canvases.map(snapshotOf)), world.viewer)).toContain(field);
    expect(snapshotText).toContain(`"authors":[`);
    expect(chunkText).toContain(`"authorId":"${world.viewer}"`);
    expect(chunkText).toContain(`"target":"${world.viewer}"`);
  });
});
