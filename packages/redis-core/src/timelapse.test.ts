import { randomUUID } from "node:crypto";
import { type CanvasMeta, defaultCanvasMeta } from "@liveplace/domain";
import type { Pixel } from "@liveplace/domain/ports";
import { createTimelapseBuilder } from "@liveplace/domain/timelapse";
import { describe, expect, it } from "vitest";
import { buildCanvasKeys } from "./keys";
import { createRedisHarness } from "./test-harness";
import { createTimelapseSource } from "./timelapse";

const harness = createRedisHarness();
const { redis, core } = harness;
const source = createTimelapseSource(redis);

const OWNER = "owner-1";
const now = 1_700_000_000_000;
const meta: CanvasMeta = {
  ...defaultCanvasMeta(OWNER),
  width: 20,
  height: 20,
  gaugeMaxStart: 100,
  refillMs: 1000,
};

// Une fresque dont la taille dynamique est déjà activée (comme dynamic-size.test.ts).
const dynamicCanvas = async () => {
  const created = await harness.readyCanvas(meta);
  await redis.hset(created.keys.meta, "dynamicSize", 1);
  return created.canvasId;
};

const placeAs = async (canvasId: string, userId: string, pixels: Pixel[]) => {
  const result = await core.place(canvasId, {
    userId,
    requestId: randomUUID(),
    placementId: `p${randomUUID().replaceAll("-", "").slice(0, 15)}`,
    nowMs: now,
    pixels,
  });
  if (!result.ok || result.value.accepted !== pixels.length) throw new Error(`pose refusée pour ${userId}`);
};

// Le chemin du web : l'image et les piles, puis le flux, rejoués.
const timelapseOf = async (canvasId: string) => {
  const frame = await source.getFrame(canvasId);
  if (!frame) throw new Error("canvas absent");
  const builder = createTimelapseBuilder(frame);
  for await (const entry of source.listStreamEntries(canvasId, 0)) builder.add(entry);
  const result = builder.finish();
  if (!result.ok) throw new Error(result.error);
  const { width, changes, initial } = result.value;
  const shown = initial.slice();
  for (const packed of changes) shown[packed >>> 8] = packed & 0xff;
  return {
    state: frame.state,
    initial,
    shown,
    changes: Array.from(changes, (packed) => [
      (packed >>> 8) % width,
      Math.floor((packed >>> 8) / width),
      packed & 0xff,
    ]),
  };
};

