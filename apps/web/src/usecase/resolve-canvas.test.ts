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
const durableWith = (
  activeCanvas: (OwnedCanvas & { theme?: string }) | null,
  user: User = owner,
): Pick<DurableStore, "getUserByLogin" | "getActiveCanvasForOwner"> => ({
  getUserByLogin: async (login) => (login === user.login ? user : null),
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

  // Rend le thème du canvas actif avec la page, dans le même appel que le canvas, et sans thème la clé est absente
  // (Écart §8.1, JOURNAL 2026-10-07)
  it("gives the theme of the active canvas with the page, and leaves the key out without one", async () => {
    expect(await resolveCanvas(durableWith({ ...canvas, theme: "Halloween" }), "fenysk")).toEqual({
      canvasId: canvas.canvasId,
      owner: { displayName: owner.displayName, login: owner.login, avatarUrl: owner.avatarUrl },
      theme: "Halloween",
    });
    expect(await resolveCanvas(durableWith(canvas), "fenysk")).not.toHaveProperty("theme");
    expect(await resolveCanvas(durableWith({ ...canvas, theme: "" }), "fenysk")).not.toHaveProperty("theme");
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

describe("resolveCanvas, le live du propriétaire (Écart §4, JOURNAL 2026-10-07)", () => {
  const trackerOf = (twitchLive?: { category: string }) => {
    const asked: string[] = [];
    return {
      asked,
      tracker: {
        getLive: async (ownerId: string) => {
          asked.push(ownerId);
          return twitchLive;
        },
      },
    };
  };

  // Quand le propriétaire est en live, le profil de la pill Canvas le porte dès le rendu serveur
  it("carries the owner's live in the profile, as soon as the server renders", async () => {
    const { tracker, asked } = trackerOf({ category: "Art" });

    const page = await resolveCanvas(durableWith(canvas), "fenysk", undefined, tracker);

    expect(page?.owner).toEqual({
      displayName: owner.displayName,
      login: owner.login,
      avatarUrl: owner.avatarUrl,
      twitchLive: { category: "Art" },
    });
    expect(asked).toEqual([owner.userId]);
  });

  // Hors live, le profil ne porte aucune clé de live
  it("leaves the live out of the profile when the owner is not live", async () => {
    const { tracker } = trackerOf();

    const page = await resolveCanvas(durableWith(canvas), "fenysk", undefined, tracker);

    expect(page?.owner).not.toHaveProperty("twitchLive");
  });

  // Pour un pseudo sans canvas, ou sans suivi (la vue OBS), le live n'est pas demandé
  it("does not ask for the live of a login without a canvas, nor without tracking", async () => {
    const { tracker, asked } = trackerOf({ category: "Art" });

    expect(await resolveCanvas(durableWith(null), "fenysk", undefined, tracker)).toBeNull();
    expect((await resolveCanvas(durableWith(canvas), "fenysk"))?.owner).not.toHaveProperty("twitchLive");
    expect(asked).toEqual([]);
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
