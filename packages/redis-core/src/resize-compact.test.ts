import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import {
  type CanvasMeta,
  defaultCanvasMeta,
  TRANSPARENT_COLOR_INDEX,
  toCellKey,
  toStateOffset,
} from "@liveplace/domain";
import type { Moderation, Pixel } from "@liveplace/domain/ports";
import { describe, expect, it, vi } from "vitest";
import { buildCanvasKeys } from "./keys";
import { createRedisHarness } from "./test-harness";

// Écart §5.3 (JOURNAL 2026-10-24) : réduire une fresque rapproche ses dessins avant de couper. Les cas de `planResize` sont dans
// le domain ; ici, ce que Redis en fait : les piles, les ensembles `cells:` et `clearing:`, `state`, `meta`.
const harness = createRedisHarness();
const { redis, core } = harness;

const OWNER = "owner-1";
const now = 1_700_000_000_000;
const later = now + 60_000;

const meta: CanvasMeta = {
  ...defaultCanvasMeta(OWNER),
  width: 100,
  height: 100,
  gaugeMaxStart: 100_000,
  gaugeMaxCeiling: 100_000,
  refillMs: 1000,
};

const readyCanvas = (overrides: Partial<CanvasMeta> = {}) => harness.readyCanvas({ ...meta, ...overrides });

const placeAs = (canvasId: string, userId: string, pixels: readonly Pixel[], placementId = "ptest0001") =>
  harness.placeInBatches(canvasId, userId, placementId, pixels, now);

const resize = (canvasId: string, width: number, height: number) =>
  core.resizeCanvas(canvasId, { by: OWNER, width, height });

const pixel = (x: number, y: number, colorIndex: number): Pixel => ({ x, y, colorIndex });

const row = (y: number, from: number, to: number, colorIndex: number): Pixel[] =>
  Array.from({ length: to - from + 1 }, (_, index) => pixel(from + index, y, colorIndex));

// Les gros canvas des mesures de temps rendent leurs clés eux-mêmes : le nettoyage du harnais ne tient pas 130 000 clés d'un coup.
const forget = async (canvasId: string): Promise<void> => {
  for await (const names of redis.scanStream({ match: `${buildCanvasKeys(canvasId).prefix}*`, count: 1000 }))
    if (names.length > 0) await redis.unlink(...names);
};

const hasPile = async (canvasId: string, x: number, y: number): Promise<boolean> =>
  (await redis.exists(buildCanvasKeys(canvasId).hist(toCellKey(x, y)))) === 1;

const isInCells = async (canvasId: string, userId: string, x: number, y: number): Promise<boolean> =>
  (await redis.sismember(buildCanvasKeys(canvasId).cells(userId), String(toCellKey(x, y)))) === 1;

const moderateAll = async (canvasId: string, action: Moderation["action"]) => {
  const slice = async (which: "first" | "next") => {
    const result = await core.moderate(canvasId, { by: OWNER, nowMs: later, action, slice: which });
    if (!result.ok) throw new Error(result.error);
    return result.value;
  };
  const slices = [await slice("first")];
  while (!slices.at(-1)?.isDone) slices.push(await slice("next"));
  return slices;
};

// Toutes les piles d'un canvas, par case : la tête (auteur et couleur) et la profondeur.
const listPiles = async (canvasId: string) => {
  const { histPrefix } = buildCanvasKeys(canvasId);
  const piles = new Map<number, { author: string; colorIndex: number; depth: number }>();
  for await (const names of redis.scanStream({ match: `${histPrefix}*`, count: 1000 }))
    for (const name of names) {
      const entries = await redis.lrange(name, 0, -1);
      const [author, colorIndex] = entries[0]?.split(":") ?? [];
      piles.set(Number(name.slice(histPrefix.length)), {
        author: author ?? "",
        colorIndex: Number(colorIndex),
        depth: entries.length,
      });
    }
  return piles;
};

// Ce que tout rapprochement doit laisser vrai : `state` est la tête de chaque pile dans le cadre, et `cells:` est exactement les
// cases dont l'auteur est la tête.
const expectConsistent = async (canvasId: string, authors: readonly string[]) => {
  const keys = buildCanvasKeys(canvasId);
  const [width, height] = (await redis.hmget(keys.meta, "width", "height")).map(Number);
  const state = await redis.getBuffer(keys.state);
  const piles = await listPiles(canvasId);
  expect(state?.length).toBe((width ?? 0) * (height ?? 0));
  for (let y = 0; y < (height ?? 0); y++)
    for (let x = 0; x < (width ?? 0); x++)
      expect(state?.[toStateOffset(x, y, width ?? 0)]).toBe(piles.get(toCellKey(x, y))?.colorIndex ?? 0);
  for (const author of authors) {
    const members = (await redis.smembers(keys.cells(author))).map(Number).sort((a, b) => a - b);
    const heads = [...piles]
      .filter(([, pile]) => pile.author === author)
      .map(([cellKey]) => cellKey)
      .sort((a, b) => a - b);
    expect(members).toEqual(heads);
  }
};

