import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  type CanvasMeta,
  defaultCanvasMeta,
  TRANSPARENT_COLOR_INDEX,
  toCellKey,
  toStateOffset,
} from "@liveplace/domain";
import type {
  LiveMessage,
  Moderation,
  ModerationSlice,
  ModerationSource,
  Pixel,
} from "@liveplace/domain/ports";
import type { Event } from "@liveplace/protocol";
import { describe, expect, it } from "vitest";
import { createSignInWrites, createTwitchWrites } from "./client";
import { CLEAR_SLICE_CELLS, userKey } from "./keys";
import { createRedisHarness } from "./test-harness";

const harness = createRedisHarness();
const { redis, core, runId } = harness;
const writes = createSignInWrites(redis);
const twitchWrites = createTwitchWrites(redis);

const OWNER = "owner-1";
const now = 1_700_000_000_000;
const later = now + 60_000;

// Une grande jauge : un troll de plus de 4096 pixels se pose en quelques lots.
const meta: CanvasMeta = {
  ...defaultCanvasMeta(OWNER),
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  gaugeMaxStart: 10_000,
  gaugeMaxCeiling: 10_000,
  refillMs: 1000,
  obsDelayMs: 5000,
};

const readyCanvas = () => harness.readyCanvas(meta);

const placeAs = (canvasId: string, userId: string, pixels: readonly Pixel[], nowMs = now) =>
  harness.placeInBatches(canvasId, userId, "ptest0001", pixels, nowMs);

const moderateOnce = async (canvasId: string, moderation: Moderation): Promise<ModerationSlice> => {
  const result = await core.moderate(canvasId, moderation);
  if (!result.ok) throw new Error(result.error);
  return result.value;
};

// Ce que fait le gateway : la première tranche, puis les suivantes jusqu'à la fin (§5.4).
const moderateAll = async (canvasId: string, by: string, action: Moderation["action"]) => {
  const slices = [await moderateOnce(canvasId, { by, nowMs: later, action, slice: "first" })];
  while (!slices.at(-1)?.isDone)
    slices.push(await moderateOnce(canvasId, { by, nowMs: later, action, slice: "next" }));
  return slices;
};

const clearUser = (target: string) => ({ action: "clearUser", target }) as const;
const ban = (target: string) => ({ action: "ban", target }) as const;
const unban = (target: string) => ({ action: "unban", target }) as const;

const colorAt = (canvasId: string, x: number, y: number) => harness.colorAt(canvasId, x, y, meta.width);

const eventAt = async (events: string, version: number): Promise<Event> => {
  const entries = await redis.xrange(events, `${version}-0`, `${version}-0`);
  return JSON.parse(entries[0]?.[1][1] ?? "null");
};

// `count` cases distinctes, ligne après ligne, toutes de la même couleur.
const squareOf = (count: number, colorIndex: number): Pixel[] =>
  Array.from({ length: count }, (_, index) => ({
    x: index % meta.width,
    y: Math.floor(index / meta.width),
    colorIndex,
  }));

