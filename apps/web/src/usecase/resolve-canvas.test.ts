import type { Session, User } from "@liveplace/domain";
import type { DurableStore, OwnedCanvas, SessionVerifier } from "@liveplace/domain/ports";
import { describe, expect, it, vi } from "vitest";
import { resolveCanvas } from "./resolve-canvas";

const owner: User = {
  userId: "1234",
  login: "fenysk",
  displayName: "Fenysk",
  avatarUrl: "https://static-cdn.jtvnw.net/fenysk.png",
};
const canvas: OwnedCanvas = { canvasId: "opaque-canvas", width: 256, height: 256 };

// Un double qui ne connaît qu'un propriétaire, avec ou sans canvas actif.
const durableWith = (activeCanvas: OwnedCanvas | null, user: User = owner): DurableStore => ({
  upsertUserFromTwitch: async () => undefined,
  getUserByLogin: async (login) => (login === user.login ? user : null),
  ensureCanvasForOwner: async () => canvas.canvasId,
  getActiveCanvasForOwner: async (ownerId) => (ownerId === owner.userId ? activeCanvas : null),
});

describe("resolveCanvas (§9.1, D-14)", () => {
  // Résout un pseudo en canvas opaque, avec le profil de son propriétaire pour la pill Canvas (CDC 2026)
  it("resolves a login to its opaque canvas, with the owner's profile", async () => {
    expect(await resolveCanvas(durableWith(canvas), "fenysk")).toEqual({
      canvasId: canvas.canvasId,
      owner: { displayName: owner.displayName, login: owner.login, avatarUrl: owner.avatarUrl },
    });
  });

  // Sans photo Twitch, le profil n'en porte pas : la pill montre son initiale
  it("leaves the photo out when Twitch gave none", async () => {
    const withoutPhoto = { ...owner, avatarUrl: "" };
    expect(await resolveCanvas(durableWith(canvas, withoutPhoto), "fenysk")).toEqual({
      canvasId: canvas.canvasId,
      owner: { displayName: owner.displayName, login: owner.login },
    });
  });

  // Cherche le pseudo en minuscules, comme Twitch les écrit
  it("looks the login up in lowercase, as Twitch writes them", async () => {
    expect(await resolveCanvas(durableWith(canvas), "Fenysk")).not.toBeNull();
  });

  // Rend null pour un pseudo inconnu, ou pour un propriétaire sans canvas actif
  it("gives null for an unknown login, or for an owner without an active canvas", async () => {
    expect(await resolveCanvas(durableWith(canvas), "inconnu")).toBeNull();
    expect(await resolveCanvas(durableWith(null), "fenysk")).toBeNull();
  });
});

describe("resolveCanvas, la session du visiteur (§10.2, JOURNAL 2026-10-06)", () => {
  const page = {
    canvasId: canvas.canvasId,
    owner: { displayName: owner.displayName, login: owner.login, avatarUrl: owner.avatarUrl },
  };
  const visitOf = (verify: SessionVerifier["verify"]) => ({
    verifier: { verify },
    cookieHeader: "lp_session=signed",
  });
  const sessionOf = (userId: string): Session => ({ userId, login: "someone", displayName: "Someone" });

  // Quand le cookie est celui du propriétaire, la page sait que c'est lui, sans jamais rendre son identifiant
  it("tells that the visitor is the owner when the cookie is the owner's", async () => {
    const visit = visitOf(async () => sessionOf(owner.userId));
    expect(await resolveCanvas(durableWith(canvas), "fenysk", visit)).toEqual({
      ...page,
      isOwnerSession: true,
    });
  });

  // Quand le cookie est celui d'un autre compte, ce n'est pas le propriétaire
  it("tells that another account is not the owner", async () => {
    const visit = visitOf(async () => sessionOf("9999"));
    expect(await resolveCanvas(durableWith(canvas), "fenysk", visit)).toEqual({
      ...page,
      isOwnerSession: false,
    });
  });

  // Quand le vérificateur ne reconnaît pas le cookie (absent, expiré, falsifié), le visiteur est un invité
  it("tells that a guest is not the owner", async () => {
    const visit = visitOf(async () => null);
    expect(await resolveCanvas(durableWith(canvas), "fenysk", visit)).toEqual({
      ...page,
      isOwnerSession: false,
    });
  });

  // Si la vérification lève, alors la page se rend quand même, comme pour un invité
  it("still renders the page, as for a guest, when the verification throws", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const visit = visitOf(async () => {
      throw new Error("jose en panne");
    });
    expect(await resolveCanvas(durableWith(canvas), "fenysk", visit)).toEqual({
      ...page,
      isOwnerSession: false,
    });
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });

  // Le vérificateur reçoit le cookie de la requête tel quel
  it("hands the request's cookie to the verifier", async () => {
    const verify = vi.fn(async () => null);
    await resolveCanvas(durableWith(canvas), "fenysk", visitOf(verify));
    expect(verify).toHaveBeenCalledWith("lp_session=signed");
  });

  // Sans visite (la vue OBS), la page ne porte pas le drapeau
  it("leaves the flag out for the OBS view, which gives no visit", async () => {
    expect(await resolveCanvas(durableWith(canvas), "fenysk")).not.toHaveProperty("isOwnerSession");
  });

  // Pour un pseudo sans canvas, le cookie n'est pas lu
  it("does not read the cookie for a login without a canvas", async () => {
    const verify = vi.fn(async () => null);
    expect(await resolveCanvas(durableWith(null), "fenysk", visitOf(verify))).toBeNull();
    expect(verify).not.toHaveBeenCalled();
  });
});