describe("resizeCanvas brings drawings closer (Écart §5.3, JOURNAL 2026-10-24)", () => {
  // La pile, l'auteur et la couleur suivent le pixel ; l'ancienne case n'a plus rien
  it("moves the pile, the author and the color along with the pixel", async () => {
    const { canvasId, keys } = await readyCanvas();
    await placeAs(canvasId, "author-a", [pixel(5, 5, 5), pixel(6, 5, 6)]);
    await placeAs(canvasId, "author-b", [pixel(80, 5, 7)], "pother001");

    expect(await resize(canvasId, 50, 50)).toEqual({ ok: true, value: undefined });

    expect(await harness.colorAt(canvasId, 49, 5, 50)).toBe(7);
    expect(await harness.colorAt(canvasId, 5, 5, 50)).toBe(5);
    expect(await core.inspect(canvasId, 49, 5)).toEqual(
      expect.objectContaining({ userId: "author-b", colorIndex: 7, placementId: "pother001" }),
    );
    expect(await core.inspect(canvasId, 80, 5)).toBeNull();
    expect(await core.listPixels(canvasId, "author-b")).toEqual([
      expect.objectContaining({ x: 49, y: 5, colorIndex: 7, placementId: "pother001" }),
    ]);
    expect(await hasPile(canvasId, 80, 5)).toBe(false);
    expect(await isInCells(canvasId, "author-b", 49, 5)).toBe(true);
    expect(await isInCells(canvasId, "author-b", 80, 5)).toBe(false);
    expect(await redis.strlen(keys.state)).toBe(2500);
  });

  // Toute la pile d'une case suit, avec l'auteur de la tête : celui du dessous ne la liste pas
  it("moves the whole pile of a cell, and only the head author lists it", async () => {
    const { canvasId } = await readyCanvas();
    await placeAs(canvasId, "author-a", [pixel(5, 5, 5)]);
    await placeAs(canvasId, "author-b", [pixel(80, 5, 6)], "pother001");
    await placeAs(canvasId, "author-c", [pixel(80, 5, 7)], "pother002");

    await resize(canvasId, 50, 50);

    const entries = await redis.lrange(buildCanvasKeys(canvasId).hist(toCellKey(49, 5)), 0, -1);
    expect(entries.map((entry) => entry.split(":")[0])).toEqual(["author-c", "author-b"]);
    expect(await isInCells(canvasId, "author-c", 49, 5)).toBe(true);
    expect(await isInCells(canvasId, "author-b", 49, 5)).toBe(false);
    expect(await isInCells(canvasId, "author-b", 80, 5)).toBe(false);
    await expectConsistent(canvasId, ["author-a", "author-b", "author-c"]);
  });

  // Seul un rapprochement qui déplace un pixel marque sa version ; une simple coupe ne la change pas
  it("marks movedAtVersion only when a placed pixel moved", async () => {
    const { canvasId, keys } = await readyCanvas();
    await placeAs(canvasId, "author-a", [pixel(5, 5, 5), pixel(80, 5, 7)]);

    await resize(canvasId, 100, 50);
    expect(await redis.hget(keys.meta, "movedAtVersion")).toBeNull();
    expect((await core.getCanvas(canvasId))?.movedAtVersion).toBeUndefined();

    await resize(canvasId, 50, 50);
    expect(await redis.hget(keys.meta, "movedAtVersion")).toBe("3");
    expect(await redis.hget(keys.meta, "resizedAtVersion")).toBe("3");
    expect((await core.getCanvas(canvasId))?.movedAtVersion).toBe(3);

    await resize(canvasId, 50, 30);
    expect((await core.getCanvas(canvasId))?.movedAtVersion).toBe(3);
  });

  // Une case vide qui garde une pile (une gomme) la perd avec sa colonne retirée, et la garde quand sa colonne reste
  it("drops the pile of an empty cell in a dropped column, and moves the one in a kept column", async () => {
    const { canvasId } = await readyCanvas();
    await placeAs(canvasId, "author-a", [pixel(2, 0, 5), pixel(30, 0, 6)]);
    await placeAs(canvasId, "author-b", [
      pixel(12, 0, TRANSPARENT_COLOR_INDEX), // dans le vide, à garder en place
      pixel(25, 0, TRANSPARENT_COLOR_INDEX), // dans le vide, retirée avec sa colonne
      pixel(30, 1, TRANSPARENT_COLOR_INDEX), // sous un dessin, suit sa colonne
    ]);

    await resize(canvasId, 20, 100);

    expect(await hasPile(canvasId, 12, 0)).toBe(true);
    expect(await hasPile(canvasId, 25, 0)).toBe(false);
    expect(await hasPile(canvasId, 30, 1)).toBe(false);
    expect(await hasPile(canvasId, 19, 1)).toBe(true);
    expect(await harness.colorAt(canvasId, 19, 0, 20)).toBe(6);
    await expectConsistent(canvasId, ["author-a", "author-b"]);
  });

  // Retirer les pixels d'un auteur, ou d'une pose, retrouve ses cases à leur nouvelle place
  it("clears the right cells after a shrink: by author, and by placement", async () => {
    const { canvasId } = await readyCanvas();
    await placeAs(canvasId, "troll", [pixel(5, 5, 5), pixel(80, 5, 6)], "ptroll001");
    await placeAs(canvasId, "troll", [pixel(6, 5, 7)], "ptroll002");
    await placeAs(canvasId, "friend", [pixel(7, 5, 8)], "pfriend01");
    await resize(canvasId, 50, 50);

    const byPlacement = await moderateAll(canvasId, {
      action: "clearPlacement",
      target: "troll",
      placementId: "ptroll001",
    });
    expect(byPlacement.reduce((cells, slice) => cells + slice.cells, 0)).toBe(2);
    expect(await harness.colorAt(canvasId, 5, 5, 50)).toBe(0);
    expect(await harness.colorAt(canvasId, 49, 5, 50)).toBe(0);
    expect(await harness.colorAt(canvasId, 6, 5, 50)).toBe(7);

    const byAuthor = await moderateAll(canvasId, { action: "clearUser", target: "troll" });
    expect(byAuthor.reduce((cells, slice) => cells + slice.cells, 0)).toBe(1);
    expect(await harness.colorAt(canvasId, 6, 5, 50)).toBe(0);
    expect(await harness.colorAt(canvasId, 7, 5, 50)).toBe(8);
    expect(await core.listPixels(canvasId, "troll")).toEqual([]);
    await expectConsistent(canvasId, ["troll", "friend"]);
  });

  // Un retrait en tranches commencé avant le rapprochement finit sur les bonnes cases
  it("finishes a clear begun before a shrink on the right cells", async () => {
    const { canvasId, keys } = await readyCanvas({ width: 256, height: 256 });
    const block = Array.from({ length: 4100 }, (_, index) =>
      pixel(100 + (index % 41), Math.floor(index / 41), 6),
    );
    await placeAs(canvasId, "troll", block);
    await placeAs(canvasId, "friend", [pixel(0, 0, 9)], "pfriend01");
    const clearUser = { action: "clearUser", target: "troll" } as const;
    const first = await core.moderate(canvasId, {
      by: OWNER,
      nowMs: later,
      action: clearUser,
      slice: "first",
    });
    expect(first).toEqual({ ok: true, value: expect.objectContaining({ isDone: false }) });
    expect(await redis.scard(keys.clearing("troll"))).toBeGreaterThan(0);

    expect(await resize(canvasId, 60, 256)).toEqual({ ok: true, value: undefined });
    let last = await core.moderate(canvasId, { by: OWNER, nowMs: later, action: clearUser, slice: "next" });
    while (last.ok && !last.value.isDone)
      last = await core.moderate(canvasId, { by: OWNER, nowMs: later, action: clearUser, slice: "next" });

    expect(last).toEqual({ ok: true, value: expect.objectContaining({ isDone: true }) });
    expect(await redis.exists(keys.clearing("troll"))).toBe(0);
    expect(await core.listPixels(canvasId, "troll")).toEqual([]);
    const state = await redis.getBuffer(keys.state);
    expect(state?.filter((colorIndex) => colorIndex === 6)).toHaveLength(0);
    expect(state?.[toStateOffset(0, 0, 60)]).toBe(9);
    await expectConsistent(canvasId, ["troll", "friend"]);
  }, 60_000);

  // Signaler la pose d'une case déplacée marche à sa nouvelle place, et plus à l'ancienne
  it("reports a moved cell at its new place, and refuses its old place", async () => {
    const { canvasId } = await readyCanvas();
    await placeAs(canvasId, "author-a", [pixel(5, 5, 5)]);
    await placeAs(canvasId, "author-b", [pixel(80, 5, 7)], "pother001");
    await resize(canvasId, 50, 50);
    const report = (x: number, y: number) =>
      core.report(canvasId, {
        reporterId: "viewer-1",
        x,
        y,
        placementId: "pother001",
        threshold: 1,
        nowMs: later,
      });

    expect(await report(80, 5)).toEqual({ ok: false, error: "changed" });
    expect(await report(49, 5)).toEqual({ ok: true, value: undefined });
    expect(await core.listReports(canvasId)).toEqual([
      expect.objectContaining({
        userId: "author-b",
        placementId: "pother001",
        pixels: [{ x: 49, y: 5, colorIndex: 7 }],
      }),
    ]);
    expect(await core.listAuthorPixels(canvasId, 49, 5, "pother001")).toEqual([
      expect.objectContaining({ x: 49, y: 5 }),
    ]);
  });

  // Les pixels déjà cachés par une réduction d'avant ne bougent pas, et reviennent à l'agrandissement
  it("leaves the pixels already outside the frame where they are, and brings them back on growth", async () => {
    const { canvasId } = await readyCanvas();
    await placeAs(canvasId, "author-a", [...row(10, 0, 59, 5), pixel(5, 40, 6)]);
    await resize(canvasId, 50, 50);
    expect(await hasPile(canvasId, 55, 10)).toBe(true);

    await resize(canvasId, 40, 40);

    expect(await hasPile(canvasId, 55, 10)).toBe(true);
    expect(await harness.colorAt(canvasId, 5, 40 - 1, 40)).toBe(6);

    await resize(canvasId, 100, 100);

    for (const x of [0, 39, 45, 55, 59]) expect(await harness.colorAt(canvasId, x, 10, 100)).toBe(5);
    expect(await harness.colorAt(canvasId, 60, 10, 100)).toBe(0);
    await expectConsistent(canvasId, ["author-a"]);
  });

  // Agrandir ne bouge rien, même après un rapprochement
  it("moves nothing when growing, right after a shrink", async () => {
    const { canvasId, keys } = await readyCanvas({ width: 16, height: 8 });
    await placeAs(canvasId, "author-a", [
      ...row(0, 0, 2, 1),
      ...row(1, 0, 2, 1),
      pixel(13, 0, 2),
      pixel(15, 2, 2),
    ]);
    await resize(canvasId, 8, 4);
    const shrunk = await redis.hget(keys.meta, "movedAtVersion");
    const before = [...(await listPiles(canvasId)).keys()].sort((a, b) => a - b);

    await resize(canvasId, 16, 8);

    expect(await redis.hget(keys.meta, "movedAtVersion")).toBe(shrunk);
    expect([...(await listPiles(canvasId)).keys()].sort((a, b) => a - b)).toEqual(before);
    await expectConsistent(canvasId, ["author-a"]);
  });
});

