import { setTimeout as delay } from "node:timers/promises";
import { CANVAS_HEIGHT, CANVAS_WIDTH, type CanvasMeta, defaultCanvasMeta } from "@liveplace/domain";
import type { LiveMessage } from "@liveplace/domain/ports";
import { describe, expect, it } from "vitest";
import { revokeBannedModerators } from "./banned-moderators";
import { createRedisHarness } from "./test-harness";

const harness = createRedisHarness();
const { redis, core, runId } = harness;

const OWNER = "owner-1";
const later = 1_700_000_060_000;
const meta: CanvasMeta = { ...defaultCanvasMeta(OWNER), width: CANVAS_WIDTH, height: CANVAS_HEIGHT };

// Les canvas de ce fichier seulement : les autres tests partagent la base.
const revokeHere = () => revokeBannedModerators(redis, `${runId}-*`);

// L'état laissé par l'ancien bug, que les scripts ne savent plus écrire, est posé à la main dans chaque test.
describe("revokeBannedModerators (Écart §5.4, JOURNAL 2026-10-08)", () => {
  // Un modérateur nommé ici et banni perd son rôle, y compris dans mods ; ce que Twitch nomme, ou que personne ne bannit, reste
  it("removes the role named here from a banned moderator, mods included, and touches nobody else", async () => {
    const { canvasId, keys } = await harness.readyCanvas(meta);
    await redis.sadd(keys.modsLiveplace, "mod-banned", "mod-both-banned", "mod-free");
    await redis.sadd(keys.modsTwitch, "mod-both-banned", "mod-twitch-banned", "mod-twitch");
    await redis.sadd(
      keys.mods,
      "mod-banned",
      "mod-both-banned",
      "mod-free",
      "mod-twitch-banned",
      "mod-twitch",
    );
    await redis.sadd(keys.bans, "mod-banned", "mod-both-banned", "mod-twitch-banned", "troll");

    const revoked = await revokeHere();

    expect(revoked).toBe(2);
    expect((await redis.smembers(keys.modsLiveplace)).sort()).toEqual(["mod-free"]);
    expect((await redis.smembers(keys.mods)).sort()).toEqual(
      ["mod-both-banned", "mod-free", "mod-twitch", "mod-twitch-banned"].sort(),
    );
    expect((await redis.smembers(keys.modsTwitch)).sort()).toEqual(
      ["mod-both-banned", "mod-twitch", "mod-twitch-banned"].sort(),
    );
    expect((await redis.smembers(keys.bans)).sort()).toEqual(
      ["mod-banned", "mod-both-banned", "mod-twitch-banned", "troll"].sort(),
    );
    expect(await core.getModeratorOrigin(canvasId, "mod-banned")).toBeNull();
    expect(await core.getModeratorOrigin(canvasId, "mod-both-banned")).toEqual({
      isFromTwitch: true,
      isNamedHere: false,
    });
  });

  // Après le déban, le rôle nommé ici ne revient pas ; celui qui reste modérateur Twitch retrouve ses droits
  it("does not bring the role back on unban, while a Twitch moderator gets his rights back", async () => {
    const { canvasId, keys } = await harness.readyCanvas(meta);
    await redis.sadd(keys.modsLiveplace, "mod-banned", "mod-both-banned");
    await redis.sadd(keys.modsTwitch, "mod-both-banned");
    await redis.sadd(keys.mods, "mod-banned", "mod-both-banned");
    await redis.sadd(keys.bans, "mod-banned", "mod-both-banned");
    await revokeHere();

    for (const target of ["mod-banned", "mod-both-banned"]) {
      const result = await core.moderate(canvasId, {
        by: OWNER,
        nowMs: later,
        action: { action: "unban", target },
        slice: "first",
      });
      expect(result.ok).toBe(true);
    }

    expect(await core.isModerator(canvasId, "mod-banned")).toBe(false);
    expect(await core.isModerator(canvasId, "mod-both-banned")).toBe(true);
  });

  // Chaque canvas est traité, idempotent, et les sockets de la personne sont prévenues de son nouveau rôle
  it("handles every canvas, does nothing the second time, and tells the person's sockets about the role", async () => {
    const [first, second] = [await harness.readyCanvas(meta), await harness.readyCanvas(meta)];
    for (const { keys } of [first, second]) {
      await redis.sadd(keys.modsLiveplace, "mod-banned");
      await redis.sadd(keys.mods, "mod-banned");
      await redis.sadd(keys.bans, "mod-banned");
    }
    const received: LiveMessage[] = [];
    const unsubscribe = await core.subscribe(first.canvasId, (message) => received.push(message));

    const firstRun = await revokeHere();
    await delay(100);
    await unsubscribe();
    const secondRun = await revokeHere();

    expect([firstRun, secondRun]).toEqual([2, 0]);
    for (const { keys } of [first, second]) expect(await redis.exists(keys.modsLiveplace, keys.mods)).toBe(0);
    expect(received).toEqual([{ ctl: { t: "role", userId: "mod-banned" } }]);
  });

  // Un canvas sans banni nommé ici n'écrit rien
  it("writes nothing on a canvas where nobody named here is banned", async () => {
    const { keys } = await harness.readyCanvas(meta);
    await redis.sadd(keys.modsLiveplace, "mod-free");
    await redis.sadd(keys.mods, "mod-free");
    await redis.sadd(keys.bans, "troll");

    expect(await revokeHere()).toBe(0);
    expect(await redis.smembers(keys.modsLiveplace)).toEqual(["mod-free"]);
    expect(await redis.smembers(keys.mods)).toEqual(["mod-free"]);
  });
});
