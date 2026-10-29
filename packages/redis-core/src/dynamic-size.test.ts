import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import {
  type CanvasMeta,
  type CanvasOrigin,
  CELL_STRIDE,
  defaultCanvasMeta,
  toCellKey,
  toStateOffset,
} from "@liveplace/domain";
import { planGrowth } from "@liveplace/domain/dynamic-size";
import type { LiveMessage, Moderation, Pixel } from "@liveplace/domain/ports";
import { describe, expect, it } from "vitest";
import { buildCanvasKeys } from "./keys";
import { createRedisHarness } from "./test-harness";

const harness = createRedisHarness();
const { redis, core } = harness;

const OWNER = "owner-1";
const now = 1_700_000_000_000;

const meta = (width: number, height: number): CanvasMeta => ({
  ...defaultCanvasMeta(OWNER),
  width,
  height,
  gaugeMaxStart: 100,
  refillMs: 1000,
});

// Une fresque dont la taille dynamique est déjà activée : sa taille ne bouge pas, contrairement à `setDynamicSize`.
const dynamicCanvas = async (width: number, height: number) => {
  const created = await harness.readyCanvas(meta(width, height));
  await redis.hset(created.keys.meta, "dynamicSize", 1);
  return created;
};

const placeAs = async (canvasId: string, userId: string, pixels: Pixel[], origin?: CanvasOrigin) => {
  const result = await core.place(canvasId, {
    userId,
    requestId: randomUUID(),
    placementId: `p${randomUUID().replaceAll("-", "").slice(0, 15)}`,
    nowMs: now,
    ...(origin ? { origin } : {}),
    pixels,
  });
  if (!result.ok) throw new Error("canvas absent");
  return result.value;
};

const canvasOf = async (canvasId: string) => {
  const found = await core.getCanvas(canvasId);
  if (!found) throw new Error("canvas absent");
  return found;
};

// Les pixels posés de `state`, de gauche à droite puis de haut en bas : l'image que voit une page.
const picture = async (canvasId: string) => {
  const { width, height } = await canvasOf(canvasId);
  const state = await redis.getBuffer(buildCanvasKeys(canvasId).state);
  const found: { x: number; y: number; colorIndex: number }[] = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const colorIndex = state?.[toStateOffset(x, y, width)] ?? 0;
      if (colorIndex !== 0) found.push({ x, y, colorIndex });
    }
  return found;
};

const sortedKeys = (keys: string[]) => keys.map(Number).sort((a, b) => a - b);

// Un carré plein de `size` cases de côté, de gauche à droite puis de haut en bas.
const block = (x0: number, y0: number, size: number, colorIndex: number): Pixel[] =>
  Array.from({ length: size * size }, (_, index) => ({
    x: x0 + (index % size),
    y: y0 + Math.floor(index / size),
    colorIndex,
  }));

const clearUser = (target: string): Moderation => ({
  by: OWNER,
  nowMs: now,
  action: { action: "clearUser", target },
  slice: "first",
});

