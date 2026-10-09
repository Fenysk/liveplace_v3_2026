import { THEME_MAX_LENGTH } from "@liveplace/domain";
import type { DurableStore } from "@liveplace/domain/ports";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setCanvasTheme, type ThemeDeps } from "./set-canvas-theme";

// Écart §8.1 (JOURNAL 2026-10-07) : donner un thème au canvas en cours. Convex tranche, puis Redis suit : la copie du
// gateway, puis le `ctl` qui l'apprend aux pages. Les doubles notent ce qu'on leur demande, dans l'ordre.

type Call = { ownerId: string; canvasId: string; theme: string | undefined };
type Outcome = "commits" | "refuses" | "throws";

const setup = (outcome: Outcome = "commits", failsAt?: "setTheme" | "publishTheme") => {
  const calls: Call[] = [];
  const redisLog: string[] = [];
  const setActiveCanvasTheme: DurableStore["setActiveCanvasTheme"] = async (ownerId, canvasId, theme) => {
    calls.push({ ownerId, canvasId, theme });
    if (outcome === "throws") throw new Error("Convex ne répond pas");
    return outcome === "refuses" ? { ok: false, error: "not_active" } : { ok: true, value: undefined };
  };
  const redisStep = (method: "setTheme" | "publishTheme") => async (canvasId: string, theme?: string) => {
    redisLog.push(`${method} ${canvasId} ${theme ?? "null"}`);
    if (failsAt === method) throw new Error(`${method} a échoué`);
  };
  const deps: ThemeDeps = {
    durable: { setActiveCanvasTheme },
    redis: { setTheme: redisStep("setTheme"), publishTheme: redisStep("publishTheme") },
  };
  return { deps, calls, redisLog };
};

afterEach(() => vi.restoreAllMocks());

describe("setCanvasTheme (Écart §8.1, JOURNAL 2026-10-07)", () => {
  // Le thème est nettoyé comme celui d'une archive : espaces rognés, une seule espace, 40 caractères au plus
  it("cleans the theme like an archive's: trimmed, one space between words, 40 characters at most", async () => {
    const { deps, calls } = setup();

    await setCanvasTheme(deps, "owner-1", { canvasId: "canvas-a", theme: "  Pixel   war \n du 14  " });
    await setCanvasTheme(deps, "owner-1", { canvasId: "canvas-a", theme: "a".repeat(60) });

    expect(calls.map(({ theme }) => theme)).toEqual(["Pixel war du 14", "a".repeat(THEME_MAX_LENGTH)]);
  });

  // Un thème vide, c'est plus de thème : Convex reçoit `undefined`, qui retire le champ
  it("sends no theme for an empty one, which removes it", async () => {
    const { deps, calls } = setup();

    const result = await setCanvasTheme(deps, "owner-1", { canvasId: "canvas-a", theme: "   " });

    expect(result).toEqual({ ok: true, value: undefined });
    expect(calls).toEqual([{ ownerId: "owner-1", canvasId: "canvas-a", theme: undefined }]);
  });

  // Le propriétaire est celui qu'on donne (la session), le canvas celui de la demande
  it("asks Convex with the owner it is given and the canvas of the request", async () => {
    const { deps, calls } = setup();

    await setCanvasTheme(deps, "owner-2", { canvasId: "canvas-b", theme: "Printemps" });

    expect(calls).toEqual([{ ownerId: "owner-2", canvasId: "canvas-b", theme: "Printemps" }]);
  });

  // Un refus de Convex est une valeur : ce n'est plus le canvas actif, la page n'est pas à jour
  it("gives Convex's refusal back as it is: the canvas is no longer the active one", async () => {
    const { deps } = setup("refuses");

    expect(await setCanvasTheme(deps, "owner-1", { canvasId: "canvas-a", theme: "Printemps" })).toEqual({
      ok: false,
      error: "not_active",
    });
  });

  // Une réponse perdue n'est pas un refus : `failed`, et l'erreur est journalisée avec son contexte
  it("fails without an answer from Convex, and logs the error with its context", async () => {
    const { deps } = setup("throws");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await setCanvasTheme(deps, "owner-1", { canvasId: "canvas-a", theme: "Printemps" })).toEqual({
      ok: false,
      error: "failed",
    });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("canvases"), expect.any(Error));
  });

  // Une fois Convex d'accord, Redis suit dans l'ordre : la copie du gateway, puis le message qui l'apprend aux pages
  it("goes on in Redis once Convex agrees, in order: the gateway's copy, then the message that tells the pages", async () => {
    const { deps, redisLog } = setup();

    await setCanvasTheme(deps, "owner-1", { canvasId: "canvas-a", theme: "  Pixel   war " });
    await setCanvasTheme(deps, "owner-1", { canvasId: "canvas-a", theme: "  " });

    expect(redisLog).toEqual([
      "setTheme canvas-a Pixel war",
      "publishTheme canvas-a Pixel war",
      "setTheme canvas-a null",
      "publishTheme canvas-a null",
    ]);
  });

  // Quand Convex refuse ou ne répond pas, Redis ne bouge pas : sa copie égale toujours Convex
  it("leaves Redis alone when Convex refuses or does not answer: its copy always equals Convex", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const refused = setup("refuses");
    const lost = setup("throws");

    await setCanvasTheme(refused.deps, "owner-1", { canvasId: "canvas-a", theme: "Printemps" });
    await setCanvasTheme(lost.deps, "owner-1", { canvasId: "canvas-a", theme: "Printemps" });

    expect(refused.redisLog).toEqual([]);
    expect(lost.redisLog).toEqual([]);
  });

  // Après Convex, un échec de Redis ne défait rien : le thème est enregistré, l'erreur journalisée, et rien n'est publié
  // quand la copie n'a pas pu s'écrire
  it("undoes nothing when Redis fails after Convex: the theme is saved, the error logged, nothing published when the copy failed", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const copyFails = setup("commits", "setTheme");
    const publishFails = setup("commits", "publishTheme");

    expect(await setCanvasTheme(copyFails.deps, "owner-1", { canvasId: "c", theme: "Noël" })).toEqual({
      ok: true,
      value: undefined,
    });
    expect(await setCanvasTheme(publishFails.deps, "owner-1", { canvasId: "c", theme: "Noël" })).toEqual({
      ok: true,
      value: undefined,
    });

    expect(copyFails.redisLog).toEqual(["setTheme c Noël"]);
    expect(publishFails.redisLog).toEqual(["setTheme c Noël", "publishTheme c Noël"]);
    expect(log).toHaveBeenCalledWith("canvases : thème non copié dans Redis", expect.any(Error));
    expect(log).toHaveBeenCalledTimes(2);
  });
});