describe("clearUser (§5.4)", () => {
  // Rend la couleur et l'auteur du dessous, et une case vide quand l'auteur était seul
  it("restores the color and author below, and empties a cell the author was alone on", async () => {
    const { canvasId, keys } = await readyCanvas();
    await placeAs(canvasId, "author-a", [{ x: 3, y: 2, colorIndex: 5 }], now);
    await placeAs(canvasId, "troll", [
      { x: 3, y: 2, colorIndex: 6 },
      { x: 4, y: 2, colorIndex: 7 },
    ]);

    const slices = await moderateAll(canvasId, OWNER, clearUser("troll"));

    expect(slices).toEqual([{ version: 3, cells: 2, isDone: true }]);
    expect(await colorAt(canvasId, 3, 2)).toBe(5);
    expect(await colorAt(canvasId, 4, 2)).toBe(TRANSPARENT_COLOR_INDEX);
    expect(await core.inspect(canvasId, 3, 2)).toMatchObject({ userId: "author-a", colorIndex: 5 });
    expect(await core.inspect(canvasId, 4, 2)).toBeNull();
    expect(await redis.exists(keys.hist(toCellKey(4, 2)), keys.cells("troll"), keys.clearing("troll"))).toBe(
      0,
    );
    expect(await redis.smembers(keys.cells("author-a"))).toEqual([String(toCellKey(3, 2))]);
    expect(await redis.hget(keys.cleared, "troll")).toBe("3");
    const event = await eventAt(keys.events, 3);
    expect(event).toMatchObject({
      version: 3,
      kind: "clear",
      authorId: OWNER,
      occurredAt: later,
      moderation: { action: "clearUser", target: "troll" },
    });
    expect(event.cells).toEqual(
      expect.arrayContaining([
        { x: 3, y: 2, colorIndex: 5, previousColorIndex: 6, placedAt: now },
        { x: 4, y: 2, colorIndex: TRANSPARENT_COLOR_INDEX, previousColorIndex: 7, placedAt: later },
      ]),
    );
  });

  // Ne fait jamais revenir un pixel enterré d'un auteur retiré, même quand on retire celui qui le couvrait (D-16)
  it("never brings back a buried pixel of a cleared author, even once its cover is cleared", async () => {
    const { canvasId, keys } = await readyCanvas();
    const cell = { x: 8, y: 9 };
    await placeAs(canvasId, "author-a", [{ ...cell, colorIndex: 2 }]);
    await placeAs(canvasId, "troll", [{ ...cell, colorIndex: 3 }]);
    await placeAs(canvasId, "author-c", [{ ...cell, colorIndex: 4 }]);

    // Le troll n'est plus visible ici : rien ne change à l'écran, mais la version avance quand même.
    expect(await moderateAll(canvasId, OWNER, clearUser("troll"))).toEqual([
      { version: 4, cells: 0, isDone: true },
    ]);
    expect(await colorAt(canvasId, cell.x, cell.y)).toBe(4);

    await moderateAll(canvasId, OWNER, clearUser("author-c"));

    expect(await colorAt(canvasId, cell.x, cell.y)).toBe(2);
    expect(await core.inspect(canvasId, cell.x, cell.y)).toMatchObject({ userId: "author-a" });
    expect(await redis.lrange(keys.hist(toCellKey(cell.x, cell.y)), 0, -1)).toEqual([
      `author-a:2:${now}:1:ptest0001`,
    ]);
  });

  // Fait revenir le pixel qu'un coup de gomme retiré avait effacé
  it("brings back the pixel that a cleared eraser had wiped", async () => {
    const { canvasId } = await readyCanvas();
    await placeAs(canvasId, "author-a", [{ x: 1, y: 1, colorIndex: 9 }]);
    await placeAs(canvasId, "troll", [{ x: 1, y: 1, colorIndex: TRANSPARENT_COLOR_INDEX }]);

    await moderateAll(canvasId, OWNER, clearUser("troll"));

    expect(await colorAt(canvasId, 1, 1)).toBe(9);
  });

  // Retire plus de 4096 cases en plusieurs tranches, sans en oublier une
  it("clears more than 4096 cells in several slices without missing one", async () => {
    const { canvasId, keys } = await readyCanvas();
    const pixels = squareOf(CLEAR_SLICE_CELLS + 4, 6);
    await placeAs(canvasId, "troll", pixels);

    const slices = await moderateAll(canvasId, OWNER, clearUser("troll"));

    expect(slices.map(({ cells, isDone }) => ({ cells, isDone }))).toEqual([
      { cells: CLEAR_SLICE_CELLS, isDone: false },
      { cells: 4, isDone: true },
    ]);
    const state = await redis.getBuffer(keys.state);
    expect(pixels.filter(({ x, y }) => state?.[toStateOffset(x, y, meta.width)] !== 0)).toEqual([]);
    expect(await redis.exists(keys.clearing("troll"), keys.cells("troll"))).toBe(0);
  });

  // Garde les pixels que la cible pose après le début du retrait : retirer n'est pas bannir
  it("keeps the pixels the target places after the clear began", async () => {
    const { canvasId } = await readyCanvas();
    await placeAs(canvasId, "troll", squareOf(CLEAR_SLICE_CELLS + 4, 6));
    const first = await moderateOnce(canvasId, {
      by: OWNER,
      nowMs: later,
      action: clearUser("troll"),
      slice: "first",
    });
    await placeAs(
      canvasId,
      "troll",
      [
        { x: 0, y: 200, colorIndex: 7 },
        { x: 0, y: 0, colorIndex: 7 },
        { x: 3, y: 16, colorIndex: 7 },
      ],
      later + 1,
    );

    const next = await moderateOnce(canvasId, {
      by: OWNER,
      nowMs: later,
      action: clearUser("troll"),
      slice: "next",
    });

    expect(first.isDone).toBe(false);
    expect(next.isDone).toBe(true);
    expect(await colorAt(canvasId, 0, 200)).toBe(7);
    expect(await colorAt(canvasId, 0, 0)).toBe(7);
    expect(await colorAt(canvasId, 3, 16)).toBe(7);
    expect(await colorAt(canvasId, 1, 0)).toBe(TRANSPARENT_COLOR_INDEX);
  });

  // Reprend au clearUser suivant un retrait interrompu après sa première tranche
  it("resumes an interrupted clear on the next clearUser of the same target", async () => {
    const { canvasId, keys } = await readyCanvas();
    const pixels = squareOf(CLEAR_SLICE_CELLS + 4, 6);
    await placeAs(canvasId, "troll", pixels);
    await moderateOnce(canvasId, { by: OWNER, nowMs: later, action: clearUser("troll"), slice: "first" });

    expect(await redis.scard(keys.clearing("troll"))).toBe(4);
    await moderateAll(canvasId, OWNER, clearUser("troll"));

    const state = await redis.getBuffer(keys.state);
    expect(pixels.filter(({ x, y }) => state?.[toStateOffset(x, y, meta.width)] !== 0)).toEqual([]);
    expect(await redis.exists(keys.clearing("troll"))).toBe(0);
  });
});

