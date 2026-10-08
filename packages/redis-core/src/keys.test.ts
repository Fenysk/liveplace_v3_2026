import { type CellKey, STREAM_GRACE_MS, toCellKey } from "@liveplace/domain";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  ACTIVE_TTL_SECONDS,
  ACTIVITY_CANVAS_MINUTES_RETENTION_MS,
  ACTIVITY_HOURS_RETENTION_MS,
  ACTIVITY_SEEN_RETENTION_MS,
  buildActivityKeys,
  buildCanvasKeys,
  SCORE_MAX_PIXELS,
  SCORE_TIE_SPAN,
  SIGNUPS_TTL_SECONDS,
  toActiveField,
  toScorePixels,
  toSignupsField,
} from "./keys";

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

// Écart §5.1 (JOURNAL 2026-10-06) : l'activité, des nombres sous `activity:`.
describe("buildActivityKeys", () => {
  const keys = buildActivityKeys();
  const names = [
    keys.minutes,
    keys.hours,
    keys.days,
    keys.canvasPixels(Date.UTC(2026, 9, 6, 12, 34)),
    keys.seen,
    keys.signups("2026-10-06"),
    keys.activeAccounts("2026-10-06"),
    keys.activePlayers("2026-10-06"),
    keys.activeStreamers("2026-10-06"),
  ];

  // Range toute l'activité sous `activity:`, chaque clé sous un nom distinct
  it("keeps all the activity under activity:, each key under its own name", () => {
    for (const name of names) expect(name.startsWith("activity:")).toBe(true);
    expect(new Set(names).size).toBe(names.length);
  });

  // JOURNAL 2026-10-07 : les comptes, joueurs et streamers actifs se nomment par le jour de Paris, un jour une clé
  it("names the active accounts, players and streamers by the Paris day, one key per day", () => {
    for (const name of [keys.activeAccounts, keys.activePlayers, keys.activeStreamers]) {
      expect(name("2026-10-06")).toContain("2026-10-06");
      expect(name("2026-10-06")).not.toBe(name("2026-10-07"));
    }
  });

  // Garde un HyperLogLog 31 jours, pour que les 30 jours d'avant n'en perdent aucun, et le point du jour à côté du point
  it("keeps an active key 31 days, and a day's active counts next to its point", () => {
    expect(ACTIVE_TTL_SECONDS).toBe(31 * 24 * 3600);
    expect(toActiveField(Date.UTC(2026, 9, 5, 22))).toBe(`${Date.UTC(2026, 9, 5, 22)}:active`);
    expect(toActiveField(1)).not.toBe(toSignupsField(1));
  });

  // Nomme les pixels d'une minute par son début, et les nouveaux comptes par le jour de Paris
  it("names a minute's pixels by its start, and the signups by the Paris day", () => {
    expect(keys.canvasPixels(60_000)).not.toBe(keys.canvasPixels(120_000));
    expect(keys.signups("2026-10-06")).toContain("2026-10-06");
  });

  // Isole les clés d'un test sous son propre préfixe
  it("isolates a test's keys under its own prefix", () => {
    expect(buildActivityKeys("activity:run-1-").minutes).toBe("activity:run-1-minute");
    expect(buildActivityKeys("activity:run-1-").seen).toBe("activity:run-1-seen");
  });

  // Écart §5.1 (JOURNAL 2026-10-08) : l'heure où un canvas a été vu streamé est gardée 10 minutes, le double de la tolérance
  it("keeps the time a canvas was seen streamed 10 minutes, twice the grace", () => {
    expect(buildActivityKeys().seen).toBe("activity:seen");
    expect(ACTIVITY_SEEN_RETENTION_MS).toBe(2 * STREAM_GRACE_MS);
  });

  // JOURNAL 2026-10-07 : l'historique d'un canvas vit sous `activity:cv:<canvasId>:`, jamais sous les clés du canvas
  it("keeps a canvas's history under activity:cv:<canvasId>:, never under the canvas's own keys", () => {
    const canvas = keys.canvas("canvas-1");
    const names = [canvas.minutes, canvas.hours, canvas.days, canvas.activePlayers("2026-10-06")];

    for (const name of names) {
      expect(name.startsWith("activity:cv:canvas-1:")).toBe(true);
      expect(name.startsWith(buildCanvasKeys("canvas-1").prefix)).toBe(false);
    }
    expect(new Set([...names, keys.minutes, keys.hours, keys.days]).size).toBe(names.length + 3);
    expect(keys.canvas("canvas-2").minutes).not.toBe(canvas.minutes);
    expect(buildActivityKeys("activity:run-1-").canvas("canvas-1").days).toBe(
      "activity:run-1-cv:canvas-1:day",
    );
  });

  // Nomme les joueurs actifs d'un canvas par le jour de Paris, un jour une clé
  it("names a canvas's active players by the Paris day, one key per day", () => {
    const { activePlayers } = keys.canvas("canvas-1");

    expect(activePlayers("2026-10-06")).toContain("2026-10-06");
    expect(activePlayers("2026-10-06")).not.toBe(activePlayers("2026-10-07"));
    expect(activePlayers("2026-10-06")).not.toBe(keys.canvas("canvas-2").activePlayers("2026-10-06"));
  });

  // Garde les points d'un canvas : 2 jours pour les minutes, comme l'historique pour les heures, et les nouveaux comptes du jour 31 jours
  it("keeps a canvas's points: 2 days of minutes, the hours as long as the history, the day's signups 31 days", () => {
    expect(ACTIVITY_CANVAS_MINUTES_RETENTION_MS).toBe(2 * 24 * 3600 * 1000);
    expect(ACTIVITY_HOURS_RETENTION_MS).toBe(366 * 24 * 3600 * 1000);
    expect(SIGNUPS_TTL_SECONDS).toBe(31 * 24 * 3600);
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
