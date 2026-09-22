import type { User } from "@liveplace/domain";
import { describe, expect, it } from "vitest";
import { completeSignIn, type SignInDeps } from "./sign-in";

const user: User = { userId: "1234", login: "fenysk", displayName: "Fenysk", avatarUrl: "https://avatar" };

// Des doubles qui notent ce qu'on leur demande d'écrire.
const doubles = (ensuredCanvasId: string) => {
  const createdCanvases: string[] = [];
  const mirroredUsers: string[] = [];
  const signedUsers: string[] = [];
  const deps: SignInDeps = {
    twitch: { authorizeUrl: () => "", getUserFromCode: async () => user },
    durable: {
      upsertUserFromTwitch: async () => undefined,
      getUserByLogin: async () => null,
      ensureCanvasForOwner: async () => ensuredCanvasId,
      getActiveCanvasForOwner: async () => null,
    },
    redis: {
      createCanvas: async (canvasId) => {
        createdCanvases.push(canvasId);
      },
      setUser: async ({ userId }) => {
        mirroredUsers.push(userId);
      },
    },
    signer: {
      sign: async ({ userId }) => {
        signedUsers.push(userId);
        return "signed-session";
      },
    },
    randomCanvasId: () => "random-candidate",
  };
  return { deps, createdCanvases, mirroredUsers, signedUsers };
};

describe("completeSignIn (§10.1)", () => {
  // Crée dans Redis le canvas que rend Convex, jamais le candidat tiré au hasard
  it("creates in Redis the canvas Convex returns, never the random candidate", async () => {
    const { deps, createdCanvases } = doubles("existing-canvas");

    await completeSignIn(deps, "code");

    expect(createdCanvases).toEqual(["existing-canvas"]);
  });

  // Écrit le miroir user: et signe la session de l'utilisateur rendu par Twitch
  it("mirrors and signs the user Twitch returns", async () => {
    const { deps, mirroredUsers, signedUsers } = doubles("existing-canvas");

    const result = await completeSignIn(deps, "code");

    expect(mirroredUsers).toEqual([user.userId]);
    expect(signedUsers).toEqual([user.userId]);
    expect(result).toEqual({ signedSession: "signed-session", login: user.login });
  });
});
