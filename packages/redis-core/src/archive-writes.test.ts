import { type CanvasMeta, defaultCanvasMeta } from "@liveplace/domain";
import { describe, expect, it } from "vitest";
import { createArchiveWrites } from "./archive-writes";
import { createSignInWrites } from "./client";
import { buildCanvasKeys, OWNER_LOCK_TTL_MS, ownerLockKey } from "./keys";
import { createRedisHarness } from "./test-harness";

const { redis, runId, uniqueCanvasId } = createRedisHarness();
const writes = createArchiveWrites(redis);
const signIn = createSignInWrites(redis);

const meta: CanvasMeta = {
  ...defaultCanvasMeta("owner-1"),
  width: 4,
  height: 3,
  gaugeMaxStart: 3,
  refillMs: 1000,
  refillCharges: 2,
  obsDelayMs: 5000,
};

const keysOf = async (canvasId: string): Promise<string[]> => {
  const found: string[] = [];
  for await (const names of redis.scanStream({ match: `cv:${canvasId}:*`, count: 1000 }))
    found.push(...names);
  return found.sort();
};

describe("preparing and readying a canvas (Écart §15, JOURNAL 2026-10-06)", () => {
  // Prépare un canvas que personne ne sert encore : `meta` sans `ready`, `state` vide, version 0 ; `ready` le sert
  it("prepares a canvas nobody serves yet: meta without ready, empty state, version 0, then ready serves it", async () => {
    const canvasId = uniqueCanvasId();
    const keys = buildCanvasKeys(canvasId);

    await writes.prepareCanvas(canvasId, meta);

    expect(await writes.getCanvas(canvasId)).toBeNull();
    expect(await redis.hexists(keys.meta, "ready")).toBe(0);
    expect(await redis.hmget(keys.meta, "ownerId", "width", "height", "gaugeMaxStart", "obsDelayMs")).toEqual(
      ["owner-1", "4", "3", "3", "5000"],
    );
    expect(await redis.getBuffer(keys.state)).toEqual(Buffer.alloc(12));
    expect(await redis.get(keys.version)).toBe("0");

    await writes.markReady(canvasId);

    expect(await writes.getCanvas(canvasId)).toEqual(meta);
  });
});

describe("marking a canvas archived or active (Écart §15, JOURNAL 2026-10-06)", () => {
  // Marque l'archive de ses deux champs, retire le successeur seul, puis rend le canvas actif en retirant les deux
  it("marks the archive with its two fields, removes the successor alone, then gives the canvas back by removing both", async () => {
    const canvasId = uniqueCanvasId();
    await signIn.createCanvas(canvasId, meta);

    await writes.markArchived(canvasId, { archivedAt: 1234, successorId: "next-1" });
    expect(await writes.getCanvas(canvasId)).toEqual({ ...meta, archivedAt: 1234, successorId: "next-1" });

    await writes.setSuccessor(canvasId, null);
    expect(await writes.getCanvas(canvasId)).toEqual({ ...meta, archivedAt: 1234 });

    await writes.setSuccessor(canvasId, "next-2");
    expect(await writes.getCanvas(canvasId)).toEqual({ ...meta, archivedAt: 1234, successorId: "next-2" });

    await writes.markActive(canvasId);
    expect(await writes.getCanvas(canvasId)).toEqual(meta);
  });
});