describe("resizeCanvas under concurrent placements (Écart §5.3, JOURNAL 2026-10-24)", () => {
  // Une pose qui passe entre la lecture et l'application fait refuser le plan : le client relit et recommence
  it("tries again when a placement ran between the read and the apply", async () => {
    const { canvasId } = await readyCanvas();
    await placeAs(canvasId, "author-a", [pixel(5, 5, 5), pixel(80, 5, 7)]);
    const original = redis.resize.bind(redis);
    let interferences = 1;
    const spy = vi.spyOn(redis, "resize").mockImplementation(async (...args) => {
      if (interferences-- > 0) await placeAs(canvasId, "author-b", [pixel(81, 5, 9)], "pother001");
      return original(...args);
    });

    const result = await resize(canvasId, 50, 50);
    const attempts = spy.mock.calls.length;
    spy.mockRestore();

    expect(result).toEqual({ ok: true, value: undefined });
    expect(attempts).toBe(2);
    // Le pixel posé pendant le premier essai est dans le plan du second : il se rapproche avec les autres.
    expect(await harness.colorAt(canvasId, 48, 5, 50)).toBe(7);
    expect(await harness.colorAt(canvasId, 49, 5, 50)).toBe(9);
    await expectConsistent(canvasId, ["author-a", "author-b"]);
  });

  // Toujours en retard, il rend `busy` et ne touche à rien
  it("answers busy after several attempts, and moves nothing", async () => {
    const { canvasId, keys } = await readyCanvas();
    await placeAs(canvasId, "author-a", [pixel(5, 5, 5), pixel(80, 5, 7)]);
    const before = await redis.getBuffer(keys.state);
    const original = redis.resize.bind(redis);
    const spy = vi.spyOn(redis, "resize").mockImplementation(async (...args) => {
      const placementId = `p${randomUUID().replaceAll("-", "").slice(0, 15)}`;
      await placeAs(canvasId, "author-b", [pixel(randomInt(), randomInt(), 9)], placementId);
      return original(...args);
    });

    const result = await resize(canvasId, 50, 50);
    const attempts = spy.mock.calls.length;
    spy.mockRestore();

    expect(result).toEqual({ ok: false, error: "busy" });
    expect(attempts).toBeGreaterThan(1);
    expect(await redis.hmget(keys.meta, "width", "height", "resizedAtVersion", "movedAtVersion")).toEqual([
      "100",
      "100",
      null,
      null,
    ]);
    expect(await redis.strlen(keys.state)).toBe(before?.length);
    expect(await hasPile(canvasId, 80, 5)).toBe(true);
  });
});