describe("la taille dynamique : grandir avec la pose (Écart §5.3, JOURNAL 2026-10-28)", () => {
  // Un pixel posé à 1 colonne du bord droit agrandit la fresque de ce côté, juste assez pour retrouver 3 colonnes vides
  it("a pixel placed at x = 18 of a 20×20 canvas widens it to 22, leaving columns 19, 20 and 21 empty", async () => {
    const { canvasId, keys } = await dynamicCanvas(20, 20);

    const ack = await placeAs(canvasId, "author-a", [{ x: 18, y: 5, colorIndex: 5 }]);

    expect(ack.accepted).toBe(1);
    expect(await canvasOf(canvasId)).toMatchObject({ width: 22, height: 20, origin: { x: 0, y: 0 } });
    expect(await redis.strlen(keys.state)).toBe(22 * 20);
    expect(await picture(canvasId)).toEqual([{ x: 18, y: 5, colorIndex: 5 }]);
  });

  // À gauche : la fresque grandit de 2 colonnes, et tous les pixels, leurs piles et les cases de leurs auteurs se décalent de +2
  it("a pixel placed at x = 1 widens it by 2 columns on the left and shifts every pixel, pile and author cell by +2", async () => {
    const { canvasId, keys } = await dynamicCanvas(20, 20);
    // Une rangée qui se déplace d'un coup : chaque case d'arrivée est celle d'un départ.
    await placeAs(
      canvasId,
      "author-a",
      [10, 11, 12, 13, 14].map((x) => ({ x, y: 10, colorIndex: 5 })),
    );
    await placeAs(canvasId, "author-b", [{ x: 12, y: 10, colorIndex: 6 }]); // une pile de deux

    await placeAs(canvasId, "author-c", [{ x: 1, y: 10, colorIndex: 7 }]);

    expect(await canvasOf(canvasId)).toMatchObject({ width: 22, height: 20, origin: { x: 2, y: 0 } });
    expect(await picture(canvasId)).toEqual([
      { x: 3, y: 10, colorIndex: 7 },
      { x: 12, y: 10, colorIndex: 5 },
      { x: 13, y: 10, colorIndex: 5 },
      { x: 14, y: 10, colorIndex: 6 },
      { x: 15, y: 10, colorIndex: 5 },
      { x: 16, y: 10, colorIndex: 5 },
    ]);
    expect(await redis.llen(keys.hist(toCellKey(14, 10)))).toBe(2);
    expect(await redis.exists(keys.hist(toCellKey(12, 10)))).toBe(1); // l'arrivée d'une autre pile, pas l'ancienne
    expect(await redis.llen(keys.hist(toCellKey(12, 10)))).toBe(1);
    expect(sortedKeys(await redis.smembers(keys.cells("author-a")))).toEqual(
      [12, 13, 15, 16].map((x) => toCellKey(x, 10)),
    );
    expect(await core.inspect(canvasId, 14, 10)).toMatchObject({ userId: "author-b", colorIndex: 6 });
    expect(await core.inspect(canvasId, 3, 10)).toMatchObject({ userId: "author-c" });
    const pixels = await core.listPixels(canvasId, "author-a");
    expect(pixels.map(({ x, y }) => `${x},${y}`).sort()).toEqual(["12,10", "13,10", "15,10", "16,10"]);
  });

  // Dans un coin, les deux axes grandissent, et le pixel posé tombe sur sa case de l'image qui a grandi
  it("a pixel in a corner grows both axes by 3 and lands on its own cell, the piles of a block moving with it", async () => {
    const { canvasId, keys } = await dynamicCanvas(20, 20);
    await placeAs(canvasId, "author-a", block(8, 8, 3, 5));

    await placeAs(canvasId, "author-b", [{ x: 0, y: 0, colorIndex: 6 }]);

    expect(await canvasOf(canvasId)).toMatchObject({ width: 23, height: 23, origin: { x: 3, y: 3 } });
    expect(await picture(canvasId)).toEqual([{ x: 3, y: 3, colorIndex: 6 }, ...block(11, 11, 3, 5)]);
    expect(sortedKeys(await redis.smembers(keys.cells("author-a")))).toEqual(
      block(11, 11, 3, 5).map(({ x, y }) => toCellKey(x, y)),
    );
    expect(await core.inspect(canvasId, 12, 13)).toMatchObject({ userId: "author-a" });
    expect(await redis.exists(keys.hist(toCellKey(8, 8)))).toBe(0);
  });

  // Une gomme n'ajoute aucun pixel : rien ne grandit
  it("an eraser adds no pixel, so the canvas does not grow", async () => {
    const { canvasId } = await dynamicCanvas(20, 20);

    const ack = await placeAs(canvasId, "author-a", [{ x: 0, y: 0, colorIndex: 0 }]);

    expect(ack.accepted).toBe(1);
    expect(await canvasOf(canvasId)).toMatchObject({ width: 20, height: 20 });
  });

  // Au plafond de 256, l'axe ne grandit plus : la marge se remplit normalement
  it("stops at 256 on an axis, and the margin then fills like any cell", async () => {
    const { canvasId } = await dynamicCanvas(255, 20);

    await placeAs(canvasId, "author-a", [{ x: 254, y: 10, colorIndex: 5 }]);
    expect(await canvasOf(canvasId)).toMatchObject({ width: 256, height: 20 });

    const ack = await placeAs(canvasId, "author-a", [
      { x: 255, y: 10, colorIndex: 5 },
      { x: 0, y: 10, colorIndex: 5 },
    ]);

    expect(ack.accepted).toBe(2);
    expect(await canvasOf(canvasId)).toMatchObject({ width: 256, height: 20, origin: { x: 0, y: 0 } });
    expect(await picture(canvasId)).toHaveLength(3);
  });

  // Une fresque ne rétrécit jamais seule
  it("never shrinks on its own: clearing a drawing leaves the size as it is", async () => {
    const { canvasId } = await dynamicCanvas(20, 20);
    await placeAs(canvasId, "author-a", [{ x: 18, y: 5, colorIndex: 5 }]);

    await core.moderate(canvasId, clearUser("author-a"));

    expect(await canvasOf(canvasId)).toMatchObject({ width: 22, height: 20 });
    expect(await picture(canvasId)).toEqual([]);
  });

  // Sans le réglage, rien ne change : la pose reste dans le cadre, sans agrandir
  it("leaves a canvas without the setting exactly as before", async () => {
    const { canvasId } = await harness.readyCanvas(meta(20, 20));

    const ack = await placeAs(canvasId, "author-a", [{ x: 19, y: 0, colorIndex: 5 }]);

    expect(ack.accepted).toBe(1);
    expect(await canvasOf(canvasId)).toMatchObject({ width: 20, height: 20 });
  });

  // Une croissance ne se rejoue pas : le même lot renvoyé rend le même ack
  it("a lot sent twice grows the canvas once", async () => {
    const { canvasId } = await dynamicCanvas(20, 20);
    const placement = {
      userId: "author-a",
      requestId: randomUUID(),
      placementId: "pabcdefghijklmno",
      nowMs: now,
      pixels: [{ x: 1, y: 5, colorIndex: 5 }],
    };

    const first = await core.place(canvasId, placement);
    const second = await core.place(canvasId, placement);

    expect(second).toEqual(first);
    expect(await canvasOf(canvasId)).toMatchObject({ width: 22, origin: { x: 2, y: 0 } });
    expect(await picture(canvasId)).toEqual([{ x: 3, y: 5, colorIndex: 5 }]);
  });

  // Les pages apprennent la taille avant l'événement de la pose, dans le repère d'après ; une reprise d'avant repart d'un snapshot
  it("tells the pages before the event, which already speaks of the new frame, and forces a snapshot on any resync from before", async () => {
    const { canvasId, keys } = await dynamicCanvas(20, 20);
    const received: LiveMessage[] = [];
    const unsubscribe = await core.subscribe(canvasId, (message) => received.push(message));

    await placeAs(canvasId, "author-a", [{ x: 1, y: 5, colorIndex: 5 }]);
    await delay(100);
    await unsubscribe();

    expect(received).toHaveLength(2);
    expect(received[0]).toEqual({ ctl: { t: "resize" } });
    expect(received[1]).toMatchObject({
      e: { version: 2, kind: "place", cells: [{ x: 3, y: 5, colorIndex: 5 }] },
    });
    expect(await redis.hget(keys.meta, "resizedAtVersion")).toBe("1");
    expect(await core.listEvents(canvasId, 1, 100)).toBeNull();
    expect(await core.listEvents(canvasId, 2, 100)).toHaveLength(1);
    expect(await core.listRecentEvents(canvasId, 0)).toEqual([expect.objectContaining({ version: 2 })]);
  });

  // Une pile cachée d'un ancien rapprochement, dans la place qui s'ajoute, n'y reste pas
  it("drops a stale pile left in the cells it adds", async () => {
    const { canvasId, keys } = await dynamicCanvas(20, 20);
    await redis.rpush(keys.hist(toCellKey(21, 3)), "ghost:5:1:1:p1abcdefgh");
    await redis.sadd(keys.cells("ghost"), toCellKey(21, 3));

    await placeAs(canvasId, "author-a", [{ x: 18, y: 5, colorIndex: 5 }]);

    expect(await redis.exists(keys.hist(toCellKey(21, 3)))).toBe(0);
    expect(await redis.smembers(keys.cells("ghost"))).toEqual([]);
  });
});

