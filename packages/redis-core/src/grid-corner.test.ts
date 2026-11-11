import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  type CanvasMeta,
  type CanvasOrigin,
  cellAt,
  cellKeyAt,
  cornerOf,
  DELETED_AUTHOR,
  defaultCanvasMeta,
  toCellKey,
  toStateOffset,
} from "@liveplace/domain";
import type { LiveMessage, Moderation, Pixel } from "@liveplace/domain/ports";
import { RECOVERY_VERSION_JUMP } from "@liveplace/domain/snapshot";
import { afterAll, describe, expect, it, vi } from "vitest";
import { createAccountPurge } from "./account-purge";
import { createArchiveWrites } from "./archive-writes";
import { buildCanvasKeys } from "./keys";
import { createRecoveryTarget } from "./recovery";
import { createSnapshotSource } from "./snapshot";
import { createRedisHarness, drawing, locateIn, patternAt, seeded } from "./test-harness";

// La grille fixe (JOURNAL 2026-11-05) : un coin négatif, obtenu par des croissances à gauche et en haut, ne change aucune opération.
vi.setConfig({ testTimeout: 30_000 });

const harness = createRedisHarness();
const { redis, core, secret } = harness;
const watchSubscriber = redis.duplicate();
const source = createSnapshotSource(redis, watchSubscriber);
const target = createRecoveryTarget(redis);
const purge = createAccountPurge(redis, secret);
const archiveWrites = createArchiveWrites(redis);

afterAll(() => {
  watchSubscriber.disconnect();
});

const OWNER = "owner-1";
const now = 1_700_000_000_000;

const richMeta = (width: number, height: number): CanvasMeta => ({
  ...defaultCanvasMeta(OWNER),
  width,
  height,
  gaugeMaxStart: 100_000,
  gaugeMaxCeiling: 100_000,
  refillMs: 1000,
});

// Une fresque dont la taille dynamique est déjà activée : sa taille ne bouge pas, contrairement à `setDynamicSize`.
const dynamicCanvas = async (width: number, height: number) => {
  const created = await harness.readyCanvas(richMeta(width, height));
  await redis.hset(created.keys.meta, "dynamicSize", 1);
  return created;
};

const placeAs = async (
  canvasId: string,
  userId: string,
  placementId: string,
  pixels: Pixel[],
  origin?: CanvasOrigin,
) => {
  const result = await core.place(canvasId, {
    userId,
    requestId: randomUUID(),
    placementId,
    nowMs: now,
    ...(origin ? { origin } : {}),
    pixels,
  });
  if (!result.ok || result.value.accepted !== pixels.length) throw new Error(`pose refusée pour ${userId}`);
  return result.value;
};

const cornerOfCanvas = async (canvasId: string) =>
  cornerOf(await redis.hgetall(buildCanvasKeys(canvasId).meta));

const sortedKeys = (keys: Iterable<string | number>) => [...keys].map(Number).sort((a, b) => a - b);

const pileKeys = async (canvasId: string) => sortedKeys((await harness.listPiles(canvasId)).keys());

// Chaque pile de la grille avec toutes ses entrées : ce que le cadre ne doit jamais déplacer.
const pilesWithEntries = async (canvasId: string) => {
  const { histPrefix } = buildCanvasKeys(canvasId);
  return new Map(
    await Promise.all(
      (await pileKeys(canvasId)).map(
        async (cellKey): Promise<[number, string[]]> => [
          cellKey,
          await redis.lrange(`${histPrefix}${cellKey}`, 0, -1),
        ],
      ),
    ),
  );
};

// L'image que voit une page : les pixels posés de `state`.
const picture = async (canvasId: string) => {
  const { width, height } = (await core.getCanvas(canvasId)) ?? { width: 0, height: 0 };
  const state = await redis.getBuffer(buildCanvasKeys(canvasId).state);
  const found: { x: number; y: number; colorIndex: number }[] = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const colorIndex = state?.[toStateOffset(x, y, width)] ?? 0;
      if (colorIndex !== 0) found.push({ x, y, colorIndex });
    }
  return found;
};

