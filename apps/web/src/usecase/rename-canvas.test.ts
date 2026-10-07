import { ARCHIVE_NAME_MAX_LENGTH } from "@liveplace/domain";
import type { DurableStore } from "@liveplace/domain/ports";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type RenameDeps, renameCanvas } from "./rename-canvas";

// Écart §15 (JOURNAL 2026-10-06) : nommer le canvas en cours. Convex tranche, rien d'autre ne bouge : le nom n'est pas
// dans Redis. Le double note ce qu'on lui demande.

type Call = { ownerId: string; canvasId: string; name: string | undefined };
type Outcome = "commits" | "refuses" | "throws";

const setup = (outcome: Outcome = "commits") => {
  const calls: Call[] = [];
  const renameActiveCanvas: DurableStore["renameActiveCanvas"] = async (ownerId, canvasId, name) => {
    calls.push({ ownerId, canvasId, name });
    if (outcome === "throws") throw new Error("Convex ne répond pas");
    return outcome === "refuses" ? { ok: false, error: "not_active" } : { ok: true, value: undefined };
  };
  const deps: RenameDeps = { durable: { renameActiveCanvas } };
  return { deps, calls };
};

afterEach(() => vi.restoreAllMocks());

describe("renameCanvas (Écart §15, JOURNAL 2026-10-06)", () => {
  // Le nom est nettoyé comme celui d'une archive : espaces rognés, une seule espace, 40 caractères au plus
  it("cleans the name like an archive's: trimmed, one space between words, 40 characters at most", async () => {
    const { deps, calls } = setup();

    await renameCanvas(deps, "owner-1", { canvasId: "canvas-a", name: "  Pixel   war \n du 14  " });
    await renameCanvas(deps, "owner-1", { canvasId: "canvas-a", name: "a".repeat(60) });

    expect(calls.map(({ name }) => name)).toEqual(["Pixel war du 14", "a".repeat(ARCHIVE_NAME_MAX_LENGTH)]);
  });

  // Un nom vide, c'est plus de nom : Convex reçoit `undefined`, qui retire le champ
  it("sends no name for an empty one, which removes it", async () => {
    const { deps, calls } = setup();

    const result = await renameCanvas(deps, "owner-1", { canvasId: "canvas-a", name: "   " });

    expect(result).toEqual({ ok: true, value: undefined });
    expect(calls).toEqual([{ ownerId: "owner-1", canvasId: "canvas-a", name: undefined }]);
  });

  // Le propriétaire est celui qu'on donne (la session), le canvas celui de la demande
  it("asks Convex with the owner it is given and the canvas of the request", async () => {
    const { deps, calls } = setup();

    await renameCanvas(deps, "owner-2", { canvasId: "canvas-b", name: "Printemps" });

    expect(calls).toEqual([{ ownerId: "owner-2", canvasId: "canvas-b", name: "Printemps" }]);
  });

  // Un refus de Convex est une valeur : ce n'est plus le canvas actif, la page n'est pas à jour
  it("gives Convex's refusal back as it is: the canvas is no longer the active one", async () => {
    const { deps } = setup("refuses");

    expect(await renameCanvas(deps, "owner-1", { canvasId: "canvas-a", name: "Printemps" })).toEqual({
      ok: false,
      error: "not_active",
    });
  });

  // Une réponse perdue n'est pas un refus : `failed`, et l'erreur est journalisée avec son contexte
  it("fails without an answer from Convex, and logs the error with its context", async () => {
    const { deps } = setup("throws");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await renameCanvas(deps, "owner-1", { canvasId: "canvas-a", name: "Printemps" })).toEqual({
      ok: false,
      error: "failed",
    });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("canvases"), expect.any(Error));
  });
});
