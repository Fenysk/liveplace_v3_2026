import type { Event } from "@liveplace/protocol";
import { describe, expect, it } from "vitest";
import {
  deleteAccountFromChunk,
  deleteAccountFromSnapshot,
  listChunkAccounts,
  listSnapshotAccounts,
} from "./account-erasure";
import { CHUNK_SCHEMA_VERSION, type Chunk } from "./chunk";
import { DELETED_AUTHOR } from "./index";
import { type CanvasSnapshot, SNAPSHOT_SCHEMA_VERSION } from "./snapshot";

// Un identifiant qu'aucun autre texte du fichier ne contient : la preuve cherche cette chaîne dans tout le JSON.
const GONE = "gone-viewer-17";

// Le compte supprimé nommé à chaque endroit où un snapshot nomme un compte.
const snapshotNaming = (): CanvasSnapshot => ({
  schemaVersion: SNAPSHOT_SCHEMA_VERSION,
  canvasId: "canvas-1",
  version: 90,
  takenAt: 1_700_000_000_000,
  meta: { ownerId: "owner-1", width: "10", height: "10" },
  authors: ["owner-1", GONE, "other-1"],
  placements: ["pown00001", "pgone0001", "poth00001"],
  cells: [
    [1, 0, 0, 3, 1_000, 10],
    [2, 1, 1, 4, 2_000, 20],
    [3, 2, 2, 5, 3_000, 30],
    [4, 1, -1, 6, 4_000, 40],
  ],
  progress: { [GONE]: { counted: "3", day: "1" }, "other-1": { counted: "9" } },
  bans: [GONE, "troll"],
  bansTwitch: [GONE],
  banProofs: { [GONE]: { "5": "7" }, troll: { "6": "8" } },
  cleared: { [GONE]: "40", troll: "41" },
  clearedPlacements: [`${GONE}:pcleared1`, "troll:ptroll001"],
  clearedRanges: { [GONE]: "[[1,2]]", troll: "[[3,4]]" },
  mods: [GONE, "mod-1"],
  modsTwitch: [GONE],
  modsLiveplace: [GONE, "mod-1"],
  twitchUsers: {
    [GONE]: '{"login":"gone","displayName":"Gone"}',
    "mod-1": '{"login":"mod","displayName":"Mod"}',
  },
  reported: [
    [`${GONE}:pkeep0001`, 100],
    [`${GONE}:pcleared1`, 110],
    ["other-1:pother001", 120],
    ["other-1:pcasc0001", 130],
    [`${GONE}:pexists01`, 140],
    [`${DELETED_AUTHOR}:pexists01`, 150],
    ["other-1:pgone0001", 160],
  ],
  reports: {
    [`${GONE}:pkeep0001`]: ["other-1"],
    [`${GONE}:pcleared1`]: ["other-1"],
    "other-1:pother001": [GONE, "mod-1"],
    "other-1:pcasc0001": [GONE],
    [`${GONE}:pexists01`]: ["r1"],
    [`${DELETED_AUTHOR}:pexists01`]: ["r2"],
    "other-1:pgone0001": [GONE],
  },
  offStream: [`${GONE}:pkeep0001`, "other-1:pcasc0001"],
  approved: [`${GONE}:pappr0001`, `${GONE}:pcleared1`, "other-1:pappr0002"],
  scoreboard: { [GONE]: "5", "other-1": "4" },
  scoreboardBanned: { [GONE]: "3" },
});

