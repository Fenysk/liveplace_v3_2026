import { setTimeout as delay } from "node:timers/promises";
import { type CanvasMeta, defaultCanvasMeta } from "@liveplace/domain";
import type { CanvasActivity } from "@liveplace/domain/ports";
import { afterAll, describe, expect, it } from "vitest";
import { createHistorySource } from "./history";
import { createRedisHarness } from "./test-harness";

const harness = createRedisHarness();
const { redis, core, runId } = harness;
const watchSubscriber = redis.duplicate();
const source = createHistorySource(redis, watchSubscriber);

afterAll(() => {
  watchSubscriber.disconnect();
});

const OWNER = "owner-1";
const now = 1_700_000_000_000;
const meta: CanvasMeta = { ...defaultCanvasMeta(OWNER), gaugeMaxStart: 1000, gaugeMaxCeiling: 1000 };

const readyCanvas = () => harness.readyCanvas(meta);
const placeAs = (canvasId: string, userId: string, placementId: string, count = 1) =>
  harness.placeInBatches(
    canvasId,
    userId,
    placementId,
    Array.from({ length: count }, (_, index) => ({ x: index, y: 0, colorIndex: 3 })),
    now,
  );

const ban = async (canvasId: string, target: string) => {
  const result = await core.moderate(canvasId, {
    by: OWNER,
    nowMs: now,
    action: { action: "ban", target },
    slice: "first",
  });
  if (!result.ok) throw new Error(result.error);
};

describe("the stream entry of a placement (Écart §7.2, JOURNAL 2026-10-08)", () => {
  // Quand une pose est acceptée, son entrée porte la `placementId` dans un champ `p`, après l'événement `e`
  it("carries the placementId in a field p, after the event in e", async () => {
    const { canvasId, keys } = await readyCanvas();

    await placeAs(canvasId, "author-a", "pabcdef01");

    const [entry] = await redis.xrange(keys.events, "-", "+");
    const fields = entry?.[1] ?? [];
    expect(fields[0]).toBe("e");
    expect(JSON.parse(fields[1] ?? "null")).toMatchObject({
      version: 1,
      kind: "place",
      authorId: "author-a",
    });
    expect(fields.slice(2)).toEqual(["p", "pabcdef01"]);
  });

  // Ce que reçoivent les clients ne change pas : le message du canal reste `{"e": …}`, sans `p`
  it("leaves the live message exactly as it was, without the placementId", async () => {
    const { canvasId, keys } = await readyCanvas();
    const listener = redis.duplicate();
    const messages: string[] = [];
    listener.on("message", (_channel, message) => messages.push(message));
    await listener.subscribe(keys.live);

    await placeAs(canvasId, "author-a", "pabcdef01");
    await delay(100);
    listener.disconnect();

    const [entry] = await redis.xrange(keys.events, "-", "+");
    expect(messages).toEqual([`{"e":${entry?.[1][1]}}`]);
  });
});

