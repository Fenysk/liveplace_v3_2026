import { brotliCompressSync, brotliDecompressSync } from "node:zlib";
import { SNAPSHOT_SCHEMA_VERSION, type SnapshotImage } from "@liveplace/domain/snapshot";
import { describe, expect, it } from "vitest";
import { decodeImage, encodeImage } from "./image-codec";

const image: SnapshotImage = {
  schemaVersion: SNAPSHOT_SCHEMA_VERSION,
  canvasId: "canvas-1",
  version: 42,
  takenAt: 1_700_000_000_000,
  width: 4,
  height: 3,
  state: Uint8Array.from([0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 7]),
};

const compressed = (value: unknown) => new Uint8Array(brotliCompressSync(Buffer.from(JSON.stringify(value))));

describe("the state-only file format (Écart §7.3, JOURNAL 2026-10-08)", () => {
  // Un dessin encodé puis décodé redevient exactement lui-même
  it("gives back exactly the drawing after a round trip", async () => {
    expect(await decodeImage(await encodeImage(image))).toEqual({ ok: true, value: image });
  });

  // Le fichier ne porte que le dessin : aucun auteur, aucune modération
  it("carries the drawing only", async () => {
    const text = brotliDecompressSync(await encodeImage(image)).toString("utf8");

    expect(Object.keys(JSON.parse(text)).sort()).toEqual([
      "canvasId",
      "height",
      "schemaVersion",
      "state",
      "takenAt",
      "version",
      "width",
    ]);
  });

  // Un grand canvas presque uni tient très en dessous de sa taille brute
  it("compresses a large flat canvas far below its raw size", async () => {
    const state = new Uint8Array(1000 * 1000);
    state.fill(3, 0, 500_000);

    const encoded = await encodeImage({ ...image, width: 1000, height: 1000, state });

    expect(encoded.byteLength).toBeLessThan(10_000);
  });

  // Un dessin dont la taille ne correspond pas aux cases ne se restaure pas
  it("refuses a drawing whose size does not match its cells", async () => {
    const wrong = compressed({ ...image, state: Buffer.from([1, 2, 3]).toString("base64") });

    expect(await decodeImage(wrong)).toEqual({ ok: false, error: "corrupt" });
  });

  // Des octets qui ne sont pas du brotli, ou pas du JSON, se rendent en erreur typée
  it("reports unreadable bytes as corrupt", async () => {
    expect(await decodeImage(Uint8Array.from([1, 2, 3]))).toEqual({ ok: false, error: "corrupt" });
    expect(await decodeImage(new Uint8Array(brotliCompressSync(Buffer.from("pas du json"))))).toEqual({
      ok: false,
      error: "corrupt",
    });
  });
});
