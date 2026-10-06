import type { User } from "@liveplace/domain";
import type { TwitchChannel, TwitchCommand, TwitchSync, TwitchUser } from "@liveplace/domain/ports";
import { describe, expect, it } from "vitest";
import type { SignInDeps } from "./sign-in";
import { completeTwitchSync } from "./sync-twitch";

const now = 1_700_000_000_000;
const owner: User = {
  userId: "1234",
  login: "fenysk",
  displayName: "Fenysk",
  avatarUrl: "https://avatar",
};

const channel: TwitchChannel = {
  user: { ...owner, email: "fenysk@example.com" },
  moderators: [{ userId: "21", login: "mod1", displayName: "Mod1" }],
  bans: [
    { userId: "31", login: "troll", displayName: "Troll", isPermanent: true },
    { userId: "32", login: "timeout", displayName: "TimeOut", isPermanent: false },
  ],
};

// Des doubles qui notent ce qu'on leur demande d'écrire.
const doubles = () => {
  const names: TwitchUser[] = [];
  const commands: TwitchCommand[] = [];
  const syncs: { canvasId: string; sync: TwitchSync }[] = [];
  const subscribed: string[] = [];
  const signedUsers: string[] = [];
  const deps: SignInDeps = {
    twitch: {
      authorizeUrl: () => "",
      getUserFromCode: async () => channel.user,
      getChannelFromCode: async () => channel,
    },
    durable: {
      upsertUserFromTwitch: async () => undefined,
      getUserByLogin: async () => null,
      ensureCanvasForOwner: async () => "canvas-1",
      getActiveCanvasForOwner: async (ownerId) =>
        ownerId === owner.userId ? { canvasId: "canvas-1", width: 256, height: 256 } : null,
    },
    redis: {
      createCanvas: async () => undefined,
      setUser: async () => undefined,
      storeSignup: async () => undefined,
    },
    signer: {
      sign: async ({ userId }) => {
        signedUsers.push(userId);
        return "signed-session";
      },
    },
    randomCanvasId: () => "random-candidate",
    now: () => now,
  };
  const twitchWrites = {
    setTwitchUsers: async (_canvasId: string, users: readonly TwitchUser[]) => {
      names.push(...users);
    },
    queueTwitchCommands: async (queued: readonly TwitchCommand[]) => {
      commands.push(...queued);
    },
    setTwitchSync: async (canvasId: string, sync: TwitchSync) => {
      syncs.push({ canvasId, sync });
    },
  };
  const eventSub = {
    subscribeToModeration: async (broadcasterId: string) => {
      subscribed.push(broadcasterId);
    },
  };
  return {
    deps: { ...deps, twitchWrites, eventSub, now: () => now },
    names,
    commands,
    syncs,
    signedUsers,
    subscribed,
  };
};

describe("completeTwitchSync (JOURNAL 2026-09-27)", () => {
  // Connecte le streamer comme d'habitude, puis confie au gateway ses modérateurs et ses seuls bans définitifs
  it("signs the streamer in as usual, then hands the gateway its moderators and its permanent bans only", async () => {
    const { deps, commands, signedUsers } = doubles();

    const result = await completeTwitchSync(deps, "code", "/fenysk");

    expect(result).toEqual({ signedSession: "signed-session", login: "fenysk" });
    expect(signedUsers).toEqual([owner.userId]);
    expect(commands).toEqual([
      { kind: "moderators", canvasId: "canvas-1", userIds: ["21"] },
      { kind: "bans", canvasId: "canvas-1", userIds: ["31"] },
    ]);
  });

  // Abonne la chaîne du streamer à ses bans et à ses modérateurs, pour rester à jour sans garder de jeton (A2)
  it("subscribes the streamer's channel to its bans and moderators, to stay up to date without a token", async () => {
    const { deps, subscribed } = doubles();

    await completeTwitchSync(deps, "code", null);

    expect(subscribed).toEqual([owner.userId]);
  });

  // Garde le nom Twitch des modérateurs et des bannis, sans leur e-mail ni rien d'autre, et note la synchro
  it("keeps the Twitch names of the moderators and the banned, nothing else, and records the sync", async () => {
    const { deps, names, syncs } = doubles();

    await completeTwitchSync(deps, "code", null);

    expect(names).toEqual([
      { userId: "21", login: "mod1", displayName: "Mod1" },
      { userId: "31", login: "troll", displayName: "Troll" },
    ]);
    expect(syncs).toEqual([{ canvasId: "canvas-1", sync: { status: "ok", syncedAt: now } }]);
  });
});