describe("listHistory", () => {
  // Les entrées après le curseur, dans l'ordre des versions, chacune avec sa pose et son événement
  it("lists the entries after the cursor, in version order, each with its placement and event", async () => {
    const { canvasId } = await readyCanvas();
    await placeAs(canvasId, "author-a", "pfirst0001", 2);
    await placeAs(canvasId, "author-b", "psecond001");
    await placeAs(canvasId, "author-a", "pthird0001");

    const { entries } = await source.listHistory(canvasId, 1, 10);

    expect(entries.map(([version, placementId]) => [version, placementId])).toEqual([
      [2, "psecond001"],
      [3, "pthird0001"],
    ]);
    expect(entries[0]?.[2]).toMatchObject({ version: 2, kind: "place", authorId: "author-b" });
  });

  // Le curseur est exclu, et `maxCount` borne la lecture
  it("leaves out the cursor itself and stops at maxCount", async () => {
    const { canvasId } = await readyCanvas();
    for (const placementId of ["pfirst0001", "psecond001", "pthird0001"])
      await placeAs(canvasId, "author-a", placementId);

    expect((await source.listHistory(canvasId, 3, 10)).entries).toEqual([]);
    expect((await source.listHistory(canvasId, 0, 2)).entries.map(([version]) => version)).toEqual([1, 2]);
  });

  // La modération entre dans l'historique, sans `placementId` : l'événement dit la sienne s'il y en a une
  it("includes the moderation entries, with no placementId", async () => {
    const { canvasId } = await readyCanvas();
    await placeAs(canvasId, "troll", "ptroll0001");

    await ban(canvasId, "troll");

    const { entries } = await source.listHistory(canvasId, 0, 10);
    expect(entries.map(([version, placementId]) => [version, placementId])).toEqual([
      [1, "ptroll0001"],
      [2, null],
    ]);
    expect(entries[1]?.[2]).toMatchObject({ kind: "clear", moderation: { action: "ban", target: "troll" } });
  });

  // Une entrée d'avant le champ `p` se lit sans pose : jamais une erreur
  it("reads an entry written before the field p without a placement", async () => {
    const { canvasId, keys } = await readyCanvas();
    const event = { version: 1, kind: "place", authorId: "old", occurredAt: now, cells: [] };
    await redis.xadd(keys.events, "1-0", "e", JSON.stringify(event));

    const { entries } = await source.listHistory(canvasId, 0, 10);

    expect(entries).toEqual([[1, null, event]]);
  });

  // La dernière taille connue accompagne la lecture, `null` si le canvas n'a jamais changé de taille
  it("gives the version of the last resize, null when it never was resized", async () => {
    const { canvasId } = await readyCanvas();
    await placeAs(canvasId, "author-a", "pabcdef01");
    expect((await source.listHistory(canvasId, 0, 10)).resizedAtVersion).toBeNull();

    const resized = await core.resizeCanvas(canvasId, { by: OWNER, width: 80, height: 80 });
    expect(resized).toEqual({ ok: true, value: undefined });

    expect((await source.listHistory(canvasId, 0, 10)).resizedAtVersion).toBe(2);
  });

  // Une récupération laisse sa date et sa version dans `meta` : l'historique sait que le saut de version n'est pas un trou
  it("gives the date and the version of the last recovery, null when there was none", async () => {
    const { canvasId, keys } = await readyCanvas();
    expect((await source.listHistory(canvasId, 0, 10)).recovered).toBeNull();

    await redis.hset(keys.meta, {
      recoveredAt: now,
      recoveredAtVersion: 1_000_275,
      recoveredSnapshotVersion: 275,
    });

    expect((await source.listHistory(canvasId, 0, 10)).recovered).toEqual({
      at: now,
      version: 1_000_275,
      snapshotVersion: 275,
    });
  });

  // Une récupération d'avant le champ n'a pas la version de sa sauvegarde : elle se tire de la reprise, qui vaut toujours
  // max(sauvegarde, curseur) + 1 000 000 ; au-dessus du curseur, c'est exactement la sauvegarde
  it("takes the version of the save from the jump when the recovery predates the field", async () => {
    const { canvasId, keys } = await readyCanvas();

    await redis.hset(keys.meta, { recoveredAt: now, recoveredAtVersion: 1_000_275 });

    expect((await source.listHistory(canvasId, 0, 10)).recovered).toEqual({
      at: now,
      version: 1_000_275,
      snapshotVersion: 275,
    });
  });

  // Le balayage lit la récupération sans lire le flux : sa date et son saut, `null` sans récupération
  it("gives the last recovery alone, without reading the stream", async () => {
    const { canvasId, keys } = await readyCanvas();
    expect(await source.getRecovery(canvasId)).toBeNull();

    await redis.hset(keys.meta, { recoveredAt: now, recoveredAtVersion: 1_000_275 });

    expect(await source.getRecovery(canvasId)).toEqual({ at: now, version: 1_000_275 });
    expect(await source.getRecovery(`${runId}-absent`)).toBeNull();
  });

  // Un canvas qui n'existe pas n'a pas d'historique, et pas de version
  it("gives nothing for a canvas that does not exist", async () => {
    const absent = `${runId}-absent`;

    expect(await source.listHistory(absent, 0, 10)).toEqual({
      entries: [],
      resizedAtVersion: null,
      recovered: null,
    });
    expect(await source.getVersion(absent)).toBeNull();
  });
});

describe("getVersion and watch", () => {
  // La version est celle du canvas
  it("gives the version of the canvas", async () => {
    const { canvasId } = await readyCanvas();
    await placeAs(canvasId, "author-a", "pabcdef01");

    expect(await source.getVersion(canvasId)).toBe(1);
  });

  // Une pose et une modération disent leur version, le `ctl` du ban et un réglage n'en ont pas : le worker compte les entrées
  it("tells the version of an event, and none for a control message", async () => {
    const { canvasId } = await readyCanvas();
    const seen: CanvasActivity[] = [];
    const unwatch = await source.watch((activity) => seen.push(activity));

    await placeAs(canvasId, "author-a", "pabcdef01");
    await ban(canvasId, "troll");
    await core.setObsDelay(canvasId, 20_000);
    await delay(150);
    await unwatch();

    expect(seen.filter((activity) => activity.canvasId === canvasId)).toEqual([
      { canvasId, isPlacement: true, version: 1 },
      { canvasId, isPlacement: false, version: 2 },
      { canvasId, isPlacement: false }, // le `ctl` banned
      { canvasId, isPlacement: false }, // le `ctl` obsDelay
    ]);
  });
});