describe("la taille dynamique : une pose contre un décalage (Écart §5.3, JOURNAL 2026-10-28)", () => {
  // Une page qui n'a pas reçu le décalage envoie ses cases dans l'ancien repère : elles tombent sur la case visée
  it("a pose sent from the origin before a shift lands on the cell it aimed at", async () => {
    const { canvasId } = await dynamicCanvas(20, 20);
    await placeAs(canvasId, "author-a", [{ x: 1, y: 10, colorIndex: 5 }]); // décale de +2 en x

    const ack = await placeAs(canvasId, "author-b", [{ x: 5, y: 5, colorIndex: 7 }], { x: 0, y: 0 });

    expect(ack.accepted).toBe(1);
    expect(await picture(canvasId)).toEqual([
      { x: 7, y: 5, colorIndex: 7 },
      { x: 3, y: 10, colorIndex: 5 },
    ]);
  });

  // Une page à jour n'est pas décalée
  it("a pose from the current origin is not moved", async () => {
    const { canvasId } = await dynamicCanvas(20, 20);
    await placeAs(canvasId, "author-a", [{ x: 1, y: 10, colorIndex: 5 }]);

    await placeAs(canvasId, "author-b", [{ x: 7, y: 5, colorIndex: 7 }], { x: 2, y: 0 });

    expect(await picture(canvasId)).toContainEqual({ x: 7, y: 5, colorIndex: 7 });
  });

  // Une pose qui fait grandir sa propre fresque est traduite d'abord, puis décalée avec les autres
  it("a stale pose that itself grows the canvas is translated first, then shifted with the others", async () => {
    const { canvasId } = await dynamicCanvas(20, 20);
    await placeAs(canvasId, "author-a", [{ x: 1, y: 10, colorIndex: 5 }]);

    // L'ancien (1, 5) est maintenant (3, 5) : encore à 3 colonnes du bord, rien ne grandit à gauche ; l'ancien (19, 5) touche le bord droit.
    await placeAs(canvasId, "author-b", [{ x: 19, y: 5, colorIndex: 8 }], { x: 0, y: 0 });

    expect(await canvasOf(canvasId)).toMatchObject({ width: 25, origin: { x: 2, y: 0 } });
    expect(await picture(canvasId)).toContainEqual({ x: 21, y: 5, colorIndex: 8 });
  });

  // Deux poses près de deux bords opposés, envoyées ensemble : aucune ne se perd, aucune ne tombe à côté, les marges tiennent
  it("two poses near opposite edges sent together are both kept, on their own cells, with the margins held", async () => {
    for (let round = 0; round < 8; round++) {
      const { canvasId } = await dynamicCanvas(20, 20);

      const [left, right] = await Promise.all([
        placeAs(canvasId, "author-a", [{ x: 1, y: 10, colorIndex: 5 }], { x: 0, y: 0 }),
        placeAs(canvasId, "author-b", [{ x: 18, y: 10, colorIndex: 6 }], { x: 0, y: 0 }),
      ]);

      expect([left.accepted, right.accepted]).toEqual([1, 1]);
      const { width } = await canvasOf(canvasId);
      const found = await picture(canvasId);
      expect(found).toHaveLength(2);
      const [first, second] = found;
      expect(second?.x).toBe((first?.x ?? 0) + 17);
      expect(first?.x).toBeGreaterThanOrEqual(3);
      expect(width - 1 - (second?.x ?? 0)).toBeGreaterThanOrEqual(3);
      expect([first?.colorIndex, second?.colorIndex]).toEqual([5, 6]);
    }
  });
});

