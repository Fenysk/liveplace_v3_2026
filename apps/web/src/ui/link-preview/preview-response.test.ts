import { describe, expect, it } from "vitest";
import { Route } from "../../routes/$login_.preview[.]png";
import type { CanvasPreviews } from "../../usecase/canvas-preview";
import { canvasPreviewResponse } from "./preview-response";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

const previewsOf = (pngs: Record<string, Uint8Array<ArrayBuffer>>): CanvasPreviews => ({
  get: async (login) => pngs[login] ?? null,
});

describe("la réponse de /{login}/preview.png", () => {
  // Quand le login a un canvas, le système doit répondre son image en PNG, gardée cinq minutes par tous les caches
  it("answers the image as a PNG that every cache keeps five minutes", async () => {
    const response = await canvasPreviewResponse(previewsOf({ fenysk: PNG }), "fenysk");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("public, max-age=300");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG);
  });

  // Si le login n'a pas de canvas, ou que son canvas n'est pas servi, alors le système doit répondre 404 sans corps, qu'aucun cache ne retient
  it("answers 404 with no body, kept by no cache, when there is no image", async () => {
    const response = await canvasPreviewResponse(previewsOf({}), "inconnu");

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("");
  });

  // Quand la route reçoit une requête, le système doit demander l'image du login de l'adresse aux images d'aperçu des dépendances
  it("asks the previews of the dependencies for the login of the address", async () => {
    const handlers = Route.options.server?.handlers;
    const get = typeof handlers === "object" ? handlers.GET : undefined;

    const result = await get?.({
      params: { login: "fenysk" },
      context: { deps: { canvasPreviews: previewsOf({ fenysk: PNG }) } },
    } as never);

    const response = result instanceof Response ? result : undefined;
    expect(response?.status).toBe(200);
    expect(response?.headers.get("content-type")).toBe("image/png");
  });
});
