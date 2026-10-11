import { BACKGROUND_IMAGE_MAX_BYTES, type Session } from "@liveplace/domain";
import type { SessionVerifier } from "@liveplace/domain/ports";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route } from "../../routes/$login_.background";
import type { BackgroundImages } from "../../usecase/background-images";
import type { BackgroundImageDeps } from "../../usecase/canvas-background-image";
import { backgroundImageResponse, uploadBackgroundImageResponse } from "./background-image-response";

// Écart §9.1 (JOURNAL 2026-10-10) : `/{login}/background`, l'image du fond lue par toutes les pages et postée par le streamer.

const AT = 1_760_000_000_000;
const WEBP = new Uint8Array(64);
WEBP.set(new TextEncoder().encode("RIFF"), 0);
WEBP.set(new TextEncoder().encode("WEBP"), 8);

const session: Session = { userId: "owner-1", login: "owner1", displayName: "Owner 1" };

afterEach(() => vi.restoreAllMocks());

const imagesOf = (stored: Record<string, Uint8Array>): BackgroundImages => ({
  get: async (login, at) => (at === AT ? (stored[login] ?? null) : null),
});

describe("la réponse GET de /{login}/background", () => {
  // Quand le login a l'image de cet instant, le système doit répondre ses octets en WebP, gardés un an par tous les caches
  it("answers the bytes as a WebP that every cache keeps a year, since the instant dates the address", async () => {
    const response = await backgroundImageResponse(imagesOf({ fenysk: WEBP }), "fenysk", String(AT));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(WEBP);
  });

  // Si l'instant manque, n'est pas un entier, ou n'est plus celui de l'image, alors le système doit répondre 404 sans corps, qu'aucun cache ne retient
  it("answers 404 with no body, kept by no cache, when the instant is missing, not a whole number, or no longer the image's", async () => {
    const images = imagesOf({ fenysk: WEBP });

    for (const version of [null, "", "abc", "-5", "1.5", String(AT + 1), "9".repeat(30)]) {
      const response = await backgroundImageResponse(images, "fenysk", version);

      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.text()).toBe("");
    }
  });

  // Si le login est inconnu, alors le système doit répondre 404 aussi
  it("answers 404 for an unknown login", async () => {
    expect((await backgroundImageResponse(imagesOf({}), "inconnu", String(AT))).status).toBe(404);
  });

  // Si la lecture échoue, alors le système doit répondre 503 sans corps ni cache, et journaliser l'erreur avec son contexte
  it("answers 503 with no body and no cache when the read fails, and logs the error with its context", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failing: BackgroundImages = {
      get: async () => {
        throw new Error("Convex down");
      },
    };

    const response = await backgroundImageResponse(failing, "fenysk", String(AT));

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("image du fond"), expect.any(Error));
  });
});

type Stored = { ownerId: string; canvasId: string; size: number };

const uploadSetup = (
  cookieSession: Session | null = session,
  outcome: "commits" | "refuses" | "throws" = "commits",
) => {
  const stored: Stored[] = [];
  const verifier: SessionVerifier = { verify: async () => cookieSession };
  const deps: BackgroundImageDeps & { verifier: SessionVerifier } = {
    verifier,
    durable: {
      setActiveCanvasBackgroundImage: async (ownerId, canvasId, image) => {
        stored.push({ ownerId, canvasId, size: image.byteLength });
        if (outcome === "throws") throw new Error("Convex down");
        return outcome === "refuses" ? { ok: false, error: "not_active" } : { ok: true, value: { at: AT } };
      },
      clearActiveCanvasBackgroundImage: async () => ({ ok: true, value: undefined }),
    },
    redis: { setBackgroundImage: async () => undefined, clearBackgroundImage: async () => undefined },
  };
  return { deps, stored };
};

// Un corps en flux se poste en `duplex: "half"`, comme le fait le navigateur.
const post = (query: string, body: BodyInit | null, headers: Record<string, string> = {}): Request =>
  new Request(`https://liveplace.test/fenysk/background${query}`, {
    method: "POST",
    body,
    headers,
    ...(body instanceof ReadableStream ? { duplex: "half" } : {}),
  } as RequestInit);

const errorOf = async (response: Response): Promise<unknown> => (await response.json()).error;