describe("ban and unban (§5.4, JOURNAL 2026-09-25)", () => {
  // Bannit : entre dans le stream sans case, publie l'événement puis le ctl, et place.lua refuse tout ensuite
  it("bans: enters the stream with no cell, publishes the event then the ctl, and place refuses everything", async () => {
    const { canvasId, keys } = await readyCanvas();
    const received: LiveMessage[] = [];
    const unsubscribe = await core.subscribe(canvasId, (message) => received.push(message));

    const slices = await moderateAll(canvasId, OWNER, ban("troll"));
    await delay(100);
    await unsubscribe();

    expect(slices).toEqual([{ version: 1, cells: 0, isDone: true }]);
    expect(await core.isBanned(canvasId, "troll")).toBe(true);
    expect(await core.isBanned(canvasId, "author-a")).toBe(false);
    const event = await eventAt(keys.events, 1);
    expect(event).toEqual({
      version: 1,
      kind: "clear",
      authorId: OWNER,
      occurredAt: later,
      cells: [],
      moderation: { action: "ban", target: "troll" },
    });
    expect(received).toEqual([{ e: event }, { ctl: { t: "banned", userId: "troll" } }]);
    const refused = await core.place(canvasId, {
      userId: "troll",
      requestId: randomUUID(),
      placementId: "ptest0001",
      nowMs: later,
      pixels: [{ x: 0, y: 0, colorIndex: 1 }],
    });
    expect(refused.ok && refused.value.rejected).toEqual([{ index: 0, reason: "banned" }]);
  });

  // Garde la preuve du ban, ses pixels visibles, et ne la réécrit jamais par un second ban
  it("keeps the proof of a ban, the target's visible pixels, and never overwrites it with a second ban", async () => {
    const { canvasId } = await readyCanvas();
    await placeAs(canvasId, "troll", [
      { x: 1, y: 1, colorIndex: 4 },
      { x: 2, y: 1, colorIndex: 5 },
      { x: 3, y: 1, colorIndex: 6 },
    ]);
    await placeAs(canvasId, "author-a", [{ x: 3, y: 1, colorIndex: 8 }]);
    const proof = [
      { x: 1, y: 1, colorIndex: 4 },
      { x: 2, y: 1, colorIndex: 5 },
    ];

    const visible = proof.map((pixel) => ({ ...pixel, placedAt: now, placementId: "ptest0001" }));
    expect(await core.listPixels(canvasId, "troll")).toEqual(expect.arrayContaining(visible));
    await moderateAll(canvasId, OWNER, ban("troll"));
    await moderateAll(canvasId, OWNER, clearUser("troll"));
    await moderateAll(canvasId, OWNER, ban("troll"));

    const listed = await core.listPixels(canvasId, "troll");
    expect(listed).toHaveLength(2);
    expect(listed).toEqual(expect.arrayContaining(proof));
    expect(await colorAt(canvasId, 1, 1)).toBe(TRANSPARENT_COLOR_INDEX);
  });

  // Débannit : il pose de nouveau, ses pixels retirés ne reviennent pas, sa preuve disparaît
  it("unbans: the target places again, its cleared pixels never return, and its proof is gone", async () => {
    const { canvasId, keys } = await readyCanvas();
    await placeAs(canvasId, "troll", [{ x: 5, y: 5, colorIndex: 4 }]);
    await moderateAll(canvasId, OWNER, ban("troll"));
    await moderateAll(canvasId, OWNER, clearUser("troll"));
    const received: LiveMessage[] = [];
    const unsubscribe = await core.subscribe(canvasId, (message) => received.push(message));

    await moderateAll(canvasId, OWNER, unban("troll"));
    await delay(100);
    await unsubscribe();
    await placeAs(canvasId, "troll", [{ x: 6, y: 5, colorIndex: 7 }], later + 1);

    expect(received.at(-1)).toEqual({ ctl: { t: "unbanned", userId: "troll" } });
    expect(await core.isBanned(canvasId, "troll")).toBe(false);
    expect(await redis.exists(keys.ban("troll"))).toBe(0);
    expect(await colorAt(canvasId, 5, 5)).toBe(TRANSPARENT_COLOR_INDEX);
    expect(await core.listPixels(canvasId, "troll")).toEqual([
      { x: 6, y: 5, colorIndex: 7, placedAt: later + 1, placementId: "ptest0001" },
    ]);
  });

  // Liste les bannis avec leur miroir et le nombre de pixels de leur preuve
  it("lists the banned users with their mirror and the pixel count of their proof", async () => {
    const { canvasId } = await readyCanvas();
    const [troll, spammer] = [`${runId}-troll`, `${runId}-spammer`];
    await writes.setUser({
      userId: troll,
      login: "troll42",
      displayName: "Troll42",
      avatarUrl: "https://a/t.png",
    });
    await placeAs(canvasId, troll, squareOf(3, 4));
    await moderateAll(canvasId, OWNER, ban(troll));
    await moderateAll(canvasId, OWNER, ban(spammer));

    expect(await core.listBans(canvasId)).toEqual([
      {
        userId: spammer,
        login: spammer,
        displayName: spammer,
        pixelCount: 0,
        isFromTwitch: false,
        hasAccount: false,
      },
      {
        userId: troll,
        login: "troll42",
        displayName: "Troll42",
        avatarUrl: "https://a/t.png",
        pixelCount: 3,
        isFromTwitch: false,
        hasAccount: true,
      },
    ]);
    expect(await redis.exists(userKey(spammer))).toBe(0);
  });
});

