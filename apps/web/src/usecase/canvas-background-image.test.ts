import { BACKGROUND_IMAGE_MAX_BYTES } from "@liveplace/domain";
import type { DurableStore } from "@liveplace/domain/ports";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type BackgroundImageDeps,
  clearCanvasBackgroundImage,
  isWebp,
  setCanvasBackgroundImage,
} from "./canvas-background-image";

// Écart §8.1 (JOURNAL 2026-10-10) : poser ou retirer l'image du fond du canvas en cours. Convex tranche, puis Redis suit : la
// copie du gateway et les frames qui l'apprennent aux pages. Les doubles notent ce qu'on leur demande, dans l'ordre.

const AT = 1_760_000_000_000;

// Un fichier WebP minimal : l'en-tête RIFF, sa taille, `WEBP`, puis de quoi remplir.
const webp = (size = 64): Uint8Array => {
  const bytes = new Uint8Array(size);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  bytes.set(new TextEncoder().encode("WEBP"), 8);
  return bytes;
};

type Outcome = "commits" | "refuses" | "throws";

const setup = (outcome: Outcome = "commits", failsAt?: "setBackgroundImage" | "clearBackgroundImage") => {
  const durableLog: string[] = [];
  const redisLog: string[] = [];
  const setActiveCanvasBackgroundImage: DurableStore["setActiveCanvasBackgroundImage"] = async (
    ownerId,
    canvasId,
    image,
  ) => {
    durableLog.push(`set ${ownerId} ${canvasId} ${image.byteLength}`);
    if (outcome === "throws") throw new Error("Convex ne répond pas");
    return outcome === "refuses" ? { ok: false, error: "not_active" } : { ok: true, value: { at: AT } };
  };
  const clearActiveCanvasBackgroundImage: DurableStore["clearActiveCanvasBackgroundImage"] = async (
    ownerId,
    canvasId,
  ) => {
    durableLog.push(`clear ${ownerId} ${canvasId}`);
    if (outcome === "throws") throw new Error("Convex ne répond pas");
    return outcome === "refuses" ? { ok: false, error: "not_active" } : { ok: true, value: undefined };
  };
  const deps: BackgroundImageDeps = {
    durable: { setActiveCanvasBackgroundImage, clearActiveCanvasBackgroundImage },
    redis: {
      setBackgroundImage: async (canvasId, at) => {
        redisLog.push(`set ${canvasId} ${at}`);
        if (failsAt === "setBackgroundImage") throw new Error("Redis a échoué");
      },
      clearBackgroundImage: async (canvasId) => {
        redisLog.push(`clear ${canvasId}`);
        if (failsAt === "clearBackgroundImage") throw new Error("Redis a échoué");
      },
    },
  };
  return { deps, durableLog, redisLog };
};

afterEach(() => vi.restoreAllMocks());

describe("isWebp", () => {
  // Quand les octets commencent par RIFF, une taille, puis WEBP, le système doit y voir un WebP, et rien d'autre
  it("sees a WebP in bytes that start with RIFF, a size and WEBP, and nothing else", () => {
    expect(isWebp(webp())).toBe(true);
    expect(isWebp(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]))).toBe(false); // un PNG
    expect(isWebp(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false); // un JPEG
    expect(isWebp(new TextEncoder().encode("RIFF....WAVE"))).toBe(false); // un autre conteneur RIFF
    expect(isWebp(new TextEncoder().encode("RIFF....WEB"))).toBe(false); // trop court
    expect(isWebp(new Uint8Array(0))).toBe(false);
  });
});

