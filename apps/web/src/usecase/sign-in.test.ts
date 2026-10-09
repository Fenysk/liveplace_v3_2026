import type { User } from "@liveplace/domain";
import type { SignedInUser, Signup } from "@liveplace/domain/ports";
import { describe, expect, it } from "vitest";
import { completeSignIn, type SignInDeps } from "./sign-in";

const now = 1_700_000_000_000;
const user: User = { userId: "1234", login: "fenysk", displayName: "Fenysk", avatarUrl: "https://avatar" };
const owner: User = {
  userId: "5678",
  login: "benitoad",
  displayName: "Benitoad",
  avatarUrl: "https://avatar-b",
};

// Des doubles qui notent ce qu'on leur demande d'écrire. Convex connaît le compte et le streamer de `/benitoad`.
const doubles = (ensuredCanvasId: string, twitchUser: SignedInUser = user, ownerCanvasId?: string) => {
  const activeCanvasReads: string[] = [];
  const createdCanvases: string[] = [];
  const mirroredUsers: string[] = [];
  const signedUsers: string[] = [];
  const upserts: { user: SignedInUser; discoveredViaUserId: string | undefined }[] = [];
  const mirrored: object[] = [];
  const signed: object[] = [];
  const signups: Signup[] = [];
  const tracked: string[] = [];
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
      getActiveCanvasForOwner: async (ownerId) => {
        activeCanvasReads.push(ownerId);
        return ownerCanvasId ? { canvasId: ownerCanvasId, width: 100, height: 100 } : null;
      },
    },
    redis: {
      createCanvas: async (canvasId) => {
        createdCanvases.push(canvasId);
      },
      setUser: async (mirroredUser) => {
        mirroredUsers.push(mirroredUser.userId);
        mirrored.push(mirroredUser);
      },
      storeSignup: async (signup) => {
        signups.push(signup);
      },
    },
    signer: {
      sign: async (session) => {
        signedUsers.push(session.userId);
        signed.push(session);
        return "signed-session";
      },
    },
    tracker: {
      track: (trackedUserId) => {
        tracked.push(trackedUserId);
      },
    },
    randomCanvasId: () => "random-candidate",
    now: () => now,
  };
  return {
    deps,
    tracked,
    activeCanvasReads,
    createdCanvases,
    mirroredUsers,
    signedUsers,
    upserts,
    mirrored,
    signed,
    signups,
  };
};

