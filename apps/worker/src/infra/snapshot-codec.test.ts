import { brotliCompressSync } from "node:zlib";
import { type CanvasSnapshot, SNAPSHOT_SCHEMA_VERSION, type SnapshotCell } from "@liveplace/domain/snapshot";
import { describe, expect, it } from "vitest";
import { decodeSnapshot, encodeSnapshot } from "./snapshot-codec";

const snapshot: CanvasSnapshot = {
  schemaVersion: SNAPSHOT_SCHEMA_VERSION,
  canvasId: "canvas-1",
  version: 42,
  takenAt: 1_700_000_000_000,
  meta: { ownerId: "owner-1", width: "60", height: "45", obsBackground: "white" },
  authors: ["author-a", "author-b"],
  placements: ["pbelow001"],
  cells: [
    [65_539, 0, 0, 5, 1_700_000_000_000, 1],
    [65_540, 1, -1, 7, 1_700_000_000_500, 2],
  ],
  progress: { "author-a": { counted: "16", claimed: "1", day: "2026-10-06", dayCounted: "16" } },
  bans: ["troll"],
  bansTwitch: ["troll"],
  banProofs: { troll: { "65539": "6" } },
  cleared: { troll: "3" },
  clearedPlacements: ["ghost:pghost001"],
  clearedRanges: { ghost: "[[1,2]]" },
  mods: ["mod-1"],
  modsTwitch: [],
  modsLiveplace: ["mod-1"],
  twitchUsers: { "mod-1": '{"login":"mod","displayName":"Mod"}' },
  reported: [["author-a:pbelow001", 1_700_000_000_100]],
  reports: { "author-a:pbelow001": ["viewer-1"] },
  offStream: ["author-a:pbelow001"],
  approved: [],
};

const compressed = (value: unknown) => new Uint8Array(brotliCompressSync(Buffer.from(JSON.stringify(value))));

describe("the snapshot file format (Écart §7.2, JOURNAL 2026-10-06)", () => {
  // Un snapshot encodé puis décodé redevient exactement lui-même
  it("gives back exactly the snapshot after a round trip", async () => {
    const decoded = await decodeSnapshot(await encodeSnapshot(snapshot));

    expect(decoded).toEqual({ ok: true, value: snapshot });
  });

  // Le fichier est compressé : un grand canvas tient très en dessous de sa taille en JSON
  it("compresses a large canvas far below its JSON size", async () => {
    const cells: SnapshotCell[] = Array.from({ length: 5000 }, (_, index) => [
      65_536 * Math.floor(index / 100) + (index % 100),
      index % 2,
      0,
      index % 40,
      1_700_000_000_000 + index,
      index + 1,
    ]);

    const encoded = await encodeSnapshot({ ...snapshot, cells });

    expect(encoded.byteLength).toBeLessThan(JSON.stringify({ ...snapshot, cells }).length / 5);
  });

  // Des octets qui ne sont pas du brotli, ou du brotli qui n'est pas du JSON, sont corrompus : jamais une exception
  it("calls corrupt what is not brotli, or not JSON", async () => {
    const notJson = new Uint8Array(brotliCompressSync(Buffer.from("pas du json")));

    expect(await decodeSnapshot(new TextEncoder().encode("pas du brotli"))).toEqual({
      ok: false,
      error: "corrupt",
    });
    expect(await decodeSnapshot(notJson)).toEqual({ ok: false, error: "corrupt" });
  });

  // Un JSON auquel il manque un champ, ou dont un champ n'a pas le bon type, est corrompu
  it("calls corrupt a JSON with a missing or wrong field", async () => {
    const { bans: _bans, ...withoutBans } = snapshot;

    expect(await decodeSnapshot(compressed(withoutBans))).toEqual({ ok: false, error: "corrupt" });
    expect(await decodeSnapshot(compressed({ ...snapshot, version: "42" }))).toEqual({
      ok: false,
      error: "corrupt",
    });
    expect(await decodeSnapshot(compressed({ ...snapshot, cells: [[1, 2]] }))).toEqual({
      ok: false,
      error: "corrupt",
    });
  });

  // Une case qui pointe hors des dictionnaires d'auteurs ou de poses est corrompue : la restauration lirait dans le vide
  it("calls corrupt a cell that points outside the author or placement dictionaries", async () => {
    const outsideAuthors: SnapshotCell = [65_539, 2, 0, 5, 1, 1];
    const outsidePlacements: SnapshotCell = [65_539, 0, 1, 5, 1, 1];

    expect(await decodeSnapshot(compressed({ ...snapshot, cells: [outsideAuthors] }))).toEqual({
      ok: false,
      error: "corrupt",
    });
    expect(await decodeSnapshot(compressed({ ...snapshot, cells: [outsidePlacements] }))).toEqual({
      ok: false,
      error: "corrupt",
    });
  });

  // Le classement part avec le snapshot, scores en chaînes comme Redis les rend (JOURNAL 2026-10-08)
  it("carries the scoreboard and the banned scores through a round trip", async () => {
    const withScoreboard: CanvasSnapshot = {
      ...snapshot,
      scoreboard: { "author-a": "9007199254740991", "author-b": "1073741823" },
      scoreboardBanned: { troll: "536870911" },
    };

    expect(await decodeSnapshot(await encodeSnapshot(withScoreboard))).toEqual({
      ok: true,
      value: withScoreboard,
    });
  });

  // Une sauvegarde d'avant le classement reste lisible, et ne reçoit pas de classement inventé
  it("still reads a snapshot saved before the scoreboard, without inventing one", async () => {
    const decoded = await decodeSnapshot(compressed(snapshot));

    expect(decoded.ok && "scoreboard" in decoded.value).toBe(false);
    expect(decoded).toEqual({ ok: true, value: snapshot });
  });

  // Un score qui n'est pas une chaîne n'est pas un score de Redis
  it("calls corrupt a scoreboard whose score is not a string", async () => {
    expect(await decodeSnapshot(compressed({ ...snapshot, scoreboard: { "author-a": 12 } }))).toEqual({
      ok: false,
      error: "corrupt",
    });
  });

  // Une version de format que ce code ne connaît pas n'est pas lue de travers : elle est nommée
  it("names a schema version it does not know instead of misreading it", async () => {
    expect(await decodeSnapshot(compressed({ ...snapshot, schemaVersion: 2 }))).toEqual({
      ok: false,
      error: "unsupported_version",
    });
  });
});