describe("copying what is common to the owner (Écart §15, JOURNAL 2026-10-06)", () => {
  const seedShared = async (canvasId: string, user: string, more: Record<string, string | number> = {}) => {
    const keys = buildCanvasKeys(canvasId);
    await redis
      .multi()
      .sadd(keys.bans, user, `${user}-b`)
      .sadd(keys.bansTwitch, user)
      .hset(keys.ban(user), { "100": "5", "200": "7" })
      .hset(keys.ban(`${user}-b`), { "300": "2" })
      .sadd(keys.mods, `${user}-m`, `${user}-n`)
      .sadd(keys.modsTwitch, `${user}-m`)
      .sadd(keys.modsLiveplace, `${user}-n`)
      .hset(keys.twitchUsers, { [user]: JSON.stringify({ login: user, displayName: user.toUpperCase() }) })
      .hset(keys.meta, {
        obsDelayMs: 60_000,
        obsBackground: "white",
        twitchSync: "ok",
        twitchSyncedAt: 777,
        ...more,
      })
      .exec();
  };

  const sharedOf = async (canvasId: string) => {
    const keys = buildCanvasKeys(canvasId);
    const sorted = async (key: string) => (await redis.smembers(key)).sort();
    return {
      bans: await sorted(keys.bans),
      bansTwitch: await sorted(keys.bansTwitch),
      mods: await sorted(keys.mods),
      modsTwitch: await sorted(keys.modsTwitch),
      modsLiveplace: await sorted(keys.modsLiveplace),
      twitchUsers: await redis.hgetall(keys.twitchUsers),
      metaFields: await redis.hmget(keys.meta, "obsDelayMs", "obsBackground", "twitchSync", "twitchSyncedAt"),
      proofs: (await keysOf(canvasId)).filter((key) => key.includes(":ban:")),
    };
  };

  // Recopie bannis, preuves, modérateurs, noms Twitch, délai, fond et synchro, en remplaçant ce que l'entrant avait
  it("copies bans, proofs, moderators, Twitch names, delay, background and sync, replacing what the incoming one had", async () => {
    const [outgoing, incoming] = [uniqueCanvasId(), uniqueCanvasId()];
    await signIn.createCanvas(outgoing, meta);
    await signIn.createCanvas(incoming, { ...meta, gaugeMaxStart: 7, width: 8, height: 8 });
    await seedShared(outgoing, "u1");
    await seedShared(incoming, "u9", { obsDelayMs: 0, obsBackground: "transparent", twitchSync: "revoked" });
    const before = await sharedOf(outgoing);

    await writes.copyShared(outgoing, incoming);

    const copied = await sharedOf(incoming);
    expect(copied.bans).toEqual(["u1", "u1-b"]);
    expect(copied.bansTwitch).toEqual(["u1"]);
    expect(copied.mods).toEqual(["u1-m", "u1-n"]);
    expect(copied.modsTwitch).toEqual(["u1-m"]);
    expect(copied.modsLiveplace).toEqual(["u1-n"]);
    expect(copied.twitchUsers).toEqual(before.twitchUsers);
    expect(copied.metaFields).toEqual(["60000", "white", "ok", "777"]);
    // Les preuves : celles du sortant, jamais celle d'un banni que l'entrant était seul à connaître.
    expect(copied.proofs.map((key) => key.replace(incoming, outgoing))).toEqual(before.proofs);
    expect(await redis.hgetall(buildCanvasKeys(incoming).ban("u1"))).toEqual({ "100": "5", "200": "7" });
    expect(await redis.exists(buildCanvasKeys(incoming).ban("u9"))).toBe(0);
    // Le sortant ne bouge pas, et ce qui n'est pas commun reste à l'entrant.
    expect(await sharedOf(outgoing)).toEqual(before);
    expect(await redis.hmget(buildCanvasKeys(incoming).meta, "gaugeMaxStart", "width", "height")).toEqual([
      "7",
      "8",
      "8",
    ]);
  });

  // Remplace aussi par rien : ce que le sortant n'a pas, l'entrant ne le garde pas
  it("replaces by nothing too: what the outgoing canvas does not have, the incoming one does not keep", async () => {
    const [outgoing, incoming] = [uniqueCanvasId(), uniqueCanvasId()];
    await signIn.createCanvas(outgoing, meta);
    await signIn.createCanvas(incoming, meta);
    await seedShared(incoming, "u9");

    await writes.copyShared(outgoing, incoming);

    expect(await sharedOf(incoming)).toEqual({
      bans: [],
      bansTwitch: [],
      mods: [],
      modsTwitch: [],
      modsLiveplace: [],
      twitchUsers: {},
      metaFields: ["5000", "transparent", null, null],
      proofs: [],
    });
  });

  // Ne touche pas aux pixels : le dessin de l'entrant reste le sien
  it("leaves the pixels alone: the incoming drawing stays its own", async () => {
    const [outgoing, incoming] = [uniqueCanvasId(), uniqueCanvasId()];
    await signIn.createCanvas(outgoing, meta);
    await signIn.createCanvas(incoming, meta);
    await seedShared(outgoing, "u1");
    await redis.setrange(buildCanvasKeys(incoming).state, 2, "\x09");

    await writes.copyShared(outgoing, incoming);

    expect((await redis.getBuffer(buildCanvasKeys(incoming).state))?.[2]).toBe(9);
  });
});