describe("completeSignIn (§10.1)", () => {
  // Crée dans Redis le canvas que rend Convex, jamais le candidat tiré au hasard
  it("creates in Redis the canvas Convex returns, never the random candidate", async () => {
    const { deps, createdCanvases } = doubles("existing-canvas");

    await completeSignIn(deps, "code", null);

    expect(createdCanvases).toEqual(["existing-canvas"]);
  });

  // Un canvas dont ce scope garde une sauvegarde ne naît jamais vide : Redis l'a perdu, le worker le remet (JOURNAL 2026-10-08)
  it("creates no canvas in Redis when Convex holds a save of it for this scope: it never is born empty", async () => {
    const asked: string[] = [];
    const { deps, createdCanvases, mirroredUsers, signedUsers } = doubles("existing-canvas");
    deps.recovery = {
      hasSnapshot: async (canvasId) => {
        asked.push(canvasId);
        return true;
      },
    };

    const result = await completeSignIn(deps, "code", null);

    expect(asked).toEqual(["existing-canvas"]);
    expect(createdCanvases).toEqual([]);
    expect(mirroredUsers).toEqual([user.userId]);
    expect(signedUsers).toEqual([user.userId]);
    expect(result).toEqual({ signedSession: "signed-session", login: user.login });
  });

  // Sans sauvegarde de ce canvas dans ce scope, la connexion le crée comme avant
  it("still creates the canvas when the scope holds no save of it", async () => {
    const { deps, createdCanvases } = doubles("existing-canvas");
    deps.recovery = { hasSnapshot: async () => false };

    await completeSignIn(deps, "code", null);

    expect(createdCanvases).toEqual(["existing-canvas"]);
  });

  // Convex qui ne dit pas s'il y a une sauvegarde : la connexion échoue, plutôt que de créer un canvas qui pourrait naître vide
  it("fails rather than creating a canvas that might be born empty when Convex cannot say", async () => {
    const { deps, createdCanvases, signedUsers } = doubles("existing-canvas");
    deps.recovery = {
      hasSnapshot: async () => {
        throw new Error("Convex a coupé");
      },
    };

    await expect(completeSignIn(deps, "code", null)).rejects.toThrow("Convex a coupé");

    expect(createdCanvases).toEqual([]);
    expect(signedUsers).toEqual([]);
  });

  // Écrit le miroir user: et signe la session de l'utilisateur rendu par Twitch
  it("mirrors and signs the user Twitch returns", async () => {
    const { deps, mirroredUsers, signedUsers } = doubles("existing-canvas");

    const result = await completeSignIn(deps, "code", null);

    expect(mirroredUsers).toEqual([user.userId]);
    expect(signedUsers).toEqual([user.userId]);
    expect(result).toEqual({ signedSession: "signed-session", login: user.login });
  });

  // À chaque connexion, le live Twitch du compte est suivi (écart §4 et §10.1, JOURNAL 2026-10-07)
  it("has the account's Twitch live tracked at each sign-in, new account or not", async () => {
    const first = doubles("random-candidate");
    const later = doubles("existing-canvas");

    await completeSignIn(first.deps, "code", null);
    await completeSignIn(later.deps, "code", "/benitoad");

    expect(first.tracked).toEqual([user.userId]);
    expect(later.tracked).toEqual([user.userId]);
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

  // Compte un nouveau compte quand Convex garde le canvas candidat, avec sa provenance, et pas à une connexion suivante
  // (écart §5.1, JOURNAL 2026-10-06)
  it("counts a signup when Convex keeps the candidate canvas, with its provenance, and not at a later sign-in", async () => {
    const first = doubles("random-candidate");
    const later = doubles("existing-canvas");

    await completeSignIn(first.deps, "code", "/benitoad");
    await completeSignIn(later.deps, "code", "/benitoad");

    expect(first.signups).toEqual([{ nowMs: now, discoveredViaUserId: owner.userId }]);
    expect(later.signups).toEqual([]);
  });

  // Compte sans provenance un nouveau compte venu de l'accueil
  it("counts a signup from home without a provenance", async () => {
    const { deps, signups } = doubles("random-candidate");

    await completeSignIn(deps, "code", null);

    expect(signups).toEqual([{ nowMs: now }]);
    expect(signups[0]).not.toHaveProperty("discoveredViaUserId");
  });

  // Compte le nouveau compte dans le canvas actif du streamer dont la page a lancé la connexion (JOURNAL 2026-10-07)
  it("counts a signup in the active canvas of the streamer whose page started the sign-in", async () => {
    const { deps, signups, activeCanvasReads } = doubles("random-candidate", user, "owner-canvas");

    await completeSignIn(deps, "code", "/benitoad");

    expect(activeCanvasReads).toEqual([owner.userId]);
    expect(signups).toEqual([
      { nowMs: now, discoveredViaUserId: owner.userId, discoveredViaCanvasId: "owner-canvas" },
    ]);
  });

  // Ne cherche aucun canvas pour un compte déjà connu, venu de l'accueil, ou d'un streamer sans canvas actif
  it("looks for no canvas for a known account, one from home, or a streamer without an active canvas", async () => {
    const known = doubles("existing-canvas", user, "owner-canvas");
    const fromHome = doubles("random-candidate", user, "owner-canvas");
    const withoutCanvas = doubles("random-candidate");

    await completeSignIn(known.deps, "code", "/benitoad");
    await completeSignIn(fromHome.deps, "code", null);
    await completeSignIn(withoutCanvas.deps, "code", "/benitoad");

    expect(known.activeCanvasReads).toEqual([]);
    expect(fromHome.activeCanvasReads).toEqual([]);
    expect(withoutCanvas.signups).toEqual([{ nowMs: now, discoveredViaUserId: owner.userId }]);
    expect(withoutCanvas.signups[0]).not.toHaveProperty("discoveredViaCanvasId");
  });
});