describe("deleteAccountFromSnapshot, the rule of the Redis purge applied to a file (CDC §8)", () => {
  // La preuve du lot : après la règle, aucune clé ni aucune valeur du fichier ne nomme le compte
  it("leaves nothing in the file that names the account", () => {
    const result = deleteAccountFromSnapshot(snapshotNaming(), GONE);

    expect(JSON.stringify(result)).not.toContain(GONE);
    expect(listSnapshotAccounts(result).has(GONE)).toBe(false);
  });

  // Chaque endroit où le compte est nommé est listé : de quoi poser le filtre du fichier
  it("lists the account at every place the file names it, and never the deleted author", () => {
    const named = listSnapshotAccounts(snapshotNaming());

    expect(named.has(GONE)).toBe(true);
    expect([...named].sort()).toEqual(["mod-1", "other-1", "owner-1", "r1", "r2", "troll", GONE].sort());
    expect(listSnapshotAccounts(deleteAccountFromSnapshot(snapshotNaming(), GONE)).has(DELETED_AUTHOR)).toBe(
      false,
    );
  });

  // Les cases restent, sous l'auteur `deleted` : le dessin ne change pas d'une couleur
  it("keeps every cell, under the deleted author", () => {
    const before = snapshotNaming();
    const result = deleteAccountFromSnapshot(before, GONE);

    expect(result.authors).toEqual(["owner-1", DELETED_AUTHOR, "other-1"]);
    expect(result.cells).toEqual(before.cells);
    expect(result.placements).toEqual(before.placements);
    expect(result.version).toBe(before.version);
  });

  // Si `deleted` est déjà un auteur du dictionnaire, les deux n'en font qu'un et les rangs suivent
  it("merges the account with an author deleted already there", () => {
    const before = { ...snapshotNaming(), authors: ["owner-1", DELETED_AUTHOR, GONE, "other-1"] };
    before.cells = [
      [1, 1, 0, 3, 1_000, 10],
      [2, 2, 1, 4, 2_000, 20],
      [3, 3, 2, 5, 3_000, 30],
    ];

    const result = deleteAccountFromSnapshot(before, GONE);

    expect(result.authors).toEqual(["owner-1", DELETED_AUTHOR, "other-1"]);
    expect(result.cells.map(([, authorIndex]) => result.authors[authorIndex])).toEqual([
      DELETED_AUTHOR,
      DELETED_AUTHOR,
      "other-1",
    ]);
  });

  // Ses progression, jauge de bannis, classement, rôles et noms partent ; ceux des autres restent
  it("removes what only names it, and keeps what names the others", () => {
    const result = deleteAccountFromSnapshot(snapshotNaming(), GONE);

    expect(result.progress).toEqual({ "other-1": { counted: "9" } });
    expect(result.bans).toEqual(["troll"]);
    expect(result.bansTwitch).toEqual([]);
    expect(result.banProofs).toEqual({ troll: { "6": "8" } });
    expect(result.cleared).toEqual({ troll: "41" });
    expect(result.clearedRanges).toEqual({ troll: "[[3,4]]" });
    expect(result.mods).toEqual(["mod-1"]);
    expect(result.modsTwitch).toEqual([]);
    expect(result.modsLiveplace).toEqual(["mod-1"]);
    expect(Object.keys(result.twitchUsers)).toEqual(["mod-1"]);
    expect(result.scoreboard).toEqual({ "other-1": "4" });
    expect(result.scoreboardBanned).toEqual({});
  });

  // Ses poses signalées passent sous `deleted`, sauf une que la pierre tombale couvre : elle part avec ses signalements
  it("moves its reported placements under the deleted author, and drops the ones a tombstone covers", () => {
    const result = deleteAccountFromSnapshot(snapshotNaming(), GONE);

    expect(result.clearedPlacements).toEqual(["troll:ptroll001"]);
    expect(result.approved).toEqual([`${DELETED_AUTHOR}:pappr0001`, "other-1:pappr0002"]);
    expect(result.offStream).toEqual([`${DELETED_AUTHOR}:pkeep0001`, "other-1:pcasc0001"]);
    expect(result.reports[`${DELETED_AUTHOR}:pkeep0001`]).toEqual(["other-1"]);
    expect(result.reports).not.toHaveProperty(`${GONE}:pcleared1`);
    expect(result.reported.map(([placementKey]) => placementKey)).not.toContain(
      `${DELETED_AUTHOR}:pcleared1`,
    );
  });

  // Une pose déjà signalée sous `deleted` garde son score, et reçoit les signaleurs de l'autre (ZADD NX, SUNIONSTORE)
  it("keeps the score of a deleted placement already reported and merges both sets of reporters", () => {
    const result = deleteAccountFromSnapshot(snapshotNaming(), GONE);

    expect(result.reported.find(([placementKey]) => placementKey === `${DELETED_AUTHOR}:pexists01`)).toEqual([
      `${DELETED_AUTHOR}:pexists01`,
      150,
    ]);
    expect([...(result.reports[`${DELETED_AUTHOR}:pexists01`] ?? [])].sort()).toEqual(["r1", "r2"]);
  });

  // Un signaleur parti qui laissait une pose sans personne : cachée du stream elle garde un signaleur anonyme, sinon elle n'est plus signalée
  it("keeps an anonymous reporter on a hidden placement it was the only one to report, and unreports the others", () => {
    const result = deleteAccountFromSnapshot(snapshotNaming(), GONE);

    expect(result.reports["other-1:pcasc0001"]).toEqual([DELETED_AUTHOR]);
    expect(result.reported.map(([placementKey]) => placementKey)).toContain("other-1:pcasc0001");
    expect(result.reports).not.toHaveProperty("other-1:pgone0001");
    expect(result.reported.map(([placementKey]) => placementKey)).not.toContain("other-1:pgone0001");
    expect(result.reports["other-1:pother001"]).toEqual(["mod-1"]);
  });

  // La liste `reported` garde l'ordre de Redis : par score
  it("keeps the reported placements in the order of the Redis sorted set", () => {
    const scores = deleteAccountFromSnapshot(snapshotNaming(), GONE).reported.map(
      ([, reportedAt]) => reportedAt,
    );

    expect(scores).toEqual([...scores].sort((first, second) => first - second));
  });

  // Un canvas dont le compte était le propriétaire n'a plus de propriétaire nommé
  it("leaves a canvas the account owned without an owner", () => {
    const before = snapshotNaming();
    before.meta = { ...before.meta, ownerId: GONE };

    expect(deleteAccountFromSnapshot(before, GONE).meta.ownerId).toBe(DELETED_AUTHOR);
  });

  // Un snapshot d'avant le classement n'en gagne pas un
  it("does not add a scoreboard to a file saved before it existed", () => {
    const { scoreboard, scoreboardBanned, ...older } = snapshotNaming();

    const result = deleteAccountFromSnapshot(older, GONE);

    expect(result).not.toHaveProperty("scoreboard");
    expect(result).not.toHaveProperty("scoreboardBanned");
  });

  // Rejouée sur un fichier propre, la règle ne change rien
  it("changes nothing when it runs again", () => {
    const once = deleteAccountFromSnapshot(snapshotNaming(), GONE);

    expect(deleteAccountFromSnapshot(once, GONE)).toEqual(once);
  });

  // Un autre compte du même fichier n'est pas touché
  it("does not touch another account of the same file", () => {
    const before = snapshotNaming();
    const result = deleteAccountFromSnapshot(before, "other-1");

    expect(result.progress).toEqual({ [GONE]: before.progress[GONE] });
    expect(result.authors).toContain(GONE);
    expect(result.bans).toEqual(before.bans);
  });
});