describe("la taille dynamique : la modération (Écart §5.3, JOURNAL 2026-10-28)", () => {
  // Un pixel remis sur une case vide trop près du bord agrandit la fresque, et l'événement parle du nouveau cadre
  it("a pixel the moderation brings back near an edge grows the canvas first, and the event speaks of the new frame", async () => {
    const { canvasId, keys } = await harness.readyCanvas(meta(50, 50));
    await placeAs(canvasId, "author-a", [{ x: 18, y: 18, colorIndex: 5 }]);
    await placeAs(canvasId, "author-b", [{ x: 18, y: 18, colorIndex: 0 }]); // la gomme cache le pixel de A
    await placeAs(canvasId, "author-c", [
      { x: 20, y: 20, colorIndex: 6 },
      { x: 30, y: 30, colorIndex: 6 },
    ]);
    expect(await core.setDynamicSize(canvasId, { by: OWNER, isDynamicSize: true })).toEqual({
      ok: true,
      value: undefined,
    });
    // Le cadre est celui des dessins (20 à 30) et de leurs 3 cases : la pile cachée de A y est, à 1 colonne du bord.
    expect(await canvasOf(canvasId)).toMatchObject({ width: 17, height: 17, origin: { x: -17, y: -17 } });
    const received: LiveMessage[] = [];
    const unsubscribe = await core.subscribe(canvasId, (message) => received.push(message));

    await core.moderate(canvasId, clearUser("author-b"));
    await delay(100);
    await unsubscribe();

    expect(await canvasOf(canvasId)).toMatchObject({ width: 19, height: 19, origin: { x: -15, y: -15 } });
    expect(await picture(canvasId)).toEqual([
      { x: 3, y: 3, colorIndex: 5 },
      { x: 5, y: 5, colorIndex: 6 },
      { x: 15, y: 15, colorIndex: 6 },
    ]);
    expect(received[0]).toEqual({ ctl: { t: "resize" } });
    expect(received[1]).toMatchObject({
      e: { kind: "clear", cells: [{ x: 3, y: 3, colorIndex: 5, previousColorIndex: 0 }] },
    });
    expect(await core.inspect(canvasId, 3, 3)).toMatchObject({ userId: "author-a" });
    expect(await redis.exists(keys.hist(toCellKey(1, 1)))).toBe(0);
  });

  // La preuve d'un ban suit les cases de l'auteur : un décalage ne la laisse pas sur les anciennes
  it("moves a ban proof with the cells, so a shift does not leave it on the old ones", async () => {
    const { canvasId } = await dynamicCanvas(20, 20);
    await placeAs(canvasId, "troll", [
      { x: 10, y: 10, colorIndex: 5 },
      { x: 11, y: 10, colorIndex: 5 },
    ]);
    await core.moderate(canvasId, { ...clearUser("troll"), action: { action: "ban", target: "troll" } });
    await core.moderate(canvasId, clearUser("troll"));

    await placeAs(canvasId, "author-a", [{ x: 1, y: 10, colorIndex: 7 }]);

    const proof = await core.listPixels(canvasId, "troll");
    expect(proof.map(({ x, y }) => `${x},${y}`).sort()).toEqual(["12,10", "13,10"]);
  });

  // Ce qu'un retrait vient d'ôter suit aussi, avec sa durée
  it("moves what a removal just took away, and keeps its duration", async () => {
    const { canvasId, keys } = await dynamicCanvas(20, 20);
    await placeAs(canvasId, "troll", [{ x: 10, y: 10, colorIndex: 5 }]);
    await core.moderate(canvasId, clearUser("troll"));
    expect(await redis.hkeys(keys.recentlyCleared("troll"))).toEqual([String(toCellKey(10, 10))]);

    await placeAs(canvasId, "author-a", [{ x: 1, y: 10, colorIndex: 7 }]);

    expect(await redis.hkeys(keys.recentlyCleared("troll"))).toEqual([String(toCellKey(12, 10))]);
    expect(await redis.ttl(keys.recentlyCleared("troll"))).toBeGreaterThan(3000);
  });
});

