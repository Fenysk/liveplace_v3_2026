import type { User } from "@liveplace/domain";
import type { DurableStore, OwnedCanvas } from "@liveplace/domain/ports";
import { describe, expect, it } from "vitest";
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
