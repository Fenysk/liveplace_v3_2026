import { type CellKey, toCellKey } from "@liveplace/domain";
import { describe, expect, expectTypeOf, it } from "vitest";
import { buildCanvasKeys, SCORE_MAX_PIXELS, SCORE_TIE_SPAN, toScorePixels } from "./keys";

describe("buildCanvasKeys (§5.1)", () => {
  const canvasId = "canvas-1";
  const prefix = `cv:${canvasId}:`;
  const keys = buildCanvasKeys(canvasId);
  const names = [
    keys.meta,
    keys.state,
    keys.version,
    keys.events,
    keys.cleared,
    keys.bans,
    keys.mods,
    keys.live,
    keys.hist(toCellKey(3, 2)),
    keys.cells("user-1"),
    keys.gauge("user-1"),
    keys.req("user-1", "request-1"),
  ];

  // Préfixe toutes les clés d'un canvas par `cv:<canvasId>:` : le passage en cluster n'ajoute que des accolades
  it("prefixes every key of a canvas with cv:<canvasId>:", () => {
    for (const name of names) expect(name.slice(0, prefix.length)).toBe(prefix);
  });

  // Donne un nom distinct à chaque clé
  it("gives every key a distinct name", () => {
    expect(new Set(names).size).toBe(names.length);
  });

  // Nomme une pile d'historique par sa cellKey, jamais par un stateOffset (D-15)
  it("names a hist key by cellKey only", () => {
    expectTypeOf(keys.hist).parameter(0).toEqualTypeOf<CellKey>();
  });
});

describe("the scoreboard keys (JOURNAL 2026-10-06)", () => {
  const canvasId = "canvas-1";
  const keys = buildCanvasKeys(canvasId);

  // Garde le classement sous le canvas, à part de la progression qu'un autre chantier recopie
  it("keeps the scoreboard under its canvas, apart from the progress that another job copies", () => {
    for (const name of [keys.scoreboard, keys.scoreboardBanned])
      expect(name.startsWith(`cv:${canvasId}:`)).toBe(true);
    expect(new Set([keys.scoreboard, keys.scoreboardBanned, keys.progress("user-1")]).size).toBe(3);
  });

  // Range les pixels au-dessus de la version : plus de pixels passe devant, et à égalité la plus petite version
  it("ranks pixels above the version: more pixels go first, and on a tie the smaller version", () => {
    const score = (pixels: number, version: number) =>
      pixels * SCORE_TIE_SPAN + (SCORE_TIE_SPAN - 1 - version);

    expect(score(6, 900_000)).toBeGreaterThan(score(5, 1));
    expect(score(5, 10)).toBeGreaterThan(score(5, 11));
    expect(toScorePixels(score(6, 900_000))).toBe(6);
    expect(toScorePixels(score(0, 1))).toBe(0);
  });

  // Garde un score entier jusqu'au dernier pixel qu'on puisse compter : un double ne perd rien avant 2^53
  it("keeps a score an exact integer up to the last pixel that can be counted", () => {
    const highest = SCORE_MAX_PIXELS * SCORE_TIE_SPAN + (SCORE_TIE_SPAN - 1);

    expect(Number.isSafeInteger(highest)).toBe(true);
    expect(toScorePixels(highest)).toBe(SCORE_MAX_PIXELS);
  });
});
