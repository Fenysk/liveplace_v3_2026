import { randomUUID } from "node:crypto";
import {
  type CanvasMeta,
  COUNTED_PIXELS_PER_DAY,
  defaultCanvasMeta,
  SCOREBOARD_SIZE,
  TRANSPARENT_COLOR_INDEX,
} from "@liveplace/domain";
import type { Moderation, ModerationSource, Pixel } from "@liveplace/domain/ports";
import { describe, expect, it } from "vitest";
import { SCORE_TIE_SPAN } from "./keys";
import { createRedisHarness } from "./test-harness";

const harness = createRedisHarness();
const { redis, core, runId } = harness;

const OWNER = "owner-1";
const now = 1_700_000_000_000;

// Une grande jauge : le comptage n'a pas à attendre une recharge.
const meta: CanvasMeta = {
  ...defaultCanvasMeta(OWNER),
  width: 64,
  height: 64,
  gaugeMaxStart: 5000,
  gaugeMaxCeiling: 5000,
};

const readyCanvas = (overrides: Partial<CanvasMeta> = {}) => harness.readyCanvas({ ...meta, ...overrides });

// Un joueur par exécution : le nettoyage du harnais ne cherche que `user:<runId>-*`.
const playerOf = (name: string) => `${runId}-${name}`;

// `count` cases distinctes, ligne après ligne, à partir de la case `from`.
const squareOf = (count: number, colorIndex = 1, from = 0): Pixel[] =>
  Array.from({ length: count }, (_, index) => ({
    x: (from + index) % meta.width,
    y: Math.floor((from + index) / meta.width),
    colorIndex,
  }));

const placeAs = async (canvasId: string, userId: string, pixels: Pixel[]) => {
  const result = await core.place(canvasId, {
    userId,
    requestId: randomUUID(),
    placementId: "ptest0001",
    nowMs: now,
    pixels,
  });
  if (!result.ok) throw new Error(result.error);
  return result.value;
};

const moderate = async (
  canvasId: string,
  action: "ban" | "unban" | "clearUser",
  target: string,
  source: ModerationSource = "liveplace",
) => {
  const moderation: Moderation = {
    by: OWNER,
    nowMs: now,
    action: { action, target },
    slice: "first",
    source,
  };
  const result = await core.moderate(canvasId, moderation);
  if (!result.ok) throw new Error(result.error);
  return result.value;
};

const namesOf = async (canvasId: string) => (await core.listScoreboard(canvasId)).map((row) => row.login);