describe("the origin of a ban (JOURNAL 2026-09-27)", () => {
  const byTwitch = async (canvasId: string, action: Moderation["action"]) =>
    moderateOnce(canvasId, { by: OWNER, nowMs: later, action, slice: "first", source: "twitch" });

  // Un ban venu de Twitch est retenu comme tel, et un déban Twitch le lève
  it("remembers a Twitch ban as such, and a Twitch unban lifts it", async () => {
    const { canvasId, keys } = await readyCanvas();

    await byTwitch(canvasId, ban("troll"));
    expect(await redis.sismember(keys.bansTwitch, "troll")).toBe(1);

    await byTwitch(canvasId, unban("troll"));
    expect(await core.isBanned(canvasId, "troll")).toBe(false);
    expect(await redis.sismember(keys.bansTwitch, "troll")).toBe(0);
  });

  // Un déban Twitch ne lève jamais un ban posé sur LivePlace, et n'écrit rien
  it("never lifts a LivePlace ban on a Twitch unban, and writes nothing", async () => {
    const { canvasId, keys } = await readyCanvas();
    await moderateAll(canvasId, OWNER, ban("troll"));

    const skipped = await byTwitch(canvasId, unban("troll"));

    expect(skipped).toEqual({ version: 1, cells: 0, isDone: true });
    expect(await redis.get(keys.version)).toBe("1");
    expect(await core.isBanned(canvasId, "troll")).toBe(true);
  });

  // Banni ici puis sur Twitch, il reste un ban LivePlace : le déban Twitch ne le lève pas
  it("keeps a LivePlace ban that Twitch bans again: the Twitch unban leaves it", async () => {
    const { canvasId, keys } = await readyCanvas();
    await moderateAll(canvasId, OWNER, ban("troll"));

    await byTwitch(canvasId, ban("troll"));
    await byTwitch(canvasId, unban("troll"));

    expect(await redis.sismember(keys.bansTwitch, "troll")).toBe(0);
    expect(await core.isBanned(canvasId, "troll")).toBe(true);
  });

  // Marque un ban venu de Twitch, et nomme par son nom Twitch un banni sans compte
  it("marks a ban from Twitch, and names a banned user without an account by their Twitch name", async () => {
    const { canvasId } = await readyCanvas();
    const troll = `${runId}-twitch-troll`;
    await twitchWrites.setTwitchUsers(canvasId, [
      { userId: troll, login: "trolltv", displayName: "TrollTV" },
    ]);

    await byTwitch(canvasId, ban(troll));

    expect(await core.listBans(canvasId)).toEqual([
      {
        userId: troll,
        login: "trolltv",
        displayName: "TrollTV",
        pixelCount: 0,
        isFromTwitch: true,
        hasAccount: false,
      },
    ]);
  });

  // Un déban LivePlace oublie aussi l'origine Twitch
  it("forgets the Twitch origin on a LivePlace unban", async () => {
    const { canvasId, keys } = await readyCanvas();
    await byTwitch(canvasId, ban("troll"));

    await moderateAll(canvasId, OWNER, unban("troll"));
    await moderateAll(canvasId, OWNER, ban("troll"));
    await byTwitch(canvasId, unban("troll"));

    expect(await redis.sismember(keys.bansTwitch, "troll")).toBe(0);
    expect(await core.isBanned(canvasId, "troll")).toBe(true);
  });
});

