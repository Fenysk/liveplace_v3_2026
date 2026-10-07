import { type CanvasMeta, defaultCanvasMeta } from "@liveplace/domain";
import type { Moderation, Pixel } from "@liveplace/domain/ports";
import { describe, expect, it } from "vitest";
import { createArchiveWrites } from "./archive-writes";
import { createRedisHarness } from "./test-harness";

// Écart §15 (JOURNAL 2026-10-06) : le classement est propre à chaque canvas. Rouvrir recopie les bannis du canvas actif
// sur l'archive, et le classement de l'archive les suit avec la règle de moderate.lua : un banni sort de `scoreboard`,
// son score attend dans `scoreboard:banned`, un débanni revient avec le même.

const harness = createRedisHarness();
const { redis, core, runId } = harness;
const writes = createArchiveWrites(redis);

const OWNER = "owner-1";
const now = 1_700_000_000_000;

const meta: CanvasMeta = {
  ...defaultCanvasMeta(OWNER),
  width: 16,
  height: 16,
  gaugeMaxStart: 500,
  gaugeMaxCeiling: 500,
};

const readyCanvas = () => harness.readyCanvas(meta);

// Un joueur par exécution : le nettoyage du harnais ne cherche que `user:<runId>-*`.
const playerOf = (name: string) => `${runId}-${name}`;

const squareOf = (count: number): Pixel[] =>
  Array.from({ length: count }, (_, index) => ({
    x: index % meta.width,
    y: Math.floor(index / meta.width),
    colorIndex: 1,
  }));

const placeAs = (canvasId: string, userId: string, count: number) =>
  harness.placeInBatches(canvasId, userId, "ptest0001", squareOf(count), now);

const moderate = async (canvasId: string, action: "ban" | "unban", target: string) => {
  const moderation: Moderation = {
    by: OWNER,
    nowMs: now,
    action: { action, target },
    slice: "first",
    source: "liveplace",
  };
  const result = await core.moderate(canvasId, moderation);
  if (!result.ok) throw new Error(result.error);
};

const namesOf = async (canvasId: string) => (await core.listScoreboard(canvasId)).map((row) => row.login);

// Une archive qui a eu son classement quand elle était le canvas actif, puis figée.
const archivedWithScores = async (scores: Record<string, number>) => {
  const archive = await readyCanvas();
  for (const [userId, count] of Object.entries(scores)) await placeAs(archive.canvasId, userId, count);
  return archive;
};

describe("the scoreboard of a reopened archive follows the bans it takes (Écart §15, JOURNAL 2026-10-06)", () => {
  // Un ban posé sur le canvas actif : le banni quitte le classement de l'archive rouverte, son score attend à l'écart
  it("takes a player out when the active canvas banned them since, keeping their score aside", async () => {
    const [ada, bob, eve] = [playerOf("ada"), playerOf("bob"), playerOf("eve")];
    const { canvasId: archive, keys } = await archivedWithScores({ [ada]: 5, [bob]: 3, [eve]: 1 });
    const { canvasId: active } = await readyCanvas();
    const adaScore = await redis.zscore(keys.scoreboard, ada);
    await writes.markArchived(archive, { archivedAt: now, successorId: active });
    await moderate(active, "ban", ada);

    await writes.copyShared(active, archive);

    expect(await namesOf(archive)).toEqual([bob, eve]);
    expect(await redis.zscore(keys.scoreboard, ada)).toBeNull();
    expect(await redis.hget(keys.scoreboardBanned, ada)).toBe(adaScore);
  });

  // Un déban posé sur le canvas actif : le débanni revient au classement de l'archive, avec son score et sa place
  it("puts a player back when the active canvas no longer bans them, with their score and their place", async () => {
    const [ada, bob] = [playerOf("ada"), playerOf("bob")];
    const { canvasId: archive, keys } = await archivedWithScores({ [ada]: 5, [bob]: 3 });
    await moderate(archive, "ban", ada);
    const adaScore = await redis.hget(keys.scoreboardBanned, ada);
    expect(await namesOf(archive)).toEqual([bob]);
    const { canvasId: active } = await readyCanvas();
    await writes.markArchived(archive, { archivedAt: now, successorId: active });
    await writes.copyShared(archive, active);
    await moderate(active, "unban", ada);

    await writes.copyShared(active, archive);

    expect(await namesOf(archive)).toEqual([ada, bob]);
    expect(await redis.zscore(keys.scoreboard, ada)).toBe(adaScore);
    expect(await redis.hexists(keys.scoreboardBanned, ada)).toBe(0);
  });

  // Ceux dont le ban n'a pas changé ne bougent pas : le banni des deux côtés reste à l'écart, les autres au classement
  it("leaves alone the players whose ban did not change", async () => {
    const [ada, bob, eve] = [playerOf("ada"), playerOf("bob"), playerOf("eve")];
    const { canvasId: archive, keys } = await archivedWithScores({ [ada]: 5, [bob]: 3, [eve]: 1 });
    await moderate(archive, "ban", ada);
    const before = await redis.zrange(keys.scoreboard, "0", "-1", "WITHSCORES");
    const { canvasId: active } = await readyCanvas();
    await writes.markArchived(archive, { archivedAt: now, successorId: active });
    await writes.copyShared(archive, active);

    await writes.copyShared(active, archive);

    expect(await redis.zrange(keys.scoreboard, "0", "-1", "WITHSCORES")).toEqual(before);
    expect(await redis.hexists(keys.scoreboardBanned, ada)).toBe(1);
    expect(await namesOf(archive)).toEqual([bob, eve]);
  });

  // Un joueur banni qui n'a jamais posé sur l'archive n'y gagne aucune ligne, ni au classement ni à l'écart
  it("gives no line to a banned player who never placed on the archive", async () => {
    const [ada, ghost] = [playerOf("ada"), playerOf("ghost")];
    const { canvasId: archive, keys } = await archivedWithScores({ [ada]: 2 });
    const { canvasId: active } = await readyCanvas();
    await moderate(active, "ban", ghost);

    await writes.copyShared(active, archive);

    expect(await namesOf(archive)).toEqual([ada]);
    expect(await redis.exists(keys.scoreboardBanned)).toBe(0);
  });
});

describe("a new canvas starts on an empty scoreboard (Écart §15, JOURNAL 2026-10-06)", () => {
  // Archiver recopie le commun et, si on garde, la progression : jamais le classement, qui est celui de chaque canvas
  it("is never filled by what archiving copies, shared things and progress included", async () => {
    const [ada, bob] = [playerOf("ada"), playerOf("bob")];
    const { canvasId: outgoing, keys } = await archivedWithScores({ [ada]: 5, [bob]: 3 });
    await moderate(outgoing, "ban", bob);
    const { canvasId: incoming, keys: fresh } = await readyCanvas();

    await writes.copyShared(outgoing, incoming);
    await writes.copyProgress(outgoing, incoming);

    expect(await redis.exists(fresh.scoreboard, fresh.scoreboardBanned)).toBe(0);
    expect(await core.listScoreboard(incoming)).toEqual([]);
    // Et celui du sortant, qui s'archive, reste tel qu'il était.
    expect(await namesOf(outgoing)).toEqual([ada]);
    expect(await redis.hexists(keys.scoreboardBanned, bob)).toBe(1);
  });
});