describe("setDynamicSize : l'activation resserre la fresque (Écart §5.3, JOURNAL 2026-10-28)", () => {
  // Un décalage de signes contraires (à droite, vers le haut) : chaque pile trouve sa case libre
  it("moves a block right and up at once, every pile finding its cell free", async () => {
    const { canvasId, keys } = await harness.readyCanvas(meta(50, 50));
    await placeAs(canvasId, "author-a", block(0, 30, 3, 5));

    await core.setDynamicSize(canvasId, { by: OWNER, isDynamicSize: true });

    expect(await canvasOf(canvasId)).toMatchObject({ width: 10, height: 10, origin: { x: 3, y: -27 } });
    expect(await picture(canvasId)).toEqual(block(3, 3, 3, 5));
    expect(sortedKeys(await redis.smembers(keys.cells("author-a")))).toEqual(
      block(3, 3, 3, 5).map(({ x, y }) => toCellKey(x, y)),
    );
  });

  // L'exemple validé : un dessin de 4 × 4 au milieu d'une 50 × 50 donne une 10 × 10, sans rien perdre ni déplacer l'un par rapport à l'autre
  it("shrinks a 4×4 drawing in the middle of a 50×50 canvas to 10×10, losing nothing and moving nothing relative to the rest", async () => {
    const { canvasId, keys } = await harness.readyCanvas(meta(50, 50));
    await placeAs(canvasId, "author-a", block(20, 30, 4, 5));
    const received: LiveMessage[] = [];
    const unsubscribe = await core.subscribe(canvasId, (message) => received.push(message));

    const result = await core.setDynamicSize(canvasId, { by: OWNER, isDynamicSize: true });
    await delay(100);
    await unsubscribe();

    expect(result).toEqual({ ok: true, value: undefined });
    expect(await canvasOf(canvasId)).toMatchObject({
      width: 10,
      height: 10,
      isDynamicSize: true,
      origin: { x: -17, y: -27 },
    });
    expect(await redis.strlen(keys.state)).toBe(100);
    expect(await picture(canvasId)).toEqual(block(3, 3, 4, 5));
    expect(sortedKeys(await redis.smembers(keys.cells("author-a")))).toEqual(
      block(3, 3, 4, 5).map(({ x, y }) => toCellKey(x, y)),
    );
    expect(await core.inspect(canvasId, 4, 5)).toMatchObject({ userId: "author-a" });
    expect(received).toEqual([{ ctl: { t: "resize" } }]);
    expect(await redis.hget(keys.meta, "resizedAtVersion")).toBe("2");
    expect(await core.listEvents(canvasId, 1, 100)).toBeNull(); // une reprise d'avant repart d'un snapshot
  });

  // Les piles de cases qui sortent du cadre partent avec elles ; celles du cadre se déplacent
  it("moves the piles of the cells that stay and drops those of the cells it cuts, with their author cells", async () => {
    const { canvasId, keys } = await harness.readyCanvas(meta(50, 50));
    await placeAs(canvasId, "author-a", [{ x: 5, y: 5, colorIndex: 5 }]);
    await placeAs(canvasId, "author-b", [{ x: 5, y: 5, colorIndex: 0 }]); // une gomme : case vide, pile gardée
    await placeAs(canvasId, "author-c", [{ x: 30, y: 30, colorIndex: 6 }]);

    await core.setDynamicSize(canvasId, { by: OWNER, isDynamicSize: true });

    expect(await redis.exists(keys.hist(toCellKey(5, 5)))).toBe(0);
    expect(await redis.smembers(keys.cells("author-a"))).toEqual([]);
    expect(await redis.llen(keys.hist(toCellKey(4, 4)))).toBe(1);
    expect(await core.inspect(canvasId, 4, 4)).toMatchObject({ userId: "author-c" });
  });

  // Une fresque vide devient une 10 × 10
  it("makes an empty canvas 10×10", async () => {
    const { canvasId } = await harness.readyCanvas(meta(50, 50));

    await core.setDynamicSize(canvasId, { by: OWNER, isDynamicSize: true });

    expect(await canvasOf(canvasId)).toMatchObject({ width: 10, height: 10, isDynamicSize: true });
  });

  // Un dessin qui touche les bords gagne ses 3 cases de marge : le resserrement peut agrandir
  it("grows a canvas whose drawing touches the borders, to give it its margin", async () => {
    const { canvasId } = await harness.readyCanvas(meta(50, 50));
    await placeAs(canvasId, "author-a", [
      { x: 0, y: 0, colorIndex: 5 },
      { x: 49, y: 49, colorIndex: 5 },
    ]);

    await core.setDynamicSize(canvasId, { by: OWNER, isDynamicSize: true });

    expect(await canvasOf(canvasId)).toMatchObject({ width: 56, height: 56, origin: { x: 3, y: 3 } });
    expect(await picture(canvasId)).toEqual([
      { x: 3, y: 3, colorIndex: 5 },
      { x: 52, y: 52, colorIndex: 5 },
    ]);
  });

  // Déjà serré : seul le réglage change, la version non
  it("only sets the flag on a canvas that is already tight, without a new version", async () => {
    const { canvasId, keys } = await harness.readyCanvas(meta(16, 16));
    await placeAs(canvasId, "author-a", [
      { x: 3, y: 3, colorIndex: 5 },
      { x: 12, y: 12, colorIndex: 5 },
    ]);
    const before = await redis.get(keys.version);

    await core.setDynamicSize(canvasId, { by: OWNER, isDynamicSize: true });

    expect(await canvasOf(canvasId)).toMatchObject({ width: 16, height: 16, isDynamicSize: true });
    expect(await redis.get(keys.version)).toBe(before);
  });

  // Retirer le réglage ramène la fresque à 50 × 50 (Écart §5.3, JOURNAL 2026-10-29), et prévient les pages une fois ; le redire ne change rien
  it("removing the setting brings the canvas back to 50×50 and tells the pages once", async () => {
    const { canvasId } = await harness.readyCanvas(meta(50, 50));
    await core.setDynamicSize(canvasId, { by: OWNER, isDynamicSize: true });
    const received: LiveMessage[] = [];
    const unsubscribe = await core.subscribe(canvasId, (message) => received.push(message));

    await core.setDynamicSize(canvasId, { by: OWNER, isDynamicSize: false });
    await core.setDynamicSize(canvasId, { by: OWNER, isDynamicSize: false });
    await delay(100);
    await unsubscribe();

    const found = await canvasOf(canvasId);
    expect(found).toMatchObject({ width: 50, height: 50 });
    expect(found.isDynamicSize).toBeUndefined();
    expect(received).toEqual([{ ctl: { t: "resize" } }]);
  });

  // Une pose de l'ancien repère, après un resserrement, tombe sur sa case ; hors du cadre, elle est refusée
  it("after a tightening, a pose from the old origin lands on its cell, or is refused when that cell was cut", async () => {
    const { canvasId } = await harness.readyCanvas(meta(50, 50));
    await placeAs(canvasId, "author-a", [{ x: 30, y: 30, colorIndex: 5 }]);
    await core.setDynamicSize(canvasId, { by: OWNER, isDynamicSize: true });

    const ack = await placeAs(
      canvasId,
      "author-b",
      [
        { x: 30, y: 31, colorIndex: 7 },
        { x: 5, y: 5, colorIndex: 8 },
      ],
      { x: 0, y: 0 },
    );

    expect(ack.accepted).toBe(1);
    expect(ack.rejected).toEqual([{ index: 1, reason: "invalid" }]);
    expect(await picture(canvasId)).toContainEqual({ x: 4, y: 5, colorIndex: 7 });
  });

  // Le streamer seul, une archive jamais, et pas de format tant que le réglage est actif
  it("is for the owner alone, never an archive, and leaves no format to choose while it is on", async () => {
    const { canvasId, keys } = await harness.readyCanvas(meta(50, 50));

    expect(await core.setDynamicSize(canvasId, { by: "author-a", isDynamicSize: true })).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await canvasOf(canvasId)).toMatchObject({ width: 50, height: 50 });

    await core.setDynamicSize(canvasId, { by: OWNER, isDynamicSize: true });
    expect(await core.resizeCanvas(canvasId, { by: OWNER, width: 100, height: 100 })).toEqual({
      ok: false,
      error: "forbidden",
    });

    await redis.hset(keys.meta, "archivedAt", now);
    expect(await core.setDynamicSize(canvasId, { by: OWNER, isDynamicSize: false })).toEqual({
      ok: false,
      error: "canvas_archived",
    });
  });
});

