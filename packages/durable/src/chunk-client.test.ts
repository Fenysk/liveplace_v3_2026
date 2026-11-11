import { CHUNK_SCHEMA_VERSION, type Chunk } from "@liveplace/domain/chunk";
import { ConvexHttpClient } from "convex/browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeChunk } from "./chunk-codec";
import { createChunkReader } from "./client";

// Le client Convex ne sort pas du processus : sa requête est celle du test.
const convex = { query: vi.fn() };

beforeEach(() => {
  convex.query.mockReset();
  vi.spyOn(ConvexHttpClient.prototype, "query").mockImplementation(convex.query);
});

const chunk: Chunk = {
  schemaVersion: CHUNK_SCHEMA_VERSION,
  canvasId: "canvas-1",
  fromVersion: 5,
  toVersion: 5,
  entries: [[5, "p00000005", { version: 5, kind: "place", authorId: "a", occurredAt: 1, cells: [] }]],
};

const reader = () => createChunkReader("https://example.convex.cloud", "key", "scope");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("createChunkReader (JOURNAL 2026-11-11)", () => {
  // Quand le web borne la liste, alors `beforeVersion` part à Convex, par pages de 100.
  it("sends beforeVersion to Convex, a hundred files per page", async () => {
    convex.query.mockResolvedValue({ files: [], next: null });

    await reader().listChunks("canvas-1", { beforeVersion: 25 });

    expect(convex.query).toHaveBeenCalledWith(expect.anything(), {
      serviceKey: "key",
      scope: "scope",
      canvasId: "canvas-1",
      cursor: null,
      numItems: 100,
      beforeVersion: 25,
    });
  });

  // Quand le web ne borne pas la liste, alors l'argument n'est pas envoyé du tout (un Convex plus ancien ne le connaît pas).
  it("leaves beforeVersion out when there is no bound", async () => {
    convex.query.mockResolvedValue({ files: [], next: null });

    await reader().listChunks("canvas-1");

    expect(convex.query.mock.calls[0]?.[1]).not.toHaveProperty("beforeVersion");
  });

  // Quand un fichier se télécharge, alors son chunk est décodé, son poids compté, et la requête porte le signal.
  it("downloads and decodes a file, counts its bytes, and hands over a signal", async () => {
    const bytes = await encodeChunk(chunk);
    const downloadFile = vi.fn(async () => new Response(Uint8Array.from(bytes)));
    vi.stubGlobal("fetch", downloadFile);
    convex.query.mockResolvedValue({
      files: [
        { url: "https://files.test/a", fromVersion: 5, toVersion: 5 },
        { url: null, fromVersion: 6, toVersion: 6 },
      ],
      next: null,
    });

    const listing = await reader().listChunks("canvas-1");
    const downloaded = [];
    for await (const file of listing.chunks) downloaded.push(file);

    expect(listing.total).toBe(2);
    expect(downloaded).toEqual([
      { chunk, bytes: bytes.byteLength },
      { chunk: null, bytes: 0 }, // sans adresse : ignoré
    ]);
    expect(downloadFile).toHaveBeenCalledWith("https://files.test/a", { signal: expect.any(AbortSignal) });
  });

  // Si le fichier est illisible, alors son chunk est `null`, journalisé, et la lecture continue.
  it("ignores an unreadable file and logs it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", async () => new Response(Uint8Array.from([1, 2, 3])));
    convex.query.mockResolvedValue({
      files: [{ url: "https://files.test/a", fromVersion: 5, toVersion: 5 }],
      next: null,
    });

    const listing = await reader().listChunks("canvas-1");
    const downloaded = [];
    for await (const file of listing.chunks) downloaded.push(file);

    expect(downloaded).toEqual([{ chunk: null, bytes: 3 }]);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("canvas-1 5-5 illisible"));
  });
});