describe("moderators and their origin (JOURNAL 2026-09-27)", () => {
  const setModerator = async (
    canvasId: string,
    userId: string,
    source: ModerationSource,
    isModerator: boolean,
  ) => {
    const result = await core.setModerator(canvasId, { userId, source, isModerator });
    if (!result.ok) throw new Error(result.error);
  };

  // Un modérateur nommé sur Twitch et ici le reste tant qu'une des deux origines le garde
  it("keeps a moderator named on Twitch and here until both origins let go", async () => {
    const { canvasId } = await readyCanvas();

    await setModerator(canvasId, "mod-1", "twitch", true);
    await setModerator(canvasId, "mod-1", "liveplace", true);
    await setModerator(canvasId, "mod-1", "twitch", false);
    expect(await core.isModerator(canvasId, "mod-1")).toBe(true);

    await setModerator(canvasId, "mod-1", "liveplace", false);
    expect(await core.isModerator(canvasId, "mod-1")).toBe(false);
  });

  // Ne fait jamais du propriétaire un modérateur, et publie chaque changement de rôle
  it("never makes the owner a moderator, and publishes each role change", async () => {
    const { canvasId, keys } = await readyCanvas();
    const received: LiveMessage[] = [];
    const unsubscribe = await core.subscribe(canvasId, (message) => received.push(message));

    const refused = await core.setModerator(canvasId, { userId: OWNER, source: "twitch", isModerator: true });
    await setModerator(canvasId, "mod-1", "twitch", true);
    await delay(100);
    await unsubscribe();

    expect(refused).toEqual({ ok: false, error: "forbidden" });
    expect(await redis.sismember(keys.mods, OWNER)).toBe(0);
    expect(received).toEqual([{ ctl: { t: "role", userId: "mod-1" } }]);
  });

  // Dit d'où vient un modérateur, et rien pour qui ne l'est pas
  it("tells where a moderator comes from, and nothing for someone who is not one", async () => {
    const { canvasId } = await readyCanvas();
    await setModerator(canvasId, "mod-1", "twitch", true);
    await setModerator(canvasId, "mod-1", "liveplace", true);

    expect(await core.getModeratorOrigin(canvasId, "mod-1")).toEqual({
      isFromTwitch: true,
      isNamedHere: true,
    });
    expect(await core.getModeratorOrigin(canvasId, "viewer-1")).toBeNull();
  });

  // Liste les modérateurs avec leur origine, leur miroir ou leur nom Twitch, et s'ils ont un compte
  it("lists the moderators with their origin, their mirror or Twitch name, and whether they have an account", async () => {
    const { canvasId } = await readyCanvas();
    const [withAccount, withoutAccount] = [`${runId}-mod-a`, `${runId}-mod-b`];
    await writes.setUser({
      userId: withAccount,
      login: "moda",
      displayName: "ModA",
      avatarUrl: "https://a/m.png",
    });
    await twitchWrites.setTwitchUsers(canvasId, [
      { userId: withoutAccount, login: "modb", displayName: "ModB" },
    ]);
    await setModerator(canvasId, withAccount, "liveplace", true);
    await setModerator(canvasId, withoutAccount, "twitch", true);

    expect(await core.listModerators(canvasId)).toEqual([
      {
        userId: withAccount,
        login: "moda",
        displayName: "ModA",
        avatarUrl: "https://a/m.png",
        isFromTwitch: false,
        isNamedHere: true,
        hasAccount: true,
      },
      {
        userId: withoutAccount,
        login: "modb",
        displayName: "ModB",
        isFromTwitch: true,
        isNamedHere: false,
        hasAccount: false,
      },
    ]);
  });
});

