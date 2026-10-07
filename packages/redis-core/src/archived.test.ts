import { type CanvasMeta, defaultCanvasMeta, toCellKey } from "@liveplace/domain";
import { describe, expect, it } from "vitest";
import { createArchiveWrites } from "./archive-writes";
import { createRedisHarness } from "./test-harness";

// Écart §15 (JOURNAL 2026-10-06) : les six scripts qui écrivent refusent un canvas dont `meta.archivedAt` existe.
// Chaque test prend le même appel deux fois : sur le canvas actif, il passe ; une fois archivé, le script le refuse
// avant d'écrire quoi que ce soit.

const harness = createRedisHarness();
const { redis, core, runId } = harness;
const writes = createArchiveWrites(redis);

const OWNER = "owner-1";
const now = 1_700_000_000_000;

const meta: CanvasMeta = {
  ...defaultCanvasMeta(OWNER),
  width: 10,
  height: 10,
  gaugeMaxStart: 20,
  refillMs: 1000,
};

const readyCanvas = () => harness.readyCanvas(meta);

const archive = (canvasId: string) =>
  writes.markArchived(canvasId, { archivedAt: now, successorId: `${canvasId}-next` });

const placement = (requestId: string) => ({
  userId: "player-1",
  requestId,
  placementId: "pplayer1000000001",
  nowMs: now,
  pixels: [{ x: 1, y: 1, colorIndex: 5 }],
});

describe("an archived canvas refuses what writes (Écart §15, JOURNAL 2026-10-06)", () => {
  // place.lua : ni pixel, ni version, ni jauge, ni mémoire de la requête
  it("place.lua refuses a placement, writing no pixel, version, gauge nor request memo", async () => {
    const { canvasId, keys } = await readyCanvas();
    expect((await core.place(canvasId, placement("request-0"))).ok).toBe(true);
    await archive(canvasId);

    const refused = await core.place(canvasId, placement("request-1"));

    expect(refused).toEqual({ ok: false, error: "canvas_archived" });
    expect(await redis.get(keys.version)).toBe("1");
    expect((await redis.getBuffer(keys.state))?.[1 * meta.width + 1]).toBe(5);
    expect(await redis.exists(keys.req("player-1", "request-1"))).toBe(0);
    expect(await redis.hget(keys.progress("player-1"), "counted")).toBe("1");
    expect(await redis.llen(keys.hist(toCellKey(1, 1)))).toBe(1);
  });

  // claim.lua : ni récompense réclamée, ni jauge
  it("claim.lua refuses a claim, writing no reward nor gauge", async () => {
    const { canvasId, keys } = await readyCanvas();
    await redis.hset(keys.progress("player-1"), { counted: 400, claimed: 0 });
    const claim = (requestId: string) =>
      core.claimGauge(canvasId, { userId: "player-1", requestId, nowMs: now });
    expect(await claim("request-0")).toMatchObject({ ok: true, value: { accepted: 1 } });
    await archive(canvasId);

    const refused = await claim("request-1");

    expect(refused).toEqual({ ok: false, error: "canvas_archived" });
    expect(await redis.hget(keys.progress("player-1"), "claimed")).toBe("1");
    expect(await redis.exists(keys.req("player-1", "request-1"))).toBe(0);
  });

  // moderate.lua : ni ban, ni version
  it("moderate.lua refuses a moderation, writing no ban nor version", async () => {
    const { canvasId, keys } = await readyCanvas();
    const ban = (target: string) =>
      core.moderate(canvasId, { by: OWNER, nowMs: now, action: { action: "ban", target }, slice: "first" });
    expect((await ban("troll-0")).ok).toBe(true);
    await archive(canvasId);

    const refused = await ban("troll-1");

    expect(refused).toEqual({ ok: false, error: "canvas_archived" });
    expect(await redis.smembers(keys.bans)).toEqual(["troll-0"]);
    expect(await redis.get(keys.version)).toBe("1");
  });

  // moderators.lua : ni modérateur nommé, ni message de rôle
  it("moderators.lua refuses a named moderator, writing no moderator", async () => {
    const { canvasId, keys } = await readyCanvas();
    const name = (userId: string) =>
      core.setModerator(canvasId, { userId, source: "liveplace", isModerator: true });
    expect((await name("mod-0")).ok).toBe(true);
    await archive(canvasId);

    const refused = await name("mod-1");

    expect(refused).toEqual({ ok: false, error: "canvas_archived" });
    expect(await redis.smembers(keys.mods)).toEqual(["mod-0"]);
    expect(await redis.smembers(keys.modsLiveplace)).toEqual(["mod-0"]);
  });

  // report.lua : ni signalement, ni message de contrôle
  it("report.lua refuses a report, writing no report", async () => {
    const { canvasId, keys } = await readyCanvas();
    await core.place(canvasId, placement("request-0"));
    const report = (reporterId: string) =>
      core.report(canvasId, {
        reporterId,
        x: 1,
        y: 1,
        placementId: "pplayer1000000001",
        threshold: 1,
        nowMs: now,
      });
    expect((await report("reporter-0")).ok).toBe(true);
    await archive(canvasId);

    const refused = await report("reporter-1");

    expect(refused).toEqual({ ok: false, error: "canvas_archived" });
    expect(await redis.zcard(keys.reported)).toBe(1);
    expect(await redis.exists(keys.reports("player-1:pplayer1000000001"))).toBe(1);
    expect(await redis.sismember(keys.reports("player-1:pplayer1000000001"), "reporter-1")).toBe(0);
  });

  // resize.lua : ni taille, ni version
  it("resize.lua refuses a resize, writing no size nor version", async () => {
    const { canvasId, keys } = await readyCanvas();
    expect((await core.resizeCanvas(canvasId, { by: OWNER, width: 50, height: 50 })).ok).toBe(true);
    await archive(canvasId);

    const refused = await core.resizeCanvas(canvasId, { by: OWNER, width: 100, height: 100 });

    expect(refused).toEqual({ ok: false, error: "canvas_archived" });
    expect(await redis.hmget(keys.meta, "width", "height")).toEqual(["50", "50"]);
    expect(await redis.get(keys.version)).toBe("1");
    expect(await redis.strlen(keys.state)).toBe(2500);
  });

  // Le refus ne tient qu'au champ : une archive rouverte (`archivedAt` retiré) accepte de nouveau ses écritures
  it("holds on the field alone: a reopened archive, its archivedAt removed, accepts writes again", async () => {
    const { canvasId } = await readyCanvas();
    await archive(canvasId);
    expect(await core.place(canvasId, placement("request-0"))).toEqual({
      ok: false,
      error: "canvas_archived",
    });

    await writes.markActive(canvasId);

    expect((await core.place(canvasId, placement("request-1"))).ok).toBe(true);
  });

  // Un canvas absent reste « introuvable » : l'archivage ne change que ce qui est prêt
  it("keeps a missing canvas not found: archiving changes only what is ready", async () => {
    const missing = `${runId}-missing`;

    expect(await core.place(missing, placement("request-0"))).toEqual({
      ok: false,
      error: "canvas_not_found",
    });
  });
});