// Chaque pose du pion de croissance à la case (0, 0) du cadre d'alors : la fresque grandit de 3 à gauche et de 3 en haut.
const growLeftAndTop = async (canvasId: string, times: number) => {
  for (let step = 0; step < times; step++)
    await placeAs(canvasId, "grower", `pgrow${String(step).padStart(4, "0")}`, [
      { x: 0, y: 0, colorIndex: 2 },
    ]);
};

// Une scène : un bloc de A, un pixel de B qui le recouvre, puis quatre croissances à gauche et en haut (le coin vaut (-12, -12)).
// Les cases de la scène, dans le cadre d'aujourd'hui : le bloc de A en (20..22, 20..22), le pixel de B en (21, 21).
const scene = async () => {
  const created = await dynamicCanvas(20, 20);
  const { canvasId } = created;
  await placeAs(
    canvasId,
    "author-a",
    "pblocka001",
    drawing(8, 8, 3, 3).map((pixel) => ({ ...pixel, colorIndex: 5 })),
  );
  await placeAs(canvasId, "author-b", "pblockb001", [{ x: 9, y: 9, colorIndex: 6 }]);
  await growLeftAndTop(canvasId, 4);
  const corner = await cornerOfCanvas(canvasId);
  expect(corner).toEqual({ x: -12, y: -12 });
  return { ...created, corner };
};

const moderate = async (canvasId: string, action: Moderation["action"]) => {
  const result = await core.moderate(canvasId, { by: OWNER, nowMs: now, action, slice: "first" });
  if (!result.ok) throw new Error(result.error);
  return result.value;
};

describe("la grille fixe : grandir ne déplace aucune pile (JOURNAL 2026-11-05)", () => {
  // Quand la fresque grandit à gauche et en haut, l'ensemble des clés `hist:` reste le même : seuls `meta` et `state` changent
  it("keeps the same hist: keys, with the same entries, through six growths to the left and to the top", async () => {
    const { canvasId, keys } = await dynamicCanvas(20, 20);
    await placeAs(canvasId, "author-a", "pblocka001", drawing(8, 8, 3, 3));
    await placeAs(canvasId, "author-b", "pblockb001", [{ x: 9, y: 9, colorIndex: 6 }]);
    let before = await pilesWithEntries(canvasId);
    const metaBefore = await redis.hgetall(keys.meta);

    for (let growth = 0; growth < 6; growth++) {
      await growLeftAndTop(canvasId, 1);
      const after = await pilesWithEntries(canvasId);
      for (const [cellKey, entries] of before) expect(after.get(cellKey)).toEqual(entries);
      expect(after.size).toBe(before.size + 1); // la pile du pion de croissance, et aucune autre
      before = after;
    }

    const metaAfter = await redis.hgetall(keys.meta);
    expect(metaAfter).toMatchObject({ cornerX: "-18", cornerY: "-18", width: "38", height: "38" });
    expect(metaBefore.cornerX).toBeUndefined();
    expect(await core.getCanvas(canvasId)).toMatchObject({ origin: { x: 18, y: 18 } });
  });

  // Une case du cadre qui vient de la grille, mais d'aucune pile : transparente ; une pile qui y entre se montre
  it("rebuilds state from the old image where it stays and from the head of the pile elsewhere", async () => {
    const { canvasId, keys } = await dynamicCanvas(20, 20);
    await redis.rpush(keys.hist(toCellKey(21, 3)), "ghost:7:1:1:p1abcdefgh"); // hors du cadre, à droite

    await placeAs(canvasId, "author-a", "pblocka001", [
      { x: 1, y: 1, colorIndex: 5 },
      { x: 18, y: 10, colorIndex: 5 },
    ]);

    // à gauche et en haut : transparent ; à droite : la pile restée là se montre
    expect(await picture(canvasId)).toEqual([
      { x: 3, y: 3, colorIndex: 5 },
      { x: 23, y: 5, colorIndex: 7 },
      { x: 20, y: 12, colorIndex: 5 },
    ]);
  });
});

