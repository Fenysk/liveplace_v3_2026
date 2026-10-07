import type { ActiveCanvas, Archive, CanvasImage } from "@liveplace/domain/ports";
import { toBase64 } from "@liveplace/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ListDeps, listCanvases, sortArchives } from "./list-canvases";

const active: ActiveCanvas = { canvasId: "canvas-a", width: 4, height: 3, createdAt: 3000, name: "En cours" };
const archiveOf = (index: number, more: Partial<Archive> = {}): Archive => ({
  canvasId: `archive-${index}`,
  width: 2,
  height: 2,
  createdAt: 100 * index,
  archivedAt: 1000 + 10 * index,
  linkCode: `code${index}`.padEnd(10, "x"),
  ...more,
});

let logged: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => logged.mockRestore());

const depsWith = (
  canvases: { active: ActiveCanvas | null; archives: Archive[] },
  images: Record<string, CanvasImage> = {},
): ListDeps => ({
  durable: { listCanvasesForOwner: async () => canvases },
  redis: { getCanvasImage: async (canvasId) => images[canvasId] ?? null },
});

describe("sortArchives (Écart §10.3, JOURNAL 2026-10-06)", () => {
  // De la plus récemment archivée à la plus ancienne, sans toucher à la liste reçue
  it("goes from the most recently archived to the oldest, leaving the received list alone", () => {
    const received = [archiveOf(2), archiveOf(5), archiveOf(1), archiveOf(4)];

    expect(sortArchives(received).map(({ canvasId }) => canvasId)).toEqual([
      "archive-5",
      "archive-4",
      "archive-2",
      "archive-1",
    ]);
    expect(received.map(({ canvasId }) => canvasId)).toEqual([
      "archive-2",
      "archive-5",
      "archive-1",
      "archive-4",
    ]);
  });

  // Une date d'archivage égale garde l'ordre reçu, et une liste vide reste vide
  it("keeps the received order on an equal archive date, and an empty list stays empty", () => {
    const tied = [archiveOf(1, { archivedAt: 50 }), archiveOf(2, { archivedAt: 50 })];

    expect(sortArchives(tied).map(({ canvasId }) => canvasId)).toEqual(["archive-1", "archive-2"]);
    expect(sortArchives([])).toEqual([]);
  });
});

describe("listCanvases (Écart §10.3, JOURNAL 2026-10-06)", () => {
  // Rend le canvas actif puis les archives de la plus récente à la plus ancienne, chacune avec sa miniature en base64
  it("gives the active canvas then the archives from the most recent, each with its thumbnail in base64", async () => {
    const images = {
      "canvas-a": { width: 4, height: 3, state: Uint8Array.from({ length: 12 }, (_, index) => index) },
      "archive-2": { width: 2, height: 2, state: Uint8Array.from([5, 0, 0, 7]) },
    };

    const listed = await listCanvases(
      depsWith({ active, archives: [archiveOf(1), archiveOf(2)] }, images),
      "owner-1",
    );

    expect(listed).toEqual({
      ok: true,
      value: {
        active: {
          canvasId: "canvas-a",
          createdAt: 3000,
          name: "En cours",
          thumbnail: { width: 4, height: 3, state: toBase64(images["canvas-a"].state) },
        },
        archives: [
          {
            canvasId: "archive-2",
            createdAt: 200,
            archivedAt: 1020,
            linkCode: "code2xxxxx",
            thumbnail: { width: 2, height: 2, state: toBase64(images["archive-2"].state) },
          },
          {
            canvasId: "archive-1",
            createdAt: 100,
            archivedAt: 1010,
            linkCode: "code1xxxxx",
            thumbnail: null,
          },
        ],
      },
    });
  });

  // La taille se lit dans Redis, qui fait foi : Convex garde celle de la naissance, qu'un changement de taille n'atteint pas
  it("reads the size in Redis, which is the truth: Convex keeps the size of the birth", async () => {
    const image = { width: 50, height: 50, state: new Uint8Array(2500) };

    const listed = await listCanvases(
      depsWith(
        {
          active: { ...active, width: 256, height: 256 },
          archives: [archiveOf(1, { width: 256, height: 256 })],
        },
        { "canvas-a": image, "archive-1": image },
      ),
      "owner-1",
    );

    expect(listed).toEqual({
      ok: true,
      value: {
        active: {
          canvasId: "canvas-a",
          createdAt: 3000,
          name: "En cours",
          thumbnail: { width: 50, height: 50, state: toBase64(image.state) },
        },
        archives: [
          {
            canvasId: "archive-1",
            createdAt: 100,
            archivedAt: 1010,
            linkCode: "code1xxxxx",
            thumbnail: { width: 50, height: 50, state: toBase64(image.state) },
          },
        ],
      },
    });
  });

  // Un canvas que Convex connaît et que Redis n'a plus : ni taille ni miniature, et la liste reste entière
  it("gives neither size nor thumbnail to a canvas Convex knows and Redis does not, and keeps the list", async () => {
    const listed = await listCanvases(
      depsWith({
        active: { ...active, width: 256, height: 256 },
        archives: [archiveOf(1, { width: 256, height: 256 })],
      }),
      "owner-1",
    );

    expect(listed).toEqual({
      ok: true,
      value: {
        active: { canvasId: "canvas-a", createdAt: 3000, name: "En cours", thumbnail: null },
        archives: [
          {
            canvasId: "archive-1",
            createdAt: 100,
            archivedAt: 1010,
            linkCode: "code1xxxxx",
            thumbnail: null,
          },
        ],
      },
    });
  });

  // Garde le nom d'une archive, ne montre pas de nom vide, et rend un propriétaire sans canvas actif
  it("keeps the name of an archive, shows no empty name, and handles an owner without an active canvas", async () => {
    const listed = await listCanvases(
      depsWith({ active: null, archives: [archiveOf(1, { name: "Hiver" })] }),
      "owner-1",
    );

    expect(listed).toMatchObject({ ok: true, value: { active: null, archives: [{ name: "Hiver" }] } });
  });

  // Une lecture qui échoue donne `failed`, journalisée, plutôt qu'une erreur du serveur
  it("gives failed, logged, when a read fails, rather than a server error", async () => {
    const deps: ListDeps = {
      durable: {
        listCanvasesForOwner: async () => {
          throw new Error("Convex injoignable");
        },
      },
      redis: { getCanvasImage: async () => null },
    };

    expect(await listCanvases(deps, "owner-1")).toEqual({ ok: false, error: "failed" });

    expect(logged).toHaveBeenCalled();
  });

  // Une miniature qui ne se lit pas ne vide pas la liste : elle manque, c'est tout
  it("keeps the list when a thumbnail cannot be read: it is missing, that is all", async () => {
    const deps: ListDeps = {
      durable: { listCanvasesForOwner: async () => ({ active, archives: [archiveOf(1)] }) },
      redis: {
        getCanvasImage: async (canvasId) => {
          if (canvasId === "archive-1") throw new Error("Redis a coupé");
          return null;
        },
      },
    };

    const listed = await listCanvases(deps, "owner-1");

    expect(listed).toMatchObject({
      ok: true,
      value: { archives: [{ canvasId: "archive-1", thumbnail: null }] },
    });
    expect(logged).toHaveBeenCalled();
  });
});