describe("setCanvasBackgroundImage (Écart §8.1, JOURNAL 2026-10-10)", () => {
  // Quand le propriétaire envoie un WebP, le système doit le ranger dans Convex pour le canvas visé, puis copier l'instant que
  // Convex rend dans Redis
  it("stores a WebP in Convex for the canvas of the request, then copies the instant Convex gives into Redis", async () => {
    const { deps, durableLog, redisLog } = setup();

    const result = await setCanvasBackgroundImage(deps, "owner-1", {
      canvasId: "canvas-a",
      image: webp(300),
    });

    expect(result).toEqual({ ok: true, value: undefined });
    expect(durableLog).toEqual(["set owner-1 canvas-a 300"]);
    expect(redisLog).toEqual([`set canvas-a ${AT}`]);
  });

  // Si l'image dépasse 2 Mo, le système doit la refuser sans appeler Convex, même si c'est un WebP ; 2 Mo pile passent
  it("refuses an image over 2 MB without asking Convex, even a WebP, and lets exactly 2 MB through", async () => {
    const { deps, durableLog } = setup();

    expect(
      await setCanvasBackgroundImage(deps, "owner-1", {
        canvasId: "canvas-a",
        image: webp(BACKGROUND_IMAGE_MAX_BYTES + 1),
      }),
    ).toEqual({ ok: false, error: "too_big" });
    expect(durableLog).toEqual([]);

    const exact = await setCanvasBackgroundImage(deps, "owner-1", {
      canvasId: "canvas-a",
      image: webp(BACKGROUND_IMAGE_MAX_BYTES),
    });
    expect(exact.ok).toBe(true);
  });

  // Si les octets ne sont pas un WebP, le système doit refuser `invalid_image` sans appeler Convex, quoi que dise l'en-tête de la requête
  it("refuses bytes that are not a WebP without asking Convex", async () => {
    const { deps, durableLog, redisLog } = setup();

    const result = await setCanvasBackgroundImage(deps, "owner-1", {
      canvasId: "canvas-a",
      image: new TextEncoder().encode("<svg onload=alert(1)></svg>"),
    });

    expect(result).toEqual({ ok: false, error: "invalid_image" });
    expect(durableLog).toEqual([]);
    expect(redisLog).toEqual([]);
  });

  // Un refus de Convex est une valeur : ce n'est plus le canvas actif, et Redis n'est pas touché
  it("gives Convex's refusal back as it is, and leaves Redis alone", async () => {
    const { deps, redisLog } = setup("refuses");

    expect(await setCanvasBackgroundImage(deps, "owner-1", { canvasId: "canvas-a", image: webp() })).toEqual({
      ok: false,
      error: "not_active",
    });
    expect(redisLog).toEqual([]);
  });

  // Une réponse perdue n'est pas un refus : `failed`, Redis intact, et l'erreur est journalisée avec son contexte
  it("fails without an answer from Convex, leaves Redis alone, and logs the error with its context", async () => {
    const { deps, redisLog } = setup("throws");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await setCanvasBackgroundImage(deps, "owner-1", { canvasId: "canvas-a", image: webp() })).toEqual({
      ok: false,
      error: "failed",
    });
    expect(redisLog).toEqual([]);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("image du fond"), expect.any(Error));
  });

  // Si Redis échoue après Convex, l'image est enregistrée : le système doit réussir, et journaliser, jamais défaire Convex
  it("succeeds when Redis fails after Convex, and logs it", async () => {
    const { deps } = setup("commits", "setBackgroundImage");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await setCanvasBackgroundImage(deps, "owner-1", { canvasId: "canvas-a", image: webp() })).toEqual({
      ok: true,
      value: undefined,
    });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("image du fond"), expect.any(Error));
  });
});

describe("clearCanvasBackgroundImage (Écart §8.1, JOURNAL 2026-10-10)", () => {
  // Quand le propriétaire retire l'image, le système doit la retirer de Convex pour ce canvas, puis de Redis
  it("clears the image from Convex for the canvas of the request, then from Redis", async () => {
    const { deps, durableLog, redisLog } = setup();

    const result = await clearCanvasBackgroundImage(deps, "owner-2", { canvasId: "canvas-b" });

    expect(result).toEqual({ ok: true, value: undefined });
    expect(durableLog).toEqual(["clear owner-2 canvas-b"]);
    expect(redisLog).toEqual(["clear canvas-b"]);
  });

  // Un refus de Convex est rendu tel quel, Redis intact ; une réponse perdue est `failed`, journalisée
  it("gives Convex's refusal back as it is, and fails when Convex does not answer, Redis left alone both times", async () => {
    const refused = setup("refuses");
    const lost = setup("throws");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await clearCanvasBackgroundImage(refused.deps, "owner-1", { canvasId: "canvas-a" })).toEqual({
      ok: false,
      error: "not_active",
    });
    expect(await clearCanvasBackgroundImage(lost.deps, "owner-1", { canvasId: "canvas-a" })).toEqual({
      ok: false,
      error: "failed",
    });
    expect(refused.redisLog).toEqual([]);
    expect(lost.redisLog).toEqual([]);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("image du fond"), expect.any(Error));
  });

  // Si Redis échoue après Convex, l'image est retirée : le système doit réussir, et journaliser
  it("succeeds when Redis fails after Convex, and logs it", async () => {
    const { deps } = setup("commits", "clearBackgroundImage");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await clearCanvasBackgroundImage(deps, "owner-1", { canvasId: "canvas-a" })).toEqual({
      ok: true,
      value: undefined,
    });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("image du fond"), expect.any(Error));
  });
});