describe("setDynamicSize : retirer le réglage ramène la fresque à 50 × 50 (Écart §5.3, JOURNAL 2026-10-29)", () => {
  const line = (x0: number, x1: number, y: number): Pixel[] =>
    Array.from({ length: x1 - x0 + 1 }, (_, index) => ({ x: x0 + index, y, colorIndex: 5 }));

  // Le même dessin sur une fresque dynamique et sur une fresque à taille fixe de la même taille : l'une perd le réglage, l'autre passe à
  // 50 × 50 par un choix de format. Les marges de 3 cases tiennent : poser ne fait grandir ni l'une ni l'autre.
  const twins = async (width: number, height: number, pixels: Pixel[]) => {
    const dynamic = await dynamicCanvas(width, height);
    const fixed = await harness.readyCanvas(meta(width, height));
    for (const { canvasId } of [dynamic, fixed]) await placeAs(canvasId, "author-a", pixels);
    return { dynamic, fixed };
  };

  const shapeOf = async ({ keys }: { keys: ReturnType<typeof buildCanvasKeys> }) => ({
    state: (await redis.getBuffer(keys.state))?.toString("hex"),
    meta: await redis.hmget(keys.meta, "width", "height", "movedAtVersion"),
  });

  // Sur un axe plus grand que 50, les dessins se rapprochent comme à un choix manuel : le même état, la même version de rapprochement
  it("brings two drawings at the ends of a 60×20 canvas closer, exactly as a manual choice of 50×50", async () => {
    const ends = [...line(3, 5, 5), ...line(3, 5, 6), ...line(54, 56, 5), ...line(54, 56, 6)];
    const { dynamic, fixed } = await twins(60, 20, ends);

    expect(await core.setDynamicSize(dynamic.canvasId, { by: OWNER, isDynamicSize: false })).toEqual({
      ok: true,
      value: undefined,
    });
    await core.resizeCanvas(fixed.canvasId, { by: OWNER, width: 50, height: 50 });

    const after = await canvasOf(dynamic.canvasId);
    expect(after).toMatchObject({ width: 50, height: 50 });
    expect(after.isDynamicSize).toBeUndefined();
    expect(await shapeOf(dynamic)).toEqual(await shapeOf(fixed));
    expect((await picture(dynamic.canvasId)).length).toBe(12);
    expect(after.movedAtVersion).toBeDefined();
  });

  // Une ligne trop large pour 50 : ce qui ne tient pas est coupé, gardé hors du cadre, et revient à l'agrandissement
  it("cuts what does not fit, as a manual choice does, and gives it back when the canvas grows", async () => {
    const wide = line(3, 56, 10);
    const { dynamic, fixed } = await twins(60, 20, wide);

    await core.setDynamicSize(dynamic.canvasId, { by: OWNER, isDynamicSize: false });
    await core.resizeCanvas(fixed.canvasId, { by: OWNER, width: 50, height: 50 });

    expect(await shapeOf(dynamic)).toEqual(await shapeOf(fixed));
    expect((await picture(dynamic.canvasId)).length).toBe(50); // la marge de gauche part d'abord (3 colonnes), la ligne se coupe à 50
    await core.resizeCanvas(dynamic.canvasId, { by: OWNER, width: 100, height: 100 });
    expect((await picture(dynamic.canvasId)).length).toBe(54);
  });

  // Sur un axe plus petit que 50, la fresque grandit, rien ne bouge et rien n'est coupé
  it("grows a tight 10×10 canvas to 50×50 without moving or cutting anything", async () => {
    const { canvasId, keys } = await harness.readyCanvas(meta(50, 50));
    await placeAs(canvasId, "author-a", block(20, 30, 4, 5));
    await core.setDynamicSize(canvasId, { by: OWNER, isDynamicSize: true });
    const tight = await picture(canvasId);
    expect(await canvasOf(canvasId)).toMatchObject({ width: 10, height: 10 });

    await core.setDynamicSize(canvasId, { by: OWNER, isDynamicSize: false });

    expect(await canvasOf(canvasId)).toMatchObject({ width: 50, height: 50 });
    expect(await picture(canvasId)).toEqual(tight);
    expect(await redis.hget(keys.meta, "movedAtVersion")).toBeNull();
  });

  // Déjà à 50 × 50 : seul le réglage part, la version ne bouge pas
  it("only removes the setting on a canvas already at 50×50, without a new version", async () => {
    const { canvasId, keys } = await dynamicCanvas(50, 50);
    const before = await redis.get(keys.version);

    await core.setDynamicSize(canvasId, { by: OWNER, isDynamicSize: false });

    expect(await canvasOf(canvasId)).toMatchObject({ width: 50, height: 50 });
    expect(await redis.hexists(keys.meta, "dynamicSize")).toBe(0);
    expect(await redis.get(keys.version)).toBe(before);
  });

  // Une pose qui court avec le retrait ne fait jamais grandir la fresque après lui : dans les deux ordres, 50 × 50 et le pixel à sa place
  it("never lets a pose grow the canvas between the removal and the return to 50×50", async () => {
    for (let round = 0; round < 8; round++) {
      const { canvasId, keys } = await dynamicCanvas(20, 20);
      const pose = () => placeAs(canvasId, "author-a", [{ x: 18, y: 5, colorIndex: 5 }], { x: 0, y: 0 });
      const removal = () => core.setDynamicSize(canvasId, { by: OWNER, isDynamicSize: false });

      const [first, second] =
        round % 2 === 0
          ? await Promise.all([pose(), removal()])
          : (await Promise.all([removal(), pose()])).reverse();

      expect(first).toMatchObject({ accepted: 1 });
      expect(second).toEqual({ ok: true, value: undefined });
      expect(await canvasOf(canvasId)).toMatchObject({ width: 50, height: 50 });
      expect(await redis.hexists(keys.meta, "dynamicSize")).toBe(0);
      expect(await picture(canvasId)).toEqual([{ x: 18, y: 5, colorIndex: 5 }]);
    }
  });

  // Un plan calculé sur une version périmée ne s'applique pas : ni la taille ni le réglage ne bougent, le client relit
  it("applies nothing when the plan was made on an older version: neither the size nor the setting moves", async () => {
    const { canvasId, keys } = await dynamicCanvas(60, 20);
    await placeAs(canvasId, "author-a", line(3, 5, 5));
    const version = Number(await redis.get(keys.version));

    const [status] = await redis.dynamicSize(
      keys.meta,
      keys.state,
      keys.version,
      keys.bans,
      keys.cleared,
      keys.clearedPlacements,
      keys.clearedRanges,
      keys.histPrefix,
      keys.cellsPrefix,
      keys.clearingPrefix,
      keys.banPrefix,
      keys.recentlyClearedPrefix,
      keys.live,
      CELL_STRIDE,
      OWNER,
      0,
      version - 1,
      0,
      0,
      50,
      50,
      "{}",
    );

    expect(status).toBe("stale");
    expect(await canvasOf(canvasId)).toMatchObject({ width: 60, height: 20, isDynamicSize: true });
    expect(await redis.get(keys.version)).toBe(String(version));
  });
});

