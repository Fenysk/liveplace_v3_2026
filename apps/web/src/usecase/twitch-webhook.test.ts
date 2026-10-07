import type {
  TwitchCommand,
  TwitchLiveEvent,
  TwitchSync,
  TwitchUser,
  TwitchWebhookEvent,
  TwitchWebhookMessage,
} from "@liveplace/domain/ports";
import { describe, expect, it } from "vitest";
import { receiveTwitchWebhook } from "./twitch-webhook";

const now = 1_700_000_000_000;
const troll: TwitchUser = { userId: "31", login: "troll", displayName: "Troll" };
const message: TwitchWebhookMessage = {
  id: "m-1",
  timestamp: "t",
  signature: "s",
  type: "notification",
  body: "{}",
};

// Des doubles : l'adaptateur rend l'événement donné, les écritures sont notées.
const setup = (event: TwitchWebhookEvent | null) => {
  const names: TwitchUser[] = [];
  const commands: TwitchCommand[] = [];
  const syncs: TwitchSync[] = [];
  const lookedUp: string[] = []; // les propriétaires dont le canvas a été demandé à Convex
  const applied: TwitchLiveEvent[] = [];
  const deps = {
    webhook: { read: () => event },
    now: () => now,
    durable: {
      getActiveCanvasForOwner: async (ownerId: string) => {
        lookedUp.push(ownerId);
        return ownerId === "1234" ? { canvasId: "canvas-1", width: 256, height: 256 } : null;
      },
    },
    tracker: {
      apply: async (live: TwitchLiveEvent) => {
        applied.push(live);
      },
    },
    twitchWrites: {
      setTwitchUsers: async (_canvasId: string, users: readonly TwitchUser[]) => {
        names.push(...users);
      },
      queueTwitchCommands: async (queued: readonly TwitchCommand[]) => {
        commands.push(...queued);
      },
      setTwitchSync: async (_canvasId: string, sync: TwitchSync) => {
        syncs.push(sync);
      },
    },
  };
  return { deps, names, commands, syncs, lookedUp, applied };
};

describe("receiveTwitchWebhook (JOURNAL 2026-09-27)", () => {
  // Refuse un message que l'adaptateur n'a pas pu authentifier, sans rien écrire
  it("refuses a message the adapter could not authenticate, and writes nothing", async () => {
    const { deps, commands, names } = setup(null);

    expect(await receiveTwitchWebhook(deps, message)).toEqual({ status: 403 });
    expect(commands).toEqual([]);
    expect(names).toEqual([]);
  });

  // Rend le challenge d'une vérification, tel quel
  it("answers a verification with its challenge, as is", async () => {
    const { deps } = setup({ kind: "verification", challenge: "abc" });

    expect(await receiveTwitchWebhook(deps, message)).toEqual({ status: 200, challenge: "abc" });
  });

  // Dépose un ban définitif pour le gateway, avec le nom du banni, et ignore un timeout
  it("queues a permanent ban for the gateway, with the banned name, and ignores a timeout", async () => {
    const banned = setup({ kind: "ban", broadcasterId: "1234", user: troll, isPermanent: true });
    const timedOut = setup({ kind: "ban", broadcasterId: "1234", user: troll, isPermanent: false });

    expect(await receiveTwitchWebhook(banned.deps, message)).toEqual({ status: 204 });
    await receiveTwitchWebhook(timedOut.deps, message);

    expect(banned.commands).toEqual([{ kind: "ban", canvasId: "canvas-1", userId: "31" }]);
    expect(banned.names).toEqual([troll]);
    expect(timedOut.commands).toEqual([]);
  });

  // Dépose un déban et un modérateur retiré, et note une révocation comme une synchro à refaire
  it("queues an unban and a removed moderator, and records a revocation as a sync to redo", async () => {
    const unbanned = setup({ kind: "unban", broadcasterId: "1234", user: troll });
    const removed = setup({ kind: "moderator", broadcasterId: "1234", user: troll, isModerator: false });
    const revoked = setup({ kind: "revocation", broadcasterId: "1234" });

    await receiveTwitchWebhook(unbanned.deps, message);
    await receiveTwitchWebhook(removed.deps, message);
    await receiveTwitchWebhook(revoked.deps, message);

    expect(unbanned.commands).toEqual([{ kind: "unban", canvasId: "canvas-1", userId: "31" }]);
    expect(removed.commands).toEqual([
      { kind: "moderator", canvasId: "canvas-1", userId: "31", isModerator: false },
    ]);
    expect(revoked.syncs).toEqual([{ status: "revoked", syncedAt: now }]);
  });

  // Ne fait rien pour une chaîne qui n'a pas de canvas ici, ni pour un type qu'on ne suit pas
  it("does nothing for a channel without a canvas here, nor for a type we do not follow", async () => {
    const unknown = setup({ kind: "ban", broadcasterId: "9999", user: troll, isPermanent: true });
    const ignored = setup({ kind: "ignored" });

    expect(await receiveTwitchWebhook(unknown.deps, message)).toEqual({ status: 204 });
    expect(await receiveTwitchWebhook(ignored.deps, message)).toEqual({ status: 204 });
    expect(unknown.commands).toEqual([]);
  });

  // Confie les événements de live au suivi du live, sans toucher à Convex, à la modération ni à sa synchro
  it("hands the live events to the live tracking, touching neither Convex, the moderation nor its sync", async () => {
    const events: TwitchLiveEvent[] = [
      { kind: "online", broadcasterId: "1234" },
      { kind: "offline", broadcasterId: "1234" },
      { kind: "category", broadcasterId: "1234", category: "Art" },
      { kind: "liveRevoked", broadcasterId: "1234" },
    ];

    for (const event of events) {
      const { deps, applied, lookedUp, commands, names, syncs } = setup(event);

      expect(await receiveTwitchWebhook(deps, message)).toEqual({ status: 204 });

      expect(applied).toEqual([event]);
      expect(lookedUp).toEqual([]);
      expect(commands).toEqual([]);
      expect(names).toEqual([]);
      expect(syncs).toEqual([]);
    }
  });

  // Ne confie au suivi du live ni une modération, ni une révocation de la synchro
  it("hands the live tracking neither a moderation event nor a revocation of the sync", async () => {
    const ban = setup({ kind: "ban", broadcasterId: "1234", user: troll, isPermanent: true });
    const revoked = setup({ kind: "revocation", broadcasterId: "1234" });

    await receiveTwitchWebhook(ban.deps, message);
    await receiveTwitchWebhook(revoked.deps, message);

    expect(ban.applied).toEqual([]);
    expect(revoked.applied).toEqual([]);
    expect(revoked.syncs).toEqual([{ status: "revoked", syncedAt: now }]);
  });
});