describe("copying the progress (Écart §15, JOURNAL 2026-10-06)", () => {
  // Efface la progression de l'entrant puis recopie celle du sortant, jour compris, sans jamais copier la jauge
  it("erases the incoming progress then copies the outgoing one, day included, never the gauge", async () => {
    const [outgoing, incoming] = [uniqueCanvasId(), uniqueCanvasId()];
    const [from, to] = [buildCanvasKeys(outgoing), buildCanvasKeys(incoming)];
    await signIn.createCanvas(outgoing, meta);
    await signIn.createCanvas(incoming, meta);
    const day = { counted: 100, day: "2026-10-06", dayCounted: 20, claimed: 3 };
    await redis
      .multi()
      .hset(from.progress("u1"), day)
      .hset(from.progress("u2"), { ...day, claimed: 1 })
      .hset(from.gauge("u1"), { charges: 2, at: 1 })
      .hset(to.progress("u1"), { counted: 5, claimed: 0 })
      .hset(to.progress("u3"), { counted: 50, claimed: 2 })
      .hset(to.gauge("u3"), { charges: 1, at: 2 })
      .exec();

    await writes.copyProgress(outgoing, incoming);

    expect(await redis.hgetall(to.progress("u1"))).toEqual({
      ...day,
      counted: "100",
      dayCounted: "20",
      claimed: "3",
    });
    expect(await redis.hget(to.progress("u2"), "claimed")).toBe("1");
    expect(await redis.exists(to.progress("u3"))).toBe(0);
    expect(await redis.exists(to.gauge("u1"))).toBe(0);
    expect(await redis.hgetall(to.gauge("u3"))).toEqual({ charges: "1", at: "2" });
    expect(await redis.hget(from.progress("u1"), "counted")).toBe("100");
  });

  // Sur un canvas neuf, il n'y a rien à effacer : la progression arrive telle quelle
  it("has nothing to erase on a fresh canvas: the progress just arrives", async () => {
    const [outgoing, incoming] = [uniqueCanvasId(), uniqueCanvasId()];
    await signIn.createCanvas(outgoing, meta);
    await writes.prepareCanvas(incoming, meta);
    await redis.hset(buildCanvasKeys(outgoing).progress("u1"), { counted: 10, claimed: 0 });

    await writes.copyProgress(outgoing, incoming);

    expect(await redis.hget(buildCanvasKeys(incoming).progress("u1"), "counted")).toBe("10");
  });
});

describe("settling the reports (Écart §15, JOURNAL 2026-10-06)", () => {
  // Vide les signalements et les poses cachées du stream, et laisse les poses rétablies, les bannis et le reste
  it("empties the reports and the poses hidden from the stream, and leaves approved poses, bans and the rest", async () => {
    const canvasId = uniqueCanvasId();
    const keys = buildCanvasKeys(canvasId);
    await signIn.createCanvas(canvasId, meta);
    await redis
      .multi()
      .zadd(keys.reported, 1, "u1:p1", 2, "u2:p2")
      .sadd(keys.reports("u1:p1"), "r1", "r2")
      .sadd(keys.reports("u2:p2"), "r3")
      .sadd(keys.offStream, "u1:p1")
      .sadd(keys.approved, "u3:p3")
      .sadd(keys.bans, "banned-1")
      .exec();

    await writes.settleReports(canvasId);

    expect(await redis.zcard(keys.reported)).toBe(0);
    expect(await redis.exists(keys.reports("u1:p1"), keys.reports("u2:p2"), keys.offStream)).toBe(0);
    expect(await redis.smembers(keys.approved)).toEqual(["u3:p3"]);
    expect(await redis.smembers(keys.bans)).toEqual(["banned-1"]);
  });
});

describe("publishing the status (Écart §15, JOURNAL 2026-10-06)", () => {
  // Publie le statut sur le canal `live` du canvas, tel que le gateway le relit
  it("publishes the status on the live channel of the canvas, as the gateway reads it", async () => {
    const canvasId = uniqueCanvasId();
    const subscriber = redis.duplicate();
    const received: string[] = [];
    subscriber.on("message", (_channel: string, raw: string) => received.push(raw));
    await subscriber.subscribe(buildCanvasKeys(canvasId).live);
    try {
      await writes.publishStatus(canvasId, "archived");
      await writes.publishStatus(canvasId, "discarded");
      await new Promise((resolve) => setTimeout(resolve, 100));
    } finally {
      await subscriber.quit();
    }

    expect(received.map((raw) => JSON.parse(raw))).toEqual([
      { ctl: { t: "canvasStatus", status: "archived" } },
      { ctl: { t: "canvasStatus", status: "discarded" } },
    ]);
  });
});