describe("following a Twitch name to the successor (Écart §15, JOURNAL 2026-10-06)", () => {
  // Recopie le nom Twitch de ceux qui y manquent, ne remplace jamais celui que le successeur connaît, ignore les inconnus
  it("copies the Twitch name of those missing there, never replaces what the successor knows, ignores unknown ones", async () => {
    const [from, to] = [await readyCanvas(), await readyCanvas()];
    await redis.hset(from.keys.twitchUsers, {
      u1: JSON.stringify({ login: "u1", displayName: "U1" }),
      u2: JSON.stringify({ login: "u2", displayName: "Ancien" }),
    });
    await redis.hset(to.keys.twitchUsers, { u2: JSON.stringify({ login: "u2", displayName: "Récent" }) });

    await core.copyTwitchUsers(from.canvasId, to.canvasId, ["u1", "u2", "u3"]);

    expect(await redis.hgetall(to.keys.twitchUsers)).toEqual({
      u1: JSON.stringify({ login: "u1", displayName: "U1" }),
      u2: JSON.stringify({ login: "u2", displayName: "Récent" }),
    });
  });

  // Sans personne à suivre, rien n'est lu ni écrit
  it("reads and writes nothing without anyone to follow", async () => {
    const [from, to] = [await readyCanvas(), await readyCanvas()];
    await redis.hset(from.keys.twitchUsers, { u1: JSON.stringify({ login: "u1", displayName: "U1" }) });

    await core.copyTwitchUsers(from.canvasId, to.canvasId, []);

    expect(await redis.exists(to.keys.twitchUsers)).toBe(0);
  });
});
