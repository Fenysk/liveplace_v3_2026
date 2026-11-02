// Le ménage des fichiers sans ligne sur un Convex en mémoire (CDC §8, JOURNAL 2026-11-02) : un fichier envoyé dont l'enregistrement a
// échoué part au bout d'une heure ; un fichier en cours d'enregistrement, ou qu'une ligne désigne, jamais.

import { ORPHAN_GRACE_MS } from "@liveplace/domain/retention";
import { SNAPSHOT_SCHEMA_VERSION } from "@liveplace/domain/snapshot";
import { describe, expect, it } from "vitest";
import { createMemoryDurable } from "../../../../packages/durable/src/memory-durable";
import { createOrphanCycle } from "../usecase/orphan-cycle";

const t0 = 1_700_000_000_000;
const bytes = (text: string) => new TextEncoder().encode(text);

const setup = () => {
  let clock = t0;
  const memory = createMemoryDurable(() => clock);
  const logged: string[] = [];
  const cycle = createOrphanCycle({
    store: memory.orphanStore,
    now: () => clock,
    log: (message) => logged.push(message),
  });
  return {
    memory,
    cycle,
    logged,
    advance: (ms: number) => {
      clock += ms;
    },
  };
};

describe("the files no row points to, on Convex in memory (CDC §8)", () => {
  // Le fichier d'un envoi dont l'enregistrement a échoué part au bout d'une heure, pas avant
  it("removes the file of an upload that was never recorded, after the grace and not before", async () => {
    const { memory, cycle, advance } = setup();
    const orphan = memory.upload(bytes("envoi sans ligne"));

    advance(ORPHAN_GRACE_MS - 1_000);
    await cycle.tick();
    expect(memory.files.has(orphan)).toBe(true);

    advance(2_000 + 60 * 60_000); // le passage suivant, plus d'une heure après l'envoi
    await cycle.tick();
    expect(memory.files.has(orphan)).toBe(false);
  });

  // Un fichier de moins d'une heure n'est jamais retiré, même sans ligne : l'enregistrement d'un envoi vient juste après lui
  it("never removes a file younger than the grace, even when no row points to it yet", async () => {
    const { memory, cycle, advance } = setup();
    advance(ORPHAN_GRACE_MS * 2);
    const beingRecorded = memory.upload(bytes("en cours d'enregistrement"));

    await cycle.tick(); // le passage tombe entre l'envoi et l'enregistrement

    expect(memory.files.has(beingRecorded)).toBe(true);
  });

  // Un fichier ancien qu'une ligne désigne reste, quel que soit son âge : snapshot, chunk, image du fond
  it("keeps an old file a snapshot, a chunk or a background image points to", async () => {
    const { memory, cycle, advance } = setup();
    await memory.snapshotStore("prod").storeSnapshot({
      canvasId: "canvas-1",
      tier: "working",
      version: 1,
      takenAt: t0,
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      bytes: bytes("snapshot"),
    });
    await memory.historyStore("prod").storeChunk({
      canvasId: "canvas-1",
      fromVersion: 1,
      toVersion: 2,
      fromTs: t0,
      toTs: t0 + 1,
      count: 2,
      schemaVersion: 1,
      payload: bytes("chunk"),
    });
    const background = memory.upload(bytes("image du fond"));
    memory.backgroundFiles.add(background);
    const orphan = memory.upload(bytes("orphelin"));

    advance(30 * 24 * 60 * 60_000);
    await cycle.tick();

    expect(memory.files.has(orphan)).toBe(false);
    expect(memory.files.has(background)).toBe(true);
    expect(memory.snapshots.every(({ storageId }) => memory.files.has(storageId))).toBe(true);
    expect(memory.chunks.every(({ storageId }) => memory.files.has(storageId))).toBe(true);
    expect(memory.files.size).toBe(3);
  });

  // Une réécriture coupée après l'envoi laisse le nouveau fichier sans ligne : il part, et l'ancien, qui a sa ligne, reste
  it("removes the new file a cut rewriting left behind, and keeps the one the row still points to", async () => {
    const { memory, cycle, advance } = setup();
    await memory.snapshotStore("prod").storeSnapshot({
      canvasId: "canvas-1",
      tier: "working",
      version: 1,
      takenAt: t0,
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      bytes: bytes("avant la réécriture"),
    });
    const kept = memory.snapshots[0]?.storageId ?? "";
    const left = memory.upload(bytes("réécrit, jamais enregistré"));

    advance(2 * ORPHAN_GRACE_MS);
    await cycle.tick();

    expect(memory.files.has(left)).toBe(false);
    expect(memory.files.has(kept)).toBe(true);
    expect(memory.usage).toEqual(memory.recountUsage());
  });

  // Le passage suivant reprend à la borne : un fichier arrivé depuis est vu, une fois assez vieux
  it("sees on the next pass a file that arrived since, once it is old enough", async () => {
    const { memory, cycle, advance } = setup();
    const first = memory.upload(bytes("premier"));
    advance(2 * ORPHAN_GRACE_MS);
    await cycle.tick();
    expect(memory.files.has(first)).toBe(false);
    advance(30 * 60_000);
    const second = memory.upload(bytes("second"));

    advance(30 * 60_000);
    await cycle.tick();
    expect(memory.files.has(second)).toBe(true); // 30 min : trop jeune pour ce passage
    advance(ORPHAN_GRACE_MS);
    await cycle.tick();

    expect(memory.files.has(second)).toBe(false);
  });
});