describe("a moderator named here is never banned, and a banned one moderates nothing (Écart §5.4, JOURNAL 2026-10-08)", () => {
  const nameModerator = async (canvasId: string, userId: string, source: ModerationSource) => {
    const result = await core.setModerator(canvasId, { userId, source, isModerator: true });
    if (!result.ok) throw new Error(result.error);
  };
  const FORBIDDEN = { ok: false, error: "forbidden" } as const;

  // Refuse le ban d'un modérateur nommé ici, par le streamer, par un autre modérateur, ou depuis Twitch, sans rien écrire
  it("refuses to ban a moderator named here, by the owner, by another moderator and from Twitch, and writes nothing", async () => {
    const { canvasId, keys } = await readyCanvas();
    await nameModerator(canvasId, "mod-here", "liveplace");
    await nameModerator(canvasId, "mod-other", "twitch");
    const banBy = (by: string, source?: ModerationSource) =>
      core.moderate(canvasId, {
        by,
        nowMs: later,
        action: ban("mod-here"),
        slice: "first",
        ...(source ? { source } : {}),
      });

    expect(await banBy(OWNER)).toEqual(FORBIDDEN);
    expect(await banBy("mod-other")).toEqual(FORBIDDEN);
    expect(await banBy(OWNER, "twitch")).toEqual(FORBIDDEN);

    expect(await core.isBanned(canvasId, "mod-here")).toBe(false);
    expect(await redis.exists(keys.bans, keys.bansTwitch)).toBe(0);
    expect(await redis.get(keys.version)).toBe("0");
    expect(await redis.xlen(keys.events)).toBe(0);
    expect(await core.isModerator(canvasId, "mod-here")).toBe(true);
  });

  // Refuse aussi le ban d'un modérateur nommé ici qui est en plus modérateur Twitch
  it("refuses to ban a moderator named here who is also a Twitch moderator", async () => {
    const { canvasId } = await readyCanvas();
    await nameModerator(canvasId, "mod-both", "twitch");
    await nameModerator(canvasId, "mod-both", "liveplace");

    expect(
      await core.moderate(canvasId, { by: OWNER, nowMs: later, action: ban("mod-both"), slice: "first" }),
    ).toEqual(FORBIDDEN);
    expect(await core.isBanned(canvasId, "mod-both")).toBe(false);
  });

  // Une fois son rôle retiré ici, il se bannit comme n'importe qui ; encore modérateur Twitch, il ne modère rien banni
  it("bans him once his role here is removed, and, still a Twitch moderator, he moderates nothing while banned", async () => {
    const { canvasId } = await readyCanvas();
    await nameModerator(canvasId, "mod-both", "twitch");
    await nameModerator(canvasId, "mod-both", "liveplace");
    await core.setModerator(canvasId, { userId: "mod-both", source: "liveplace", isModerator: false });

    await moderateAll(canvasId, OWNER, ban("mod-both"));

    expect(await core.isBanned(canvasId, "mod-both")).toBe(true);
    expect(await core.isModerator(canvasId, "mod-both")).toBe(false);
  });

  // Un modérateur Twitch banni reste listé, mais toutes ses actions sont refusées, se débannir compris ; son déban lui rend ses droits
  it("keeps a banned Twitch moderator listed but refuses all his actions, his own unban included, until he is unbanned", async () => {
    const { canvasId, keys } = await readyCanvas();
    await placeAs(canvasId, "troll", [{ x: 0, y: 0, colorIndex: 3 }]);
    await nameModerator(canvasId, "mod-twitch", "twitch");
    await moderateAll(canvasId, OWNER, ban("mod-twitch"));
    const versionBefore = await redis.get(keys.version);
    const asBanned = (action: Moderation["action"]) =>
      core.moderate(canvasId, { by: "mod-twitch", nowMs: later, action, slice: "first" });

    const refused = [
      await asBanned(clearUser("troll")),
      await asBanned({ action: "clearPlacement", target: "troll", placementId: "ptest0001" }),
      await asBanned({ action: "approvePlacement", target: "troll", placementId: "ptest0001" }),
      await asBanned(ban("troll")),
      await asBanned(unban("mod-twitch")),
    ];

    expect(refused).toEqual(Array(5).fill(FORBIDDEN));
    expect(await redis.get(keys.version)).toBe(versionBefore);
    expect(await colorAt(canvasId, 0, 0)).toBe(3);
    expect(await core.isBanned(canvasId, "mod-twitch")).toBe(true);
    expect(await core.listModerators(canvasId)).toMatchObject([
      { userId: "mod-twitch", isFromTwitch: true, isNamedHere: false },
    ]);

    // Twitch le nomme encore à la synchro suivante : cela ne rouvre rien
    const synced = await core.setModerator(canvasId, {
      userId: "mod-twitch",
      source: "twitch",
      isModerator: true,
    });
    expect(synced).toEqual({ ok: true, value: undefined });
    expect(await core.isModerator(canvasId, "mod-twitch")).toBe(false);
    expect(await asBanned(clearUser("troll"))).toEqual(FORBIDDEN);

    await moderateAll(canvasId, OWNER, unban("mod-twitch"));
    expect(await core.isModerator(canvasId, "mod-twitch")).toBe(true);
    await moderateAll(canvasId, "mod-twitch", clearUser("troll"));
    expect(await colorAt(canvasId, 0, 0)).toBe(TRANSPARENT_COLOR_INDEX);
  });

  // Refuse de nommer ici un banni, laisse Twitch le nommer, et laisse le streamer retirer le rôle d'un banni
  it("refuses to name a banned account as moderator here, lets Twitch name them, and lets the owner remove the role of a banned one", async () => {
    const { canvasId, keys } = await readyCanvas();
    await moderateAll(canvasId, OWNER, ban("troll"));

    const named = await core.setModerator(canvasId, {
      userId: "troll",
      source: "liveplace",
      isModerator: true,
    });

    expect(named).toEqual(FORBIDDEN);
    expect(await redis.sismember(keys.modsLiveplace, "troll")).toBe(0);
    expect(await redis.sismember(keys.mods, "troll")).toBe(0);
    await nameModerator(canvasId, "troll", "twitch");
    expect(await redis.sismember(keys.mods, "troll")).toBe(1);

    // L'état laissé par l'ancien bug : nommé ici et banni
    await redis.sadd(keys.modsLiveplace, "legacy");
    await redis.sadd(keys.mods, "legacy");
    await redis.sadd(keys.bans, "legacy");
    const removed = await core.setModerator(canvasId, {
      userId: "legacy",
      source: "liveplace",
      isModerator: false,
    });
    expect(removed).toEqual({ ok: true, value: undefined });
    expect(await redis.sismember(keys.mods, "legacy")).toBe(0);
  });
});