describe("la grille fixe : chaque opération tombe sur la bonne case, coin négatif (JOURNAL 2026-11-05)", () => {
  // Poser : la pile, la case de l'auteur et l'image sont à la case du cadre visée
  it("places a pixel at the cell of the frame: its pile, its author cell and the image", async () => {
    const { canvasId, keys, corner } = await scene();

    await placeAs(canvasId, "author-d", "pplaced001", [{ x: 25, y: 10, colorIndex: 9 }]);

    const [head] = await redis.lrange(keys.hist(cellKeyAt(corner, 25, 10)), 0, -1);
    expect(head).toMatch(/^author-d:9:/);
    expect(await redis.smembers(keys.cells("author-d"))).toEqual([String(toCellKey(13, -2))]);
    expect(await picture(canvasId)).toContainEqual({ x: 25, y: 10, colorIndex: 9 });
    expect(await core.inspect(canvasId, 25, 10)).toMatchObject({ userId: "author-d", colorIndex: 9 });
  });

  // Une pose partie avant des croissances atteint la case que la page visait
  it("keeps a pose sent from an origin before three growths on the cell it aimed at", async () => {
    const { canvasId, keys } = await dynamicCanvas(20, 20);
    await growLeftAndTop(canvasId, 3);

    await placeAs(canvasId, "author-d", "pstale0001", [{ x: 10, y: 12, colorIndex: 9 }], { x: 0, y: 0 });

    expect(await redis.lindex(keys.hist(toCellKey(10, 12)), 0)).toMatch(/^author-d:9:/);
    expect(await core.inspect(canvasId, 19, 21)).toMatchObject({ userId: "author-d" });
    expect(await picture(canvasId)).toContainEqual({ x: 19, y: 21, colorIndex: 9 });
  });

  // Inspecter, et retrouver les cases d'un auteur à partir de l'une d'elles
  it("inspects a cell and lists the cells of a pose from one of them", async () => {
    const { canvasId } = await scene();

    expect(await core.inspect(canvasId, 20, 20)).toMatchObject({ userId: "author-a", colorIndex: 5 });
    expect(await core.inspect(canvasId, 21, 21)).toMatchObject({ userId: "author-b", colorIndex: 6 });
    expect(await core.inspect(canvasId, 3, 3)).toMatchObject({ userId: "grower" });
    expect(await core.inspect(canvasId, 4, 4)).toBeNull();
    expect(await core.listAuthorPixels(canvasId, 21, 21, "pblockb001")).toEqual([
      expect.objectContaining({ x: 21, y: 21, colorIndex: 6 }),
    ]);
    expect(await core.listAuthorPixels(canvasId, 21, 21, "pblocka001")).toBeNull();
    const pixels = await core.listPixels(canvasId, "author-a");
    expect(pixels.map(({ x, y }) => `${x},${y}`).sort()).toEqual(
      drawing(20, 20, 3, 3)
        .filter(({ x, y }) => !(x === 21 && y === 21))
        .map(({ x, y }) => `${x},${y}`)
        .sort(),
    );
  });

  // Signaler : la pose est celle de la case du cadre, cachée au seuil, et le stream montre ce qui est dessous
  it("reports the pose of a cell, hides it at the threshold and shows what is under it at the same cell", async () => {
    const { canvasId } = await scene();

    const reported = await core.report(canvasId, {
      reporterId: "reporter-1",
      x: 21,
      y: 21,
      placementId: "pblockb001",
      threshold: 1,
      nowMs: now,
    });

    expect(reported).toEqual({ ok: true, value: undefined });
    expect(await core.listOffStreamCells(canvasId)).toEqual([{ x: 21, y: 21, colorIndex: 5 }]);
    expect(await core.listReports(canvasId)).toEqual([
      expect.objectContaining({
        placementId: "pblockb001",
        isOffStream: true,
        pixels: [{ x: 21, y: 21, colorIndex: 6 }],
      }),
    ]);
    // Un signalement qui vise la pose d'une autre case n'en cache rien
    expect(
      await core.report(canvasId, {
        reporterId: "reporter-2",
        x: 20,
        y: 20,
        placementId: "pblockb001",
        threshold: 1,
        nowMs: now,
      }),
    ).toEqual({ ok: false, error: "changed" });
  });

  // Rétablir : la pose revient sur le stream, et l'événement parle de la case du cadre
  it("brings a hidden pose back to the stream, the event speaking of the cell of the frame", async () => {
    const { canvasId } = await scene();
    await core.report(canvasId, {
      reporterId: "reporter-1",
      x: 21,
      y: 21,
      placementId: "pblockb001",
      threshold: 1,
      nowMs: now,
    });
    const received: LiveMessage[] = [];
    const unsubscribe = await core.subscribe(canvasId, (message) => received.push(message));

    await moderate(canvasId, { action: "approvePlacement", target: "author-b", placementId: "pblockb001" });
    await delay(100);
    await unsubscribe();

    expect(await core.listOffStreamCells(canvasId)).toEqual([]);
    expect(received.find((message) => "e" in message && message.e.kind === "unhide")).toMatchObject({
      e: { cells: [{ x: 21, y: 21, colorIndex: 6 }] },
    });
  });

  // Effacer : la case retrouve ce qu'il y avait dessous, dans l'image, la pile et les cases des auteurs
  it("clears a user and brings back what was under his pixel, at the same cell", async () => {
    const { canvasId, keys, corner } = await scene();
    const received: LiveMessage[] = [];
    const unsubscribe = await core.subscribe(canvasId, (message) => received.push(message));

    await moderate(canvasId, { action: "clearUser", target: "author-b" });
    await delay(100);
    await unsubscribe();

    expect(await picture(canvasId)).toContainEqual({ x: 21, y: 21, colorIndex: 5 });
    expect(await core.inspect(canvasId, 21, 21)).toMatchObject({ userId: "author-a" });
    expect(await redis.lrange(keys.hist(cellKeyAt(corner, 21, 21)), 0, -1)).toHaveLength(1);
    expect(await redis.smembers(keys.cells("author-b"))).toEqual([]);
    expect(await redis.smembers(keys.cells("author-a"))).toContain(String(toCellKey(9, 9)));
    expect(received.find((message) => "e" in message && message.e.kind === "clear")).toMatchObject({
      e: { cells: [{ x: 21, y: 21, colorIndex: 5, previousColorIndex: 6 }] },
    });
    expect(await redis.hkeys(keys.recentlyCleared("author-b"))).toEqual([String(toCellKey(9, 9))]);
  });

  // Effacer une pose seule : ses cases redeviennent transparentes
  it("clears one pose and leaves the cells of the others", async () => {
    const { canvasId } = await scene();

    await moderate(canvasId, { action: "clearPlacement", target: "grower", placementId: "pgrow0000" });

    const cells = (await picture(canvasId)).map(({ x, y }) => `${x},${y}`);
    expect(cells).not.toContain("12,12");
    expect(cells).toEqual(expect.arrayContaining(["9,9", "6,6", "3,3", "20,20"]));
  });

  // Bannir : la preuve garde les cases du cadre, lues par le coin
  it("keeps the proof of a ban at the cells of the frame", async () => {
    const { canvasId } = await scene();

    await moderate(canvasId, { action: "ban", target: "author-b" });

    expect(await core.listPixels(canvasId, "author-b")).toEqual([{ x: 21, y: 21, colorIndex: 6 }]);
    await moderate(canvasId, { action: "clearUser", target: "author-b" });
    expect(await core.listPixels(canvasId, "author-b")).toEqual([{ x: 21, y: 21, colorIndex: 6 }]);
  });

  // Archiver : la preuve d'un ban passe à l'autre fresque en gardant les cases du cadre, quels que soient leurs deux coins
  it("carries the proof of a ban to another canvas at the same cells of the frame", async () => {
    const { canvasId } = await scene();
    await moderate(canvasId, { action: "ban", target: "author-b" });
    const other = await dynamicCanvas(20, 20);
    await growLeftAndTop(other.canvasId, 2); // un autre coin : (-6, -6)

    await archiveWrites.copyShared(canvasId, other.canvasId);

    expect(await core.listPixels(other.canvasId, "author-b")).toEqual([{ x: 21, y: 21, colorIndex: 6 }]);
    expect(await redis.hkeys(other.keys.ban("author-b"))).toEqual([String(toCellKey(15, 15))]);
    expect(await core.listPixels(canvasId, "author-b")).toEqual([{ x: 21, y: 21, colorIndex: 6 }]);
  });

  // Supprimer un compte : ses piles sont à des clés négatives, le motif des clés du script les lit
  it("deletes an account whose piles are at negative keys, every pixel staying under the deleted author", async () => {
    const { canvasId, keys, corner } = await scene();
    const growerKeys = [0, 1, 2, 3].map((step) => toCellKey(-3 * step, -3 * step) || 0);
    expect(growerKeys.slice(1).every((key) => key < 0)).toBe(true);
    const before = await picture(canvasId);

    await purge.begin({
      userId: "grower",
      runId: randomUUID(),
      trigger: "button",
      startedAt: now,
      canvasIds: [],
    });
    await purge.purgeTraces("grower");
    await purge.purgeAccountKeys("grower");
    await purge.finish("grower");

    expect(await picture(canvasId)).toEqual(before);
    for (const step of [0, 1, 2, 3])
      expect(await redis.lindex(keys.hist(cellKeyAt(corner, 12 - 3 * step, 12 - 3 * step)), 0)).toMatch(
        new RegExp(`^${DELETED_AUTHOR}:2:`),
      );
    expect(sortedKeys(await redis.smembers(keys.cells(DELETED_AUTHOR)))).toEqual(sortedKeys(growerKeys));
    expect(await redis.smembers(keys.cells("grower"))).toEqual([]);
    expect(await core.inspect(canvasId, 3, 3)).toMatchObject({ userId: DELETED_AUTHOR, colorIndex: 2 });
  });

  // Sauvegarder puis restaurer : l'image et les piles sont celles d'avant, le coin est gardé dans `meta`
  it("saves then restores a canvas with a negative corner: same image, same piles, same corner", async () => {
    const { canvasId, keys, corner } = await scene();
    const snapshot = await source.getCanvasSnapshot(canvasId, [], now);
    if (!snapshot) throw new Error("pas de snapshot");
    expect(snapshot.meta).toMatchObject({ cornerX: "-12", cornerY: "-12" });
    expect(snapshot.cells).toHaveLength(9 + 4); // le bloc de A (dont une case sous B, vue par B) et les 4 poses du pion
    const stateBefore = new Uint8Array((await redis.getBuffer(keys.state)) ?? []);
    const headsOf = async () =>
      [...(await harness.listPiles(canvasId))]
        .map(([cellKey, { author, colorIndex }]) => [cellKey, author, colorIndex])
        .sort(([left], [right]) => Number(left) - Number(right));
    const headsBefore = await headsOf();
    const found: string[] = [];
    for await (const names of redis.scanStream({ match: `cv:${canvasId}:*`, count: 100_000 }))
      found.push(...names);
    await redis.unlink(...found);

    expect(await target.beginRestore(canvasId)).toBe("begun");
    const version = snapshot.version + RECOVERY_VERSION_JUMP;
    await target.restore(canvasId, { snapshot, users: [], version, at: now });

    expect(new Uint8Array((await redis.getBuffer(keys.state)) ?? [])).toEqual(stateBefore);
    expect(await headsOf()).toEqual(headsBefore);
    expect(await cornerOfCanvas(canvasId)).toEqual(corner);
    expect(await core.inspect(canvasId, 21, 21)).toMatchObject({ userId: "author-b", colorIndex: 6 });
    expect(await core.inspect(canvasId, 20, 20)).toMatchObject({ userId: "author-a", colorIndex: 5 });
  });
});