describe("la réponse POST de /{login}/background", () => {
  // Quand le propriétaire poste un WebP pour un canvas, le système doit le ranger pour le propriétaire du cookie, jamais celui d'un paramètre
  it("stores a posted WebP for the owner of the cookie, never one named by a parameter", async () => {
    const { deps, stored } = uploadSetup();

    const response = await uploadBackgroundImageResponse(
      deps,
      post("?canvas=canvas-a&owner=intruder", WEBP),
      "lp_session=ok",
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(stored).toEqual([{ ownerId: "owner-1", canvasId: "canvas-a", size: WEBP.byteLength }]);
  });

  // Si le cookie ne désigne personne, alors le système doit répondre 401 et ne rien lire du corps ni appeler Convex
  it("answers 401 and reads nothing of the body when the cookie names nobody", async () => {
    const { deps, stored } = uploadSetup(null);
    const request = post("?canvas=canvas-a", WEBP);

    const response = await uploadBackgroundImageResponse(deps, request, undefined);

    expect(response.status).toBe(401);
    expect(await errorOf(response)).toBe("unauthenticated");
    expect(request.bodyUsed).toBe(false);
    expect(stored).toEqual([]);
  });

  // Si le canvas visé manque ou est démesuré, alors le système doit répondre 400 sans appeler Convex
  it("answers 400 when the canvas is missing or oversized, without asking Convex", async () => {
    const { deps, stored } = uploadSetup();

    for (const query of ["", "?canvas=", `?canvas=${"a".repeat(101)}`]) {
      const response = await uploadBackgroundImageResponse(deps, post(query, WEBP), "lp_session=ok");

      expect(response.status).toBe(400);
    }
    expect(stored).toEqual([]);
  });

  // Si l'en-tête annonce plus de 2 Mo, alors le système doit répondre 413 sans lire le corps ; un corps trop long sans en-tête aussi
  it("answers 413 without reading the body when the header announces more than 2 MB, and for a body too long without one", async () => {
    const { deps, stored } = uploadSetup();
    const announced = post("?canvas=canvas-a", WEBP, {
      "content-length": String(BACKGROUND_IMAGE_MAX_BYTES + 1),
    });
    const streamed = post(
      "?canvas=canvas-a",
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(BACKGROUND_IMAGE_MAX_BYTES));
          controller.enqueue(new Uint8Array(1));
          controller.close();
        },
      }),
    );

    const first = await uploadBackgroundImageResponse(deps, announced, "lp_session=ok");
    const second = await uploadBackgroundImageResponse(deps, streamed, "lp_session=ok");

    expect([first.status, second.status]).toEqual([413, 413]);
    expect(await errorOf(first)).toBe("too_big");
    expect(announced.bodyUsed).toBe(false);
    expect(stored).toEqual([]);
  });

  // Si les octets ne sont pas un WebP, alors le système doit répondre 415
  it("answers 415 for bytes that are not a WebP", async () => {
    const { deps } = uploadSetup();

    const response = await uploadBackgroundImageResponse(
      deps,
      post("?canvas=canvas-a", new TextEncoder().encode("GIF89a")),
      "lp_session=ok",
    );

    expect(response.status).toBe(415);
    expect(await errorOf(response)).toBe("invalid_image");
  });

  // Si Convex refuse, le canvas n'étant plus l'actif, alors le système doit répondre 409 ; sans réponse de Convex, 502
  it("answers 409 when Convex refuses, the canvas no longer being the active one, and 502 when it does not answer", async () => {
    const refusing = uploadSetup(session, "refuses");
    const lost = uploadSetup(session, "throws");
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const refused = await uploadBackgroundImageResponse(
      refusing.deps,
      post("?canvas=canvas-a", WEBP),
      "lp_session=ok",
    );
    const failed = await uploadBackgroundImageResponse(
      lost.deps,
      post("?canvas=canvas-a", WEBP),
      "lp_session=ok",
    );

    expect([refused.status, failed.status]).toEqual([409, 502]);
    expect([await errorOf(refused), await errorOf(failed)]).toEqual(["not_active", "failed"]);
  });
});

describe("la route /{login}/background", () => {
  // Quand la route reçoit un GET, le système doit demander l'image du login de l'adresse, à l'instant de `v`, aux dépendances
  it("asks the dependencies for the image of the login of the address, at the instant of `v`", async () => {
    const handlers = Route.options.server?.handlers;
    const get = typeof handlers === "object" ? handlers.GET : undefined;

    const result = await get?.({
      params: { login: "fenysk" },
      request: new Request(`https://liveplace.test/fenysk/background?v=${AT}`),
      context: { deps: { backgroundImages: imagesOf({ fenysk: WEBP }) } },
    } as never);

    const response = result instanceof Response ? result : undefined;
    expect(response?.status).toBe(200);
    expect(response?.headers.get("content-type")).toBe("image/webp");
  });

  // Quand la route reçoit un POST, le système doit le confier à la réponse d'envoi avec le cookie de la requête
  it("hands a POST to the upload answer with the cookie of the request", async () => {
    const handlers = Route.options.server?.handlers;
    const onPost = typeof handlers === "object" ? handlers.POST : undefined;
    const { deps, stored } = uploadSetup();

    const result = await onPost?.({
      params: { login: "fenysk" },
      request: new Request("https://liveplace.test/fenysk/background?canvas=canvas-a", {
        method: "POST",
        body: WEBP,
        headers: { cookie: "lp_session=ok" },
      }),
      context: { deps: { verifier: deps.verifier, durable: deps.durable, archiveWrites: deps.redis } },
    } as never);

    const response = result instanceof Response ? result : undefined;
    expect(response?.status).toBe(200);
    expect(stored).toEqual([{ ownerId: "owner-1", canvasId: "canvas-a", size: WEBP.byteLength }]);
  });
});