describe("the rights of moderate (§5.4)", () => {
  // Refuse un viewer, et toute action qui vise le propriétaire, sans rien écrire
  it("refuses a viewer, and any action aimed at the owner, and writes nothing", async () => {
    const { canvasId, keys } = await readyCanvas();
    await placeAs(canvasId, "troll", [{ x: 0, y: 0, colorIndex: 3 }]);
    await redis.sadd(keys.mods, "moderator-1");

    const byViewer = { by: "viewer-1", nowMs: later, action: clearUser("troll"), slice: "first" } as const;
    const atOwner = { by: "moderator-1", nowMs: later, action: ban(OWNER), slice: "first" } as const;
    expect(await core.moderate(canvasId, byViewer)).toEqual({ ok: false, error: "forbidden" });
    expect(await core.moderate(canvasId, atOwner)).toEqual({ ok: false, error: "forbidden" });
    expect(await redis.get(keys.version)).toBe("1");
    expect(await redis.exists(keys.bans, keys.cleared)).toBe(0);

    await moderateAll(canvasId, "moderator-1", clearUser("troll"));
    expect(await colorAt(canvasId, 0, 0)).toBe(TRANSPARENT_COLOR_INDEX);
  });

  // Refuse un canvas pas prêt
  it("refuses a canvas that is not ready", async () => {
    const { canvasId, keys } = await readyCanvas();
    await redis.hset(keys.meta, "ready", "0");

    expect(
      await core.moderate(canvasId, { by: OWNER, nowMs: later, action: ban("troll"), slice: "first" }),
    ).toEqual({ ok: false, error: "canvas_not_found" });
  });
});