describe("the timelapse read from Redis (JOURNAL 2026-11-11)", () => {
  // Quand la fresque a grandi à gauche sans rien écrire dans le flux, alors chaque pose est rejouée à sa place d'aujourd'hui.
  it("replays every pose where it is today after the canvas grew to the left", async () => {
    const canvasId = await dynamicCanvas();
    await placeAs(
      canvasId,
      "author-a",
      [10, 11, 12, 13, 14].map((x) => ({ x, y: 10, colorIndex: 5 })),
    );
    await placeAs(canvasId, "author-b", [{ x: 12, y: 10, colorIndex: 6 }]);
    await placeAs(canvasId, "author-c", [{ x: 1, y: 10, colorIndex: 7 }]); // grandit de 2 colonnes à gauche

    const timelapse = await timelapseOf(canvasId);

    expect(timelapse.changes).toEqual([
      [12, 10, 5],
      [13, 10, 5],
      [14, 10, 5],
      [15, 10, 5],
      [16, 10, 5],
      [14, 10, 6],
      [3, 10, 7],
    ]);
    expect(timelapse.shown).toEqual(timelapse.state);
  });

  // Quand la fresque grandit à gauche et en haut sous coordonnées fixes, reçoit de nouvelles poses, puis qu'une réduction rapproche
  // un dessin, alors chaque pose est rejouée à sa place finale et la dernière image est `state` (JOURNAL 2026-11-11).
  it("replays each pose at its final place after growths to the left and to the top, then a reduction", async () => {
    const { canvasId, keys } = await harness.readyCanvas({ ...meta, width: 60 });
    await redis.hset(keys.meta, "dynamicSize", 1);
    await placeAs(
      canvasId,
      "author-a",
      [10, 11, 12, 13, 14].map((x) => ({ x, y: 10, colorIndex: 5 })),
    );
    await placeAs(canvasId, "author-c", [{ x: 1, y: 10, colorIndex: 7 }]); // grandit de 2 colonnes à gauche
    await placeAs(canvasId, "author-d", [{ x: 30, y: 1, colorIndex: 8 }]); // grandit de 2 lignes en haut
    await placeAs(
      canvasId,
      "author-e",
      [50, 51, 52].map((x) => ({ x, y: 12, colorIndex: 9 })),
    );
    await placeAs(canvasId, "author-b", [{ x: 14, y: 12, colorIndex: 6 }]); // recouvre la 3e case de la pose de author-a
    const placedByE = await core.listPixels(canvasId, "author-e");
    await redis.hset(keys.meta, "dynamicSize", 0);
    expect(await core.resizeCanvas(canvasId, { by: OWNER, width: 40, height: 22 })).toEqual({
      ok: true,
      value: undefined,
    });
    const cellsOf = async (userId: string) =>
      (await core.listPixels(canvasId, userId))
        .map(({ x, y, colorIndex }) => [x, y, colorIndex])
        .sort((left, right) => (left[1] ?? 0) - (right[1] ?? 0) || (left[0] ?? 0) - (right[0] ?? 0));
    const [a, b, c, d, e] = await Promise.all(
      ["author-a", "author-b", "author-c", "author-d", "author-e"].map(cellsOf),
    );
    const buriedByB = (b ?? []).map(([x, y]) => [x, y, 5]);
    const poseOfA = [...(a ?? []), ...buriedByB].sort((left, right) => (left[0] ?? 0) - (right[0] ?? 0));

    const timelapse = await timelapseOf(canvasId);

    expect(await core.listPixels(canvasId, "author-e")).not.toEqual(placedByE); // le dessin de author-e s'est rapproché
    expect(timelapse.changes).toEqual([...poseOfA, ...(c ?? []), ...(d ?? []), ...(e ?? []), ...(b ?? [])]);
    expect(timelapse.shown).toEqual(timelapse.state);
  });

  // Quand la modération retire tout un auteur, alors ses pixels ne s'affichent jamais, et la dernière image reste `state`.
  it("never shows the pixels of an author that the moderation cleared", async () => {
    const canvasId = await dynamicCanvas();
    await placeAs(canvasId, "author-bad", [{ x: 5, y: 5, colorIndex: 9 }]);
    await placeAs(canvasId, "author-good", [{ x: 6, y: 6, colorIndex: 4 }]);
    await core.moderate(canvasId, {
      by: OWNER,
      nowMs: now,
      action: { action: "clearUser", target: "author-bad" },
      slice: "first",
    });

    const timelapse = await timelapseOf(canvasId);

    expect(timelapse.changes).toEqual([[6, 6, 4]]);
    expect(timelapse.shown).toEqual(timelapse.state);
  });

  // Quand le flux est vide mais que les piles gardent les versions, alors la fresque se dessine dans l'ordre des poses.
  it("draws a canvas whose stream is empty from its piles", async () => {
    const canvasId = await dynamicCanvas();
    await placeAs(canvasId, "author-a", [{ x: 5, y: 5, colorIndex: 3 }]);
    await placeAs(canvasId, "author-b", [{ x: 8, y: 8, colorIndex: 4 }]);
    await redis.del(buildCanvasKeys(canvasId).events);

    const timelapse = await timelapseOf(canvasId);

    expect(timelapse.changes).toEqual([
      [5, 5, 3],
      [8, 8, 4],
    ]);
    expect(timelapse.shown).toEqual(timelapse.state);
  });

  // Quand on lit après une version, alors le flux rend les entrées qui la suivent, dans l'ordre des versions.
  it("lists the stream entries after a version, in order", async () => {
    const canvasId = await dynamicCanvas();
    for (const index of [0, 1, 2])
      await placeAs(canvasId, `author-${index}`, [{ x: 10 + index, y: 10, colorIndex: 2 }]);

    const versions: number[] = [];
    for await (const [version] of source.listStreamEntries(canvasId, 1)) versions.push(version);

    expect(versions).toEqual([2, 3]);
  });
});