describe("the scoreboard of a canvas (JOURNAL 2026-10-06)", () => {
  // Compte chaque pixel accepté sans plafond, et garde la progression des bonus de jauge à part
  it("counts each accepted pixel with no cap, apart from the progress of the gauge bonuses", async () => {
    const { canvasId, keys } = await readyCanvas();
    const player = playerOf("ada");
    const count = COUNTED_PIXELS_PER_DAY + 100;

    await harness.placeInBatches(canvasId, player, "ptest0001", squareOf(count), now);

    expect(await core.listScoreboard(canvasId)).toEqual([
      { login: player, displayName: player, pixels: count },
    ]);
    expect(await redis.hget(keys.progress(player), "counted")).toBe(String(COUNTED_PIXELS_PER_DAY));
  });

  // Range le score en pixels × l'écart, moins la version de la dernière pose, sans EXPIRE
  it("stores pixels × the span, minus the version of the last placement, with no expiry", async () => {
    const { canvasId, keys } = await readyCanvas();
    const player = playerOf("ada");

    await placeAs(canvasId, player, squareOf(2));
    const ack = await placeAs(canvasId, player, squareOf(3, 1, 2));

    expect(ack.version).toBe(2);
    expect(Number(await redis.zscore(keys.scoreboard, player))).toBe(
      5 * SCORE_TIE_SPAN + SCORE_TIE_SPAN - 1 - 2,
    );
    expect(await redis.ttl(keys.scoreboard)).toBe(-1);
  });

  // Compte un pixel recouvert depuis, jamais un coup de gomme, un pixel refusé, ni un pixel au-delà de la jauge
  it("counts a pixel covered since, never an eraser stroke, a rejected pixel or a pixel over the gauge", async () => {
    const { canvasId } = await readyCanvas({ gaugeMaxStart: 5, gaugeMaxCeiling: 5 });
    const [ada, bob] = [playerOf("ada"), playerOf("bob")];

    await placeAs(canvasId, ada, squareOf(3));
    await placeAs(canvasId, bob, squareOf(3, 2));
    await placeAs(canvasId, ada, [{ x: 0, y: 0, colorIndex: TRANSPARENT_COLOR_INDEX }]);
    const refused = await placeAs(canvasId, ada, [{ x: 99, y: 0, colorIndex: 1 }]);
    const overGauge = await placeAs(canvasId, bob, squareOf(4, 3, 10));

    expect(refused.accepted).toBe(0);
    expect(overGauge.accepted).toBe(2);
    expect((await core.listScoreboard(canvasId)).map(({ login, pixels }) => [login, pixels])).toEqual([
      [bob, 5],
      [ada, 3],
    ]);
  });

  // Garde devant celui qui a atteint le score en premier, jusqu'à ce que l'autre le dépasse
  it("keeps ahead whoever reached the score first, until the other goes past it", async () => {
    const { canvasId } = await readyCanvas();
    const [ada, bob] = [playerOf("ada"), playerOf("bob")];

    await placeAs(canvasId, ada, squareOf(5));
    await placeAs(canvasId, bob, squareOf(5, 2, 10));
    expect(await namesOf(canvasId)).toEqual([ada, bob]);

    await placeAs(canvasId, bob, squareOf(1, 2, 20));
    expect(await namesOf(canvasId)).toEqual([bob, ada]);

    await placeAs(canvasId, ada, squareOf(1, 1, 30));
    expect(await namesOf(canvasId)).toEqual([bob, ada]);
  });

  // Ne rend que les cinq premiers, nommés par leur miroir, et par leur identifiant sans miroir
  it("lists only the first five, named by their mirror, and by their id without one", async () => {
    const { canvasId } = await readyCanvas();
    const avatarUrl = "https://static-cdn.jtvnw.net/jtv_user_pictures/ada.png";
    const players = Array.from({ length: SCOREBOARD_SIZE + 2 }, (_, index) => playerOf(`player-${index}`));
    for (const [index, player] of players.entries()) await placeAs(canvasId, player, squareOf(index + 1));
    await core.setUser({ userId: players[6] ?? "", login: "ada", displayName: "Ada", avatarUrl });
    await core.setUser({ userId: players[5] ?? "", login: "bob", displayName: "Bob" });

    const top = await core.listScoreboard(canvasId);

    expect(top).toEqual([
      { login: "ada", displayName: "Ada", avatarUrl, pixels: 7 },
      { login: "bob", displayName: "Bob", pixels: 6 },
      ...[4, 3, 2].map((index) => ({
        login: players[index],
        displayName: players[index],
        pixels: index + 1,
      })),
    ]);
  });

  // Ne rend rien d'un canvas où personne n'a posé
  it("lists nothing for a canvas where nobody placed", async () => {
    const { canvasId } = await readyCanvas();

    expect(await core.listScoreboard(canvasId)).toEqual([]);
    expect((await core.listScoreboardRanks(canvasId, [playerOf("ada")])).size).toBe(0);
  });

  // Rend la place de chacun, et rien pour qui n'a pas posé
  it("lists the place of each player, and nothing for who placed nothing", async () => {
    const { canvasId } = await readyCanvas();
    const [ada, bob, eve] = [playerOf("ada"), playerOf("bob"), playerOf("eve")];
    await placeAs(canvasId, ada, squareOf(2));
    await placeAs(canvasId, bob, squareOf(4, 2, 10));

    const ranks = await core.listScoreboardRanks(canvasId, [ada, bob, eve]);

    expect(ranks).toEqual(
      new Map([
        [bob, { rank: 1, pixels: 4 }],
        [ada, { rank: 2, pixels: 2 }],
      ]),
    );
  });

  // Retire un banni du classement : il disparaît du top et des rangs, que chacun compte sans lui
  it("takes a banned player out of the top and of the ranks, which everybody counts without him", async () => {
    const { canvasId, keys } = await readyCanvas();
    const [ada, bob, eve] = [playerOf("ada"), playerOf("bob"), playerOf("eve")];
    await placeAs(canvasId, ada, squareOf(6));
    await placeAs(canvasId, bob, squareOf(4, 2, 10));
    await placeAs(canvasId, eve, squareOf(2, 3, 20));

    await moderate(canvasId, "ban", ada);

    expect(await namesOf(canvasId)).toEqual([bob, eve]);
    expect(await core.listScoreboardRanks(canvasId, [ada, bob, eve])).toEqual(
      new Map([
        [bob, { rank: 1, pixels: 4 }],
        [eve, { rank: 2, pixels: 2 }],
      ]),
    );
    expect(await redis.hlen(keys.scoreboardBanned)).toBe(1);
  });

  // Rend son score à un joueur débanni, à sa place, égalités comprises
  it("gives a player back his score on unban, at his place, ties included", async () => {
    const { canvasId, keys } = await readyCanvas();
    const [ada, bob] = [playerOf("ada"), playerOf("bob")];
    await placeAs(canvasId, ada, squareOf(5));
    await placeAs(canvasId, bob, squareOf(5, 2, 10));
    const before = await redis.zscore(keys.scoreboard, ada);

    await moderate(canvasId, "ban", ada);
    await moderate(canvasId, "unban", ada);

    expect(await redis.zscore(keys.scoreboard, ada)).toBe(before);
    expect(await namesOf(canvasId)).toEqual([ada, bob]);
    expect(await redis.exists(keys.scoreboardBanned)).toBe(0);
  });

  // Ne fait rien d'un ban sans score, ni d'un second ban, ni d'un déban d'un joueur qui n'est pas banni
  it("does nothing for a ban without a score, a second ban, or an unban of a player who is not banned", async () => {
    const { canvasId, keys } = await readyCanvas();
    const [ada, bob] = [playerOf("ada"), playerOf("bob")];
    await placeAs(canvasId, ada, squareOf(3));

    await moderate(canvasId, "ban", bob);
    await moderate(canvasId, "ban", ada);
    await moderate(canvasId, "ban", ada);
    await moderate(canvasId, "unban", bob);

    expect(await redis.exists(keys.scoreboardBanned)).toBe(1);
    expect(await redis.hlen(keys.scoreboardBanned)).toBe(1);
    expect(await namesOf(canvasId)).toEqual([]);
    await moderate(canvasId, "unban", ada);
    expect(await namesOf(canvasId)).toEqual([ada]);
  });

  // Traite un ban venu de Twitch comme les autres, et laisse dehors un ban de LivePlace que Twitch voudrait lever
  it("treats a Twitch ban like the others, and keeps out a LivePlace ban that Twitch would lift", async () => {
    const { canvasId } = await readyCanvas();
    const [ada, bob] = [playerOf("ada"), playerOf("bob")];
    await placeAs(canvasId, ada, squareOf(4));
    await placeAs(canvasId, bob, squareOf(2, 2, 10));

    await moderate(canvasId, "ban", ada, "twitch");
    expect(await namesOf(canvasId)).toEqual([bob]);
    await moderate(canvasId, "unban", ada, "twitch");
    expect(await namesOf(canvasId)).toEqual([ada, bob]);

    await moderate(canvasId, "ban", ada);
    await moderate(canvasId, "unban", ada, "twitch");
    expect(await namesOf(canvasId)).toEqual([bob]);
  });

  // Ne laisse pas un banni poser : son score ne bouge pas tant qu'il l'est
  it("does not let a banned player place: his score does not move while he is", async () => {
    const { canvasId } = await readyCanvas();
    const ada = playerOf("ada");
    await placeAs(canvasId, ada, squareOf(2));
    await moderate(canvasId, "ban", ada);

    const refused = await placeAs(canvasId, ada, squareOf(3, 1, 10));
    await moderate(canvasId, "unban", ada);

    expect(refused.accepted).toBe(0);
    expect(await core.listScoreboardRanks(canvasId, [ada])).toEqual(new Map([[ada, { rank: 1, pixels: 2 }]]));
  });

  // Garde le score d'un joueur dont on retire les pixels sans le bannir, comme la progression
  it("keeps the score of a player whose pixels are cleared without a ban, like the progress", async () => {
    const { canvasId } = await readyCanvas();
    const ada = playerOf("ada");
    await placeAs(canvasId, ada, squareOf(4));

    await moderate(canvasId, "clearUser", ada);

    expect(await core.listScoreboardRanks(canvasId, [ada])).toEqual(new Map([[ada, { rank: 1, pixels: 4 }]]));
  });
});