describe("the theme of a canvas (Écart §8.1, JOURNAL 2026-10-07)", () => {
  const listen = async (canvasId: string) => {
    const subscriber = redis.duplicate();
    const received: string[] = [];
    subscriber.on("message", (_channel: string, raw: string) => received.push(raw));
    await subscriber.subscribe(buildCanvasKeys(canvasId).live);
    return { received, stop: () => subscriber.quit() };
  };

  // Écrit le thème dans meta, que getCanvas relit, sans rien publier ; sans thème, le champ part
  it("writes the theme into meta, which getCanvas reads back, publishing nothing; without a theme the field goes", async () => {
    const canvasId = uniqueCanvasId();
    await signIn.createCanvas(canvasId, meta);
    const { received, stop } = await listen(canvasId);
    try {
      await writes.setTheme(canvasId, "Halloween");
      expect(await writes.getCanvas(canvasId)).toEqual({ ...meta, theme: "Halloween" });

      await writes.setTheme(canvasId, undefined);
      expect(await writes.getCanvas(canvasId)).toEqual(meta);
      expect(await redis.hexists(buildCanvasKeys(canvasId).meta, "theme")).toBe(0);
      await new Promise((resolve) => setTimeout(resolve, 100));
    } finally {
      await stop();
    }

    expect(received).toEqual([]);
  });

  // Publie le thème sur le canal live, tel que le gateway le relit, et rien dans meta ; sans thème, une frame sans texte
  it("publishes the theme on the live channel as the gateway reads it, and nothing in meta; without one, a message without text", async () => {
    const canvasId = uniqueCanvasId();
    await signIn.createCanvas(canvasId, meta);
    const { received, stop } = await listen(canvasId);
    try {
      await writes.publishTheme(canvasId, "Halloween");
      await writes.publishTheme(canvasId, undefined);
      await new Promise((resolve) => setTimeout(resolve, 100));
    } finally {
      await stop();
    }

    expect(received.map((raw) => JSON.parse(raw))).toEqual([
      { ctl: { t: "theme", theme: "Halloween" } },
      { ctl: { t: "theme" } },
    ]);
    expect((await writes.getCanvas(canvasId))?.theme).toBeUndefined();
  });

  // Copier ce qui est commun ne touche pas au thème : chaque canvas garde le sien, le neuf n'a pas celui du sortant
  it("leaves the theme alone when copying what is shared: each canvas keeps its own, the new one gets none", async () => {
    const [outgoing, incoming] = [uniqueCanvasId(), uniqueCanvasId()];
    await signIn.createCanvas(outgoing, meta);
    await signIn.createCanvas(incoming, meta);
    await writes.setTheme(outgoing, "Halloween");

    await writes.copyShared(outgoing, incoming);

    expect((await writes.getCanvas(outgoing))?.theme).toBe("Halloween");
    expect((await writes.getCanvas(incoming))?.theme).toBeUndefined();
    await writes.setTheme(incoming, "Noël");
    await writes.copyShared(outgoing, incoming);
    expect((await writes.getCanvas(incoming))?.theme).toBe("Noël");
  });
});