describe("la grille fixe : les données d'avant (JOURNAL 2026-11-05)", () => {
  // Des piles d'avant, hors du cadre jusqu'aux cases 253 à 255 de la grille 256 × 256 : une croissance les poussait hors de la grille
  const staleCells = [
    [253, 253],
    [255, 255],
    [255, 3],
    [3, 255],
    [254, 100],
  ] as const;
  const entryOf = (index: number) => `ghost:${5 + index}:1:1:p1abcdefgh`;

  it("keeps every old pile outside the frame, down to the cells 253 to 255, through 10 growths to the left and to the top", async () => {
    const { canvasId, keys } = await dynamicCanvas(20, 20);
    await redis.hset(keys.meta, "resizedAtVersion", 1);
    for (const [index, [x, y]] of staleCells.entries()) {
      await redis.rpush(keys.hist(toCellKey(x, y)), entryOf(index));
      await redis.sadd(keys.cells("ghost"), toCellKey(x, y));
    }

    await growLeftAndTop(canvasId, 10);

    expect(await cornerOfCanvas(canvasId)).toEqual({ x: -30, y: -30 });
    for (const [index, [x, y]] of staleCells.entries())
      expect(await redis.lrange(keys.hist(toCellKey(x, y)), 0, -1)).toEqual([entryOf(index)]);
    expect(sortedKeys(await redis.smembers(keys.cells("ghost")))).toEqual(
      sortedKeys(staleCells.map(([x, y]) => toCellKey(x, y))),
    );
    expect(await pileKeys(canvasId)).toHaveLength(staleCells.length + 10);
  });

  // L'activation resserre sur tous les dessins, ceux de l'ancien plan compris : rien ne reste hors du cadre
  it("brings every old drawing back whole at the activation, down to the cells 253 to 255", async () => {
    const { canvasId, keys } = await harness.readyCanvas(richMeta(50, 50));
    await redis.hset(keys.meta, "resizedAtVersion", 1);
    const ghost = drawing(253, 253, 3, 3);
    for (const { x, y, colorIndex } of ghost) {
      await redis.rpush(keys.hist(toCellKey(x, y)), `ghost:${colorIndex}:1:1:p1abcdefgh`);
      await redis.sadd(keys.cells("ghost"), toCellKey(x, y));
    }
    await harness.placeInBatches(canvasId, "author-e", "pauthore01", drawing(10, 10, 3, 3), now);

    expect(await core.setDynamicSize(canvasId, { by: OWNER, isDynamicSize: true })).toEqual({
      ok: true,
      value: undefined,
    });

    expect(await core.getCanvas(canvasId)).toMatchObject({ width: 252, height: 252, isDynamicSize: true });
    expect(await picture(canvasId)).toHaveLength(18);
    expect(await harness.locateDrawing(canvasId, "ghost", 3, 3)).toMatchObject({ count: 9, torn: 0 });
    expect(await harness.locateDrawing(canvasId, "author-e", 3, 3)).toMatchObject({ count: 9, torn: 0 });
    // Le dessin d'avant garde sa place relative : 243 cases à droite et en bas de celui d'E
    const { x, y } = await harness.locateDrawing(canvasId, "ghost", 3, 3);
    const origin = await harness.locateDrawing(canvasId, "author-e", 3, 3);
    expect([x - origin.x, y - origin.y]).toEqual([243, 243]);
  });
});

