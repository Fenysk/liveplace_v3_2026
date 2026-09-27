import type { User } from "@liveplace/domain";
import type { SignedInUser } from "@liveplace/domain/ports";
import { describe, expect, it } from "vitest";
import { completeSignIn, type SignInDeps } from "./sign-in";

const user: User = { userId: "1234", login: "fenysk", displayName: "Fenysk", avatarUrl: "https://avatar" };
const owner: User = {
  userId: "5678",
  login: "benitoad",
  displayName: "Benitoad",
  avatarUrl: "https://avatar-b",
};

// Des doubles qui notent ce qu'on leur demande d'écrire. Convex connaît le compte et le streamer de `/benitoad`.
const doubles = (ensuredCanvasId: string, twitchUser: SignedInUser = user) => {
  const createdCanvases: string[] = [];
  const mirroredUsers: string[] = [];
  const signedUsers: string[] = [];
  const upserts: { user: SignedInUser; discoveredViaUserId: string | undefined }[] = [];
  const mirrored: object[] = [];
  const signed: object[] = [];
  const known = [user, owner];
  const deps: SignInDeps = {
    twitch: {
      authorizeUrl: () => "",
      getUserFromCode: async () => twitchUser,
      getChannelFromCode: async () => ({ user: twitchUser, moderators: [], bans: [] }),
    },
    durable: {
      upsertUserFromTwitch: async (upserted, discoveredViaUserId) => {
        upserts.push({ user: upserted, discoveredViaUserId });
      },
      getUserByLogin: async (login) => known.find((candidate) => candidate.login === login) ?? null,
      ensureCanvasForOwner: async () => ensuredCanvasId,
      getActiveCanvasForOwner: async () => null,
    },
    redis: {
      createCanvas: async (canvasId) => {
        createdCanvases.push(canvasId);
      },
      setUser: async (mirroredUser) => {
        mirroredUsers.push(mirroredUser.userId);
        mirrored.push(mirroredUser);
      },
    },
    signer: {
      sign: async (session) => {
        signedUsers.push(session.userId);
        signed.push(session);
        return "signed-session";
      },
    },
    randomCanvasId: () => "random-candidate",
  };
  return { deps, createdCanvases, mirroredUsers, signedUsers, upserts, mirrored, signed };
};

describe("completeSignIn (§10.1)", () => {
  // Crée dans Redis le canvas que rend Convex, jamais le candidat tiré au hasard
  it("creates in Redis the canvas Convex returns, never the random candidate", async () => {
    const { deps, createdCanvases } = doubles("existing-canvas");

    await completeSignIn(deps, "code", null);

    expect(createdCanvases).toEqual(["existing-canvas"]);
  });

  // Écrit le miroir user: et signe la session de l'utilisateur rendu par Twitch
  it("mirrors and signs the user Twitch returns", async () => {
    const { deps, mirroredUsers, signedUsers } = doubles("existing-canvas");

    const result = await completeSignIn(deps, "code", null);

    expect(mirroredUsers).toEqual([user.userId]);
    expect(signedUsers).toEqual([user.userId]);
    expect(result).toEqual({ signedSession: "signed-session", login: user.login });
  });

  // Garde l'e-mail pour Convex seulement : jamais dans le miroir Redis ni dans la session (écart §10.1, JOURNAL 2026-09-27)
  it("keeps the email for Convex only: never in the Redis mirror nor in the session", async () => {
    const { deps, upserts, mirrored, signed } = doubles("existing-canvas", {
      ...user,
      email: "fenysk@example.com",
    });

    await completeSignIn(deps, "code", null);

    expect(upserts[0]?.user.email).toBe("fenysk@example.com");
    expect(mirrored[0]).not.toHaveProperty("email");
    expect(signed[0]).not.toHaveProperty("email");
  });

  // Lie le compte au streamer dont la page a lancé la connexion, jamais à soi-même ni depuis l'accueil (JOURNAL 2026-09-27)
  it("links the account to the streamer whose page started the sign-in, never to itself nor from home", async () => {
    const fromOwnerPage = doubles("existing-canvas");
    const fromItself = doubles("existing-canvas");
    const fromHome = doubles("existing-canvas");

    await completeSignIn(fromOwnerPage.deps, "code", "/benitoad");
    await completeSignIn(fromItself.deps, "code", "/fenysk");
    await completeSignIn(fromHome.deps, "code", null);

    expect(fromOwnerPage.upserts[0]?.discoveredViaUserId).toBe(owner.userId);
    expect(fromItself.upserts[0]?.discoveredViaUserId).toBeUndefined();
    expect(fromHome.upserts[0]?.discoveredViaUserId).toBeUndefined();
  });

  // Ne lie à rien une page dont le streamer n'a pas de compte
  it("links to nothing from the page of a login without an account", async () => {
    const { deps, upserts } = doubles("existing-canvas");

    await completeSignIn(deps, "code", "/nobody");

    expect(upserts[0]?.discoveredViaUserId).toBeUndefined();
  });
});