describe("the background image of a canvas (Écart §8.1, JOURNAL 2026-10-10)", () => {
  const listen = async (canvasId: string) => {
    const subscriber = redis.duplicate();
    const received: string[] = [];
    subscriber.on("message", (_channel: string, raw: string) => received.push(raw));
    await subscriber.subscribe(buildCanvasKeys(canvasId).live);
    return { received, stop: () => subscriber.quit() };
  };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 100));

  // Pose l'instant de l'image dans meta et le publie au canal live ; le fond et l'opacité, eux, ne bougent pas
  it("puts the instant of the image into meta and publishes it on the live channel, leaving the background and the opacity alone", async () => {
    const canvasId = uniqueCanvasId();
    await signIn.createCanvas(canvasId, { ...meta, obsBackground: "white" });
    await redis.hset(buildCanvasKeys(canvasId).meta, "backgroundImageOpacity", 80);
    const { received, stop } = await listen(canvasId);
    try {
      await writes.setBackgroundImage(canvasId, 1_760_000_000_000);
      await settle();
    } finally {
      await stop();
    }

    expect(await writes.getCanvas(canvasId)).toEqual({
      ...meta,
      obsBackground: "white",
      backgroundImageOpacity: 80,
      backgroundImageAt: 1_760_000_000_000,
    });
    expect(received.map((raw) => JSON.parse(raw))).toEqual([
      { ctl: { t: "backgroundImage", at: 1_760_000_000_000 } },
    ]);
  });

  // Retirer l'image fait partir le champ et le dit en une frame ; le fond et l'opacité restent ce qu'ils étaient
  it("clears the field and says so in one frame, the background and the opacity staying what they were", async () => {
    const canvasId = uniqueCanvasId();
    await signIn.createCanvas(canvasId, { ...meta, obsBackground: "black" });
    await redis.hset(buildCanvasKeys(canvasId).meta, {
      backgroundImageAt: 1_760_000_000_000,
      backgroundImageOpacity: 30,
    });
    const { received, stop } = await listen(canvasId);
    try {
      await writes.clearBackgroundImage(canvasId);
      await settle();
    } finally {
      await stop();
    }

    expect(await writes.getCanvas(canvasId)).toEqual({
      ...meta,
      obsBackground: "black",
      backgroundImageOpacity: 30,
    });
    expect(await redis.hexists(buildCanvasKeys(canvasId).meta, "backgroundImageAt")).toBe(0);
    expect(received.map((raw) => JSON.parse(raw))).toEqual([{ ctl: { t: "backgroundImage" } }]);
  });

  // Une image remplacée est un autre instant : meta garde le dernier, et chaque pose le dit
  it("keeps the last instant in meta when the image is replaced, and says each one", async () => {
    const canvasId = uniqueCanvasId();
    await signIn.createCanvas(canvasId, meta);
    const { received, stop } = await listen(canvasId);
    try {
      await writes.setBackgroundImage(canvasId, 1_760_000_000_000);
      await writes.setBackgroundImage(canvasId, 1_770_000_000_000);
      await settle();
    } finally {
      await stop();
    }

    expect((await writes.getCanvas(canvasId))?.backgroundImageAt).toBe(1_770_000_000_000);
    expect(received.map((raw) => JSON.parse(raw))).toEqual([
      { ctl: { t: "backgroundImage", at: 1_760_000_000_000 } },
      { ctl: { t: "backgroundImage", at: 1_770_000_000_000 } },
    ]);
  });

  // Copier ce qui est commun recopie le fond, jamais l'image ni son opacité : chaque canvas garde les siennes
  it("copies the background when copying what is shared, never the image nor its opacity: each canvas keeps its own", async () => {
    const [outgoing, bare, owner] = [uniqueCanvasId(), uniqueCanvasId(), uniqueCanvasId()];
    await signIn.createCanvas(outgoing, { ...meta, obsBackground: "black" });
    await signIn.createCanvas(bare, meta);
    await signIn.createCanvas(owner, meta);
    await redis.hset(buildCanvasKeys(outgoing).meta, {
      backgroundImageAt: 1_760_000_000_000,
      backgroundImageOpacity: 80,
    });
    await writes.setBackgroundImage(owner, 1_770_000_000_000);

    await writes.copyShared(outgoing, bare);
    await writes.copyShared(outgoing, owner);

    expect(await writes.getCanvas(bare)).toEqual({ ...meta, obsBackground: "black" });
    expect(await writes.getCanvas(owner)).toEqual({
      ...meta,
      obsBackground: "black",
      backgroundImageAt: 1_770_000_000_000,
    });
  });
});