describe("la grille fixe : une série au hasard près des bords gauche et haut (JOURNAL 2026-11-05)", () => {
  // Des blocs de 3 × 3 aux couleurs distinctes, puis des poses près du bord gauche ou du bord haut d'une fresque dynamique, des
  // activations et des retraits : chaque bloc revient entier, et aucune pile colorée ne se trouve à gauche du cadre ou au-dessus.
  it("keeps every 3×3 block whole, and no coloured pile left of the frame or above it", async () => {
    const next = seeded(20261106);
    const { canvasId, keys } = await harness.readyCanvas(richMeta(100, 100));
    const authors: string[] = [];
    const addBlock = async (x: number, y: number) => {
      authors.push(`block-${authors.length}`);
      await harness.placeInBatches(
        canvasId,
        authors.at(-1) ?? "",
        `pblock${authors.length}`,
        drawing(x, y, 3, 3),
        now,
      );
    };
    for (let slot = 0; slot < 9; slot++) await addBlock(40 + (slot % 3) * 4, 40 + Math.floor(slot / 3) * 4);

    // Un bloc à 0, 1 ou 2 cases du bord gauche ou du bord haut, sur des cases libres : la fresque grandit de ce côté
    const addBlockNearLeftOrTop = async () => {
      const { width, height } = (await core.getCanvas(canvasId)) ?? { width: 0, height: 0 };
      const [isLeft, edge, rest] = [next() < 0.5, Math.floor(next() * 3), next()];
      const [x, y] = isLeft
        ? [edge, Math.floor(rest * (height - 3))]
        : [Math.floor(rest * (width - 3)), edge];
      const [taken, corner] = [await harness.listPiles(canvasId), await cornerOfCanvas(canvasId)];
      const isFree = drawing(x, y, 3, 3).every((pixel) => !taken.has(cellKeyAt(corner, pixel.x, pixel.y)));
      if (isFree) await addBlock(x, y);
    };

    // Les piles colorées restent à droite ou en bas du cadre (ou dedans), jamais à sa gauche ni au-dessus
    const expectNothingBeyondTheCorner = async () => {
      const corner = await cornerOfCanvas(canvasId);
      for (const [cellKey, { colorIndex }] of await harness.listPiles(canvasId)) {
        const { x, y } = cellAt(corner, cellKey);
        if (colorIndex !== 0)
          expect({ cellKey, isBeyond: x < 0 || y < 0 }).toEqual({ cellKey, isBeyond: false });
      }
    };

    let isDynamic = false;
    for (let step = 0; step < 30; step++) {
      const roll = next();
      if (isDynamic && roll < 0.15) {
        await core.setDynamicSize(canvasId, { by: OWNER, isDynamicSize: false });
        isDynamic = false;
      } else if (isDynamic) {
        await addBlockNearLeftOrTop();
      } else if (roll < 0.5) {
        await core.setDynamicSize(canvasId, { by: OWNER, isDynamicSize: true });
        isDynamic = true;
      } else {
        await core.resizeCanvas(canvasId, {
          by: OWNER,
          width: 8 + Math.floor(next() * 70),
          height: 8 + Math.floor(next() * 70),
        });
      }
      await expectNothingBeyondTheCorner();
    }
    if (isDynamic) await core.setDynamicSize(canvasId, { by: OWNER, isDynamicSize: false });
    await core.resizeCanvas(canvasId, { by: OWNER, width: 256, height: 256 });

    const piles = await harness.listPiles(canvasId);
    const corner = await cornerOfCanvas(canvasId);
    const found = authors.map((author) => locateIn(piles, author, 3, 3, corner));
    expect(found.map(({ count, torn }) => ({ count, torn }))).toEqual(
      authors.map(() => ({ count: 9, torn: 0 })),
    );
    expect(authors.length).toBeGreaterThan(12);
    const state = (await redis.getBuffer(keys.state)) ?? Buffer.alloc(0);
    expect(state.length).toBe(256 * 256);
    expect(state.filter((colorIndex) => colorIndex !== 0)).toHaveLength(9 * authors.length);
    expect(patternAt(0, 0)).toBe(1); // les couleurs d'un bloc sont celles de `drawing`
  }, 120_000);
});