describe("planGrowth du domaine : la même règle que reframe.lua (Écart §9.3, JOURNAL 2026-10-29)", () => {
  // Ce que la page montre avant la pose est ce que le script fait : la taille et le décalage de la fresque après une vraie pose
  const cases: { name: string; width: number; height: number; cells: { x: number; y: number }[] }[] = [
    { name: "a cell on the right margin", width: 20, height: 20, cells: [{ x: 18, y: 5 }] },
    { name: "a cell on the left margin", width: 20, height: 20, cells: [{ x: 1, y: 10 }] },
    { name: "a corner", width: 20, height: 20, cells: [{ x: 0, y: 0 }] },
    { name: "the opposite corner", width: 20, height: 20, cells: [{ x: 19, y: 19 }] },
    { name: "the column 7 of a 10×10", width: 10, height: 10, cells: [{ x: 7, y: 5 }] },
    { name: "the column 8 of a 10×10", width: 10, height: 10, cells: [{ x: 8, y: 5 }] },
    {
      name: "two cells on opposite sides",
      width: 10,
      height: 10,
      cells: [
        { x: 8, y: 5 },
        { x: 1, y: 9 },
      ],
    },
    {
      name: "cells well inside",
      width: 10,
      height: 10,
      cells: [
        { x: 3, y: 3 },
        { x: 6, y: 6 },
      ],
    },
    { name: "the right margin at 255", width: 255, height: 20, cells: [{ x: 254, y: 10 }] },
    { name: "the right margin at the ceiling", width: 256, height: 20, cells: [{ x: 255, y: 10 }] },
    { name: "the left margin at the ceiling", width: 256, height: 20, cells: [{ x: 0, y: 10 }] },
    {
      name: "both sides with room for one",
      width: 254,
      height: 20,
      cells: [
        { x: 1, y: 5 },
        { x: 252, y: 5 },
      ],
    },
    { name: "the bottom margin at the ceiling", width: 20, height: 256, cells: [{ x: 5, y: 255 }] },
  ];

  for (const { name, width, height, cells } of cases)
    it(`gives the same size and shift as the script for ${name}`, async () => {
      const { canvasId } = await dynamicCanvas(width, height);
      const growth = planGrowth(cells, { width, height });

      await placeAs(
        canvasId,
        "author-a",
        cells.map((cell) => ({ ...cell, colorIndex: 5 })),
      );

      const after = await canvasOf(canvasId);
      expect({ width: after.width, height: after.height }).toEqual({
        width: width + growth.left + growth.right,
        height: height + growth.top + growth.bottom,
      });
      expect(after.origin ?? { x: 0, y: 0 }).toEqual({ x: growth.left, y: growth.top });
    });
});