describe("discarding a canvas (Écart §15, JOURNAL 2026-10-06)", () => {
  // Efface toutes les clés du canvas, le classement et ses scores à l'écart compris, et pas celles d'un canvas dont
  // l'identifiant commence pareil
  it("erases every key of the canvas, scoreboard included, and not those of a canvas whose id starts the same", async () => {
    const canvasId = uniqueCanvasId();
    const sibling = `${canvasId}0`;
    for (const id of [canvasId, sibling]) {
      const keys = buildCanvasKeys(id);
      await signIn.createCanvas(id, meta);
      await redis.hset(keys.progress("u1"), { counted: 1 });
      await redis.sadd(keys.bans, "u1");
      await redis.zadd(keys.scoreboard, 5, "u2");
      await redis.hset(keys.scoreboardBanned, "u1", 7);
    }
    expect((await keysOf(canvasId)).length).toBeGreaterThan(4);

    await writes.discardCanvas(canvasId);

    expect(await keysOf(canvasId)).toEqual([]);
    expect(
      await redis.exists(buildCanvasKeys(canvasId).scoreboard, buildCanvasKeys(canvasId).scoreboardBanned),
    ).toBe(0);
    expect((await keysOf(sibling)).length).toBeGreaterThan(4);
    expect(await redis.zcard(buildCanvasKeys(sibling).scoreboard)).toBe(1);
  });

  // Efface un grand nombre de clés, au-delà d'un lot
  it("erases a large number of keys, past one batch", async () => {
    const canvasId = uniqueCanvasId();
    const keys = buildCanvasKeys(canvasId);
    await signIn.createCanvas(canvasId, meta);
    const pipeline = redis.pipeline();
    for (let user = 0; user < 1200; user++) pipeline.hset(keys.progress(`user-${user}`), { counted: user });
    await pipeline.exec();

    await writes.discardCanvas(canvasId);

    expect(await keysOf(canvasId)).toEqual([]);
  });

  // Refuse un identifiant qui ne serait pas celui d'un canvas : un motif ne balaie jamais les autres
  it("refuses an id that is no canvas id: a pattern never sweeps the others", async () => {
    const canvasId = uniqueCanvasId();
    await signIn.createCanvas(canvasId, meta);

    for (const wrong of ["", "*", `${runId}-*`, "a:b", "[abc]"])
      await expect(writes.discardCanvas(wrong)).rejects.toThrow("identifiant de canvas invalide");

    expect((await keysOf(canvasId)).length).toBeGreaterThan(0);
  });
});

describe("the image of a canvas (Écart §15, JOURNAL 2026-10-06)", () => {
  // Rend la taille et un octet par case, et rien pour un canvas absent
  it("gives the size and one byte per cell, and nothing for a missing canvas", async () => {
    const canvasId = uniqueCanvasId();
    await signIn.createCanvas(canvasId, meta);
    await redis.setrange(buildCanvasKeys(canvasId).state, 5, "\x07");

    const image = await writes.getCanvasImage(canvasId);

    expect(image).toEqual({
      width: 4,
      height: 3,
      state: Uint8Array.from([0, 0, 0, 0, 0, 7, 0, 0, 0, 0, 0, 0]),
    });
    expect(await writes.getCanvasImage(uniqueCanvasId())).toBeNull();
  });
});

describe("the lock of an owner (Écart §15, JOURNAL 2026-10-06)", () => {
  // Un seul preneur à la fois, qui seul le rend ; il expire de lui-même
  it("has a single holder at a time, who alone gives it back, and expires by itself", async () => {
    const ownerId = `${runId}-owner-1`;

    const first = await writes.acquireOwnerLock(ownerId);
    const second = await writes.acquireOwnerLock(ownerId);
    const ttl = await redis.pttl(ownerLockKey(ownerId));
    await writes.releaseOwnerLock({ ownerId, holderId: "someone-else" });
    const stillTaken = await writes.acquireOwnerLock(ownerId);
    if (first) await writes.releaseOwnerLock(first);
    const again = await writes.acquireOwnerLock(ownerId);

    expect(first).toEqual({ ownerId, holderId: expect.any(String) });
    expect(second).toBeNull();
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(OWNER_LOCK_TTL_MS);
    expect(stillTaken).toBeNull();
    expect(again).not.toBeNull();
  });

  // Deux demandes simultanées : une seule l'obtient
  it("lets only one of two simultaneous requests have it", async () => {
    const ownerId = `${runId}-owner-2`;

    const taken = await Promise.all([writes.acquireOwnerLock(ownerId), writes.acquireOwnerLock(ownerId)]);

    expect(taken.filter((lock) => lock !== null)).toHaveLength(1);
  });

  // Un verrou par propriétaire : l'un n'empêche pas l'autre
  it("is per owner: one does not stop another", async () => {
    const [one, other] = [`${runId}-owner-3`, `${runId}-owner-4`];

    expect(await writes.acquireOwnerLock(one)).not.toBeNull();
    expect(await writes.acquireOwnerLock(other)).not.toBeNull();
  });
});