describe("la grille fixe : grandir à gauche prend quelques millisecondes (JOURNAL 2026-11-05)", () => {
  // `reframe` ne parcourt plus le plan : la durée ne dépend plus de la taille de la fresque, ni du nombre de piles
  const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

  for (const size of [20, 200]) {
    it(`grows a ${size}×${size} canvas to the left in a few milliseconds`, async () => {
      const { canvasId } = await dynamicCanvas(size, size);
      await harness.placeInBatches(canvasId, "author-a", "pfull00001", drawing(8, 8, size / 5, 8), now);
      const durations: number[] = [];
      for (let growth = 0; growth < 5; growth++) {
        const startedAt = performance.now();
        await placeAs(canvasId, "grower", `pspeed${growth}`, [{ x: 0, y: size / 2, colorIndex: 2 }]);
        durations.push(performance.now() - startedAt);
      }

      console.info(
        `une croissance à gauche, ${size}×${size} : médiane ${Math.round(median(durations) * 10) / 10} ms`,
      );
      expect(await cornerOfCanvas(canvasId)).toEqual({ x: -15, y: 0 });
      expect(median(durations)).toBeLessThan(40);
      expect(CANVAS_WIDTH * CANVAS_HEIGHT).toBe(65_536); // le plan que l'ancien parcours lisait à chaque croissance
    });
  }
});
