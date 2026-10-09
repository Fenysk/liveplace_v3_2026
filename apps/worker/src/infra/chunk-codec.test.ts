import { brotliCompressSync } from "node:zlib";
import { CHUNK_SCHEMA_VERSION, type Chunk, type ChunkEntry } from "@liveplace/domain/chunk";
import { describe, expect, it } from "vitest";
import { decodeChunk, encodeChunk } from "./chunk-codec";

const t0 = 1_700_000_000_000;

const placeEntry = (version: number, placementId: string | null): ChunkEntry => [
  version,
  placementId,
  {
    version,
    kind: "place",
    authorId: "author-a",
    occurredAt: t0 + version,
    cells: [{ x: 3, y: 2, colorIndex: 5, previousColorIndex: 0, placedAt: t0 + version }],
  },
];

const chunk: Chunk = {
  schemaVersion: CHUNK_SCHEMA_VERSION,
  canvasId: "canvas-1",
  fromVersion: 10,
  toVersion: 12,
  entries: [
    placeEntry(10, "pfirst0001"),
    placeEntry(11, null),
    [
      12,
      null,
      {
        version: 12,
        kind: "clear",
        authorId: "owner-1",
        occurredAt: t0 + 12,
        cells: [],
        moderation: { action: "clearPlacement", target: "author-a", placementId: "pfirst0001" },
      },
    ],
  ],
};

const compressed = (value: unknown) => new Uint8Array(brotliCompressSync(Buffer.from(JSON.stringify(value))));

describe("the chunk file format (Écart §7.2, JOURNAL 2026-10-08)", () => {
  // Un chunk encodé puis décodé redevient exactement lui-même, poses et modération comprises
  it("gives back exactly the chunk after a round trip", async () => {
    expect(await decodeChunk(await encodeChunk(chunk))).toEqual({ ok: true, value: chunk });
  });

  // Le fichier est compressé : cinq mille poses tiennent très en dessous de leur taille en JSON
  it("compresses five thousand placements far below their JSON size", async () => {
    const entries = Array.from({ length: 5000 }, (_, index) => placeEntry(index + 1, "pbacklog01"));
    const big: Chunk = { ...chunk, fromVersion: 1, toVersion: 5000, entries };

    expect((await encodeChunk(big)).byteLength).toBeLessThan(JSON.stringify(big).length / 8);
  });

  // Des octets qui ne sont pas du brotli, ou du brotli qui n'est pas du JSON, sont corrompus : jamais une exception
  it("calls corrupt what is not brotli, or not JSON", async () => {
    const notJson = new Uint8Array(brotliCompressSync(Buffer.from("pas du json")));

    expect(await decodeChunk(new TextEncoder().encode("pas du brotli"))).toEqual({
      ok: false,
      error: "corrupt",
    });
    expect(await decodeChunk(notJson)).toEqual({ ok: false, error: "corrupt" });
  });

  // Un champ qui manque, une entrée qui n'est pas un triplet, un événement sans genre connu : corrompu
  it("calls corrupt a missing field, a malformed entry, or an event of an unknown kind", async () => {
    const { canvasId: _canvasId, ...withoutCanvas } = chunk;
    const [, , event] = placeEntry(10, null);

    expect(await decodeChunk(compressed(withoutCanvas))).toEqual({ ok: false, error: "corrupt" });
    expect(await decodeChunk(compressed({ ...chunk, entries: [[10, "pfirst0001"]] }))).toEqual({
      ok: false,
      error: "corrupt",
    });
    expect(
      await decodeChunk(
        compressed({
          ...chunk,
          entries: [[10, null, { ...event, kind: "other" }], ...chunk.entries.slice(1)],
        }),
      ),
    ).toEqual({ ok: false, error: "corrupt" });
  });

  // Les versions des entrées croissent de `fromVersion` à `toVersion`, des trous permis : un fichier qui ne le dit pas est corrompu
  it("calls corrupt entries whose versions do not run from fromVersion to toVersion in order", async () => {
    const outOfOrder = [chunk.entries[1], chunk.entries[0], chunk.entries[2]];
    const wrongBounds = { ...chunk, toVersion: 13 };

    expect(await decodeChunk(compressed({ ...chunk, entries: outOfOrder }))).toEqual({
      ok: false,
      error: "corrupt",
    });
    expect(await decodeChunk(compressed(wrongBounds))).toEqual({ ok: false, error: "corrupt" });
    expect(await decodeChunk(compressed({ ...chunk, entries: [] }))).toEqual({ ok: false, error: "corrupt" });
  });

  // L'entrée dit la version de son événement : une entrée qui ment est corrompue
  it("calls corrupt an entry whose version is not the version of its event", async () => {
    const [, placementId, event] = placeEntry(10, "pfirst0001");

    expect(
      await decodeChunk(
        compressed({
          ...chunk,
          entries: [[10, placementId, { ...event, version: 99 }], ...chunk.entries.slice(1)],
        }),
      ),
    ).toEqual({ ok: false, error: "corrupt" });
  });

  // Une version de format que ce code ne connaît pas n'est pas lue de travers : elle est nommée
  it("names a schema version it does not know instead of misreading it", async () => {
    expect(await decodeChunk(compressed({ ...chunk, schemaVersion: 2 }))).toEqual({
      ok: false,
      error: "unsupported_version",
    });
  });
});