const randomInt = (): number => 50 + Math.floor(Math.random() * 40);

// Un générateur à graine : le scénario est le même à chaque lancement.
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let mixed = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
  return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
};

describe("resizeCanvas keeps Redis consistent (Écart §5.3, JOURNAL 2026-10-24)", () => {
  // Des poses qui se recouvrent, des gommes, puis des réductions et des agrandissements en série
  it("keeps `state`, the piles and the author sets consistent through shrinks and growths", async () => {
    const { canvasId } = await readyCanvas({ width: 40, height: 40 });
    const next = seeded(20261024);
    const authors = ["author-a", "author-b", "author-c"];
    for (let pose = 0; pose < 30; pose++) {
      const x0 = Math.floor(next() * 38);
      const y0 = Math.floor(next() * 38);
      const pixels = Array.from({ length: 1 + Math.floor(next() * 12) }, () =>
        pixel(
          Math.min(39, x0 + Math.floor(next() * 4)),
          Math.min(39, y0 + Math.floor(next() * 4)),
          next() < 0.2 ? TRANSPARENT_COLOR_INDEX : 1 + Math.floor(next() * 40),
        ),
      );
      await placeAs(canvasId, authors[pose % 3] ?? "author-a", pixels, `pose${pose}0001`);
    }
    await expectConsistent(canvasId, authors);

    for (const [width, height] of [
      [30, 30],
      [20, 35],
      [40, 40],
      [15, 15],
      [25, 12],
      [40, 40],
      [8, 8],
    ] as const) {
      expect(await resize(canvasId, width, height)).toEqual({ ok: true, value: undefined });
      await expectConsistent(canvasId, authors);
    }
  }, 60_000);
});