const eventOf = (version: number, authorId: string | null, moderation?: Event["moderation"]): Event => ({
  version,
  kind: moderation ? "clear" : "place",
  authorId,
  occurredAt: 1_000 + version,
  cells: [{ x: 1, y: 2, colorIndex: 3, previousColorIndex: 0, placedAt: 1_000 + version }],
  ...(moderation ? { moderation } : {}),
});

const chunkNaming = (): Chunk => ({
  schemaVersion: CHUNK_SCHEMA_VERSION,
  canvasId: "canvas-1",
  fromVersion: 5,
  toVersion: 9,
  entries: [
    [5, "pgone0001", eventOf(5, GONE)],
    [6, "pother001", eventOf(6, "other-1")],
    [7, null, eventOf(7, "mod-1", { action: "ban", target: GONE })],
    [8, null, eventOf(8, GONE, { action: "clearPlacement", target: "other-1", placementId: "pother001" })],
    [9, null, eventOf(9, null)],
  ],
});

describe("deleteAccountFromChunk, the rule of the Redis stream applied to a file (CDC §8)", () => {
  // La preuve du lot : le compte n'est plus ni l'auteur, ni le modérateur, ni la cible d'aucune entrée
  it("leaves nothing in the chunk that names the account", () => {
    const result = deleteAccountFromChunk(chunkNaming(), GONE);

    expect(JSON.stringify(result)).not.toContain(GONE);
    expect(listChunkAccounts(result)).toEqual(new Set(["other-1", "mod-1"]));
  });

  // Les entrées gardent leur ordre, leurs versions, leurs poses et leurs cases : le rattrapage et l'historique restent ceux d'avant
  it("keeps the order, the versions, the placements and the cells of the entries", () => {
    const before = chunkNaming();
    const result = deleteAccountFromChunk(before, GONE);

    expect(result.entries.map(([version]) => version)).toEqual([5, 6, 7, 8, 9]);
    expect(result.entries.map(([, placementId]) => placementId)).toEqual(before.entries.map(([, id]) => id));
    expect(result.entries.map(([, , event]) => event.cells)).toEqual(
      before.entries.map(([, , event]) => event.cells),
    );
    expect(result.entries.map(([, , event]) => event.occurredAt)).toEqual(
      before.entries.map(([, , event]) => event.occurredAt),
    );
    expect([result.fromVersion, result.toVersion]).toEqual([5, 9]);
  });

  // Une pose, un ban visant le compte et une modération faite par lui passent sous `deleted`, le reste de l'action est intact
  it("puts the deleted author where the account posted, was banned, or moderated", () => {
    const result = deleteAccountFromChunk(chunkNaming(), GONE);

    expect(result.entries[0]?.[2].authorId).toBe(DELETED_AUTHOR);
    expect(result.entries[2]?.[2]).toMatchObject({
      authorId: "mod-1",
      moderation: { action: "ban", target: DELETED_AUTHOR },
    });
    expect(result.entries[3]?.[2]).toMatchObject({
      authorId: DELETED_AUTHOR,
      moderation: { action: "clearPlacement", target: "other-1", placementId: "pother001" },
    });
  });

  // Une entrée qui ne nomme pas le compte est la même, au même objet près
  it("hands back the very same entry when it does not name the account", () => {
    const before = chunkNaming();
    const result = deleteAccountFromChunk(before, GONE);

    expect(result.entries[1]?.[2]).toBe(before.entries[1]?.[2]);
    expect(result.entries[4]?.[2]).toBe(before.entries[4]?.[2]);
  });

  // Rejouée sur un fichier propre, la règle ne change rien
  it("changes nothing when it runs again", () => {
    const once = deleteAccountFromChunk(chunkNaming(), GONE);

    expect(deleteAccountFromChunk(once, GONE)).toEqual(once);
  });
});