describe("resizeCanvas speed (Écart §5.3, JOURNAL 2026-10-24)", () => {
  // Une fresque 256×256 pleine, dont toutes les cases ont une pile : rien ne bouge, tout se coupe
  it("cuts a full 256×256 canvas fast", async () => {
    const { canvasId } = await readyCanvas({ width: 256, height: 256 });
    const everything = Array.from({ length: 256 * 256 }, (_, index) =>
      pixel(index % 256, Math.floor(index / 256), 5),
    );
    await placeAs(canvasId, "author-a", everything);

    const startedAt = performance.now();
    const result = await resize(canvasId, 100, 100);
    const elapsed = performance.now() - startedAt;
    console.info(`resizeCanvas, 256×256 pleine, coupée en 100×100 : ${Math.round(elapsed)} ms`);

    expect(result).toEqual({ ok: true, value: undefined });
    expect(elapsed).toBeLessThan(2000);
    await forget(canvasId);
  }, 120_000);

  // Le pire cas : seule la colonne 0 est vide, les 65 280 autres piles se déplacent d'une colonne
  it("moves all 65280 piles of an almost full 256×256 canvas fast", async () => {
    const { canvasId } = await readyCanvas({ width: 256, height: 256 });
    const almost = Array.from({ length: 255 * 256 }, (_, index) =>
      pixel(1 + (index % 255), Math.floor(index / 255), 5),
    );
    await placeAs(canvasId, "author-a", almost);

    const startedAt = performance.now();
    const result = await resize(canvasId, 255, 256);
    const elapsed = performance.now() - startedAt;
    console.info(`resizeCanvas, 256×256 presque pleine, 65 280 piles déplacées : ${Math.round(elapsed)} ms`);

    expect(result).toEqual({ ok: true, value: undefined });
    expect(elapsed).toBeLessThan(2000);
    expect(await harness.colorAt(canvasId, 0, 0, 255)).toBe(5);
    expect(await harness.colorAt(canvasId, 254, 255, 255)).toBe(5);
    await forget(canvasId);
  }, 120_000);
});
