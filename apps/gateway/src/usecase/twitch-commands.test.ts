import { type CanvasMeta, defaultCanvasMeta } from "@liveplace/domain";
import type {
  BannedUser,
  Moderation,
  ModerationSlice,
  Moderator,
  ModeratorRole,
  TwitchCommand,
  TwitchCommandQueue,
} from "@liveplace/domain/ports";
import { describe, expect, it, vi } from "vitest";
import { applyTwitchCommand, consumeTwitchCommands } from "./twitch-commands";

const now = 1_700_000_000_000;
const canvasId = "canvas-1";

const meta: CanvasMeta = {
  ...defaultCanvasMeta("owner-1"),
  width: 4,
  height: 4,
  gaugeMaxStart: 3,
  refillMs: 1000,
  obsDelayMs: 5000,
};

// Ce que le canvas a déjà : `twitch` vient de Twitch, `here` de LivePlace.
const moderatorOf = (userId: string, isFromTwitch: boolean): Moderator => ({
  userId,
  login: userId,
  displayName: userId,
  isFromTwitch,
  isNamedHere: !isFromTwitch,
  hasAccount: true,
});
const bannedOf = (userId: string, isFromTwitch: boolean): BannedUser => ({
  userId,
  login: userId,
  displayName: userId,
  pixelCount: 0,
  isFromTwitch,
  hasAccount: true,
});

type Current = { moderators?: Moderator[]; bans?: BannedUser[] };

// Un noyau qui note ce qu'on lui demande. `slices` : ce que rend chaque appel à `moderate`, dans l'ordre.
const setup = (slices: ModerationSlice[] = [], current: Current = {}) => {
  const moderations: Moderation[] = [];
  const roles: ModeratorRole[] = [];
  const core = {
    async listModerators() {
      return current.moderators ?? [];
    },
    async listBans() {
      return current.bans ?? [];
    },
    async getCanvas(asked: string) {
      return asked === canvasId ? meta : null;
    },
    async moderate(_asked: string, moderation: Moderation) {
      moderations.push(moderation);
      return {
        ok: true as const,
        value: slices[moderations.length - 1] ?? { version: 1, cells: 0, isDone: true },
      };
    },
    async setModerator(_asked: string, role: ModeratorRole) {
      roles.push(role);
      return { ok: true as const, value: undefined };
    },
  };
  return { deps: { core, now: () => now }, moderations, roles };
};

describe("applyTwitchCommand (JOURNAL 2026-09-27)", () => {
  // Un ban Twitch bannit au nom du streamer, puis retire ses pixels jusqu'à la dernière tranche
  it("bans on the owner's behalf, then clears the pixels down to the last slice", async () => {
    const { deps, moderations } = setup([
      { version: 1, cells: 0, isDone: true },
      { version: 2, cells: 4096, isDone: false },
      { version: 3, cells: 5, isDone: true },
    ]);

    await applyTwitchCommand(deps, { kind: "ban", canvasId, userId: "troll" });

    const base = { by: meta.ownerId, nowMs: now, source: "twitch" };
    expect(moderations).toEqual([
      { ...base, action: { action: "ban", target: "troll" }, slice: "first" },
      { ...base, action: { action: "clearUser", target: "troll" }, slice: "first" },
      { ...base, action: { action: "clearUser", target: "troll" }, slice: "next" },
    ]);
  });

  // Un déban Twitch ne fait qu'un unban Twitch : c'est le noyau qui le refuse s'il ne vient pas de Twitch
  it("only unbans with the Twitch origin: the core refuses it if the ban did not come from Twitch", async () => {
    const { deps, moderations } = setup();

    await applyTwitchCommand(deps, { kind: "unban", canvasId, userId: "troll" });

    expect(moderations).toEqual([
      {
        by: meta.ownerId,
        nowMs: now,
        source: "twitch",
        action: { action: "unban", target: "troll" },
        slice: "first",
      },
    ]);
  });

  // Nomme ou retire un modérateur avec l'origine Twitch, et ne fait rien sur un canvas absent
  it("names or removes a moderator with the Twitch origin, and does nothing on a missing canvas", async () => {
    const { deps, roles, moderations } = setup();

    await applyTwitchCommand(deps, { kind: "moderator", canvasId, userId: "mod-1", isModerator: true });
    await applyTwitchCommand(deps, { kind: "ban", canvasId: "gone", userId: "troll" });

    expect(roles).toEqual([{ userId: "mod-1", source: "twitch", isModerator: true }]);
    expect(moderations).toEqual([]);
  });
});

describe("a full Twitch list (JOURNAL 2026-09-27)", () => {
  // Nomme les modérateurs Twitch qui manquent, retire ceux qui n'y sont plus, et ne touche jamais à ceux nommés ici
  it("names the missing Twitch moderators, removes those gone, and never touches those named here", async () => {
    const { deps, roles } = setup([], {
      moderators: [moderatorOf("kept", true), moderatorOf("gone", true), moderatorOf("named-here", false)],
    });

    await applyTwitchCommand(deps, { kind: "moderators", canvasId, userIds: ["kept", "added"] });

    expect(roles).toEqual([
      { userId: "added", source: "twitch", isModerator: true },
      { userId: "gone", source: "twitch", isModerator: false },
    ]);
  });

  // Bannit les bannis Twitch qui manquent, débannit ceux que Twitch a levés, et laisse les bans posés ici
  it("bans the missing Twitch bans, lifts those Twitch lifted, and leaves the bans set here", async () => {
    const { deps, moderations } = setup([], {
      bans: [bannedOf("kept", true), bannedOf("lifted", true), bannedOf("banned-here", false)],
    });

    await applyTwitchCommand(deps, { kind: "bans", canvasId, userIds: ["kept", "added"] });

    expect(moderations.map(({ action, slice }) => `${action.action}:${action.target}:${slice}`)).toEqual([
      "ban:added:first",
      "clearUser:added:first",
      "unban:lifted:first",
    ]);
  });
});

describe("consumeTwitchCommands (JOURNAL 2026-09-27)", () => {
  // Applique chaque action dans l'ordre et l'acquitte, même quand elle échoue, sans arrêter la file
  it("applies each command in order and acknowledges it, even when it fails, without stopping the queue", async () => {
    const { deps, roles } = setup();
    const failing = {
      ...deps,
      core: { ...deps.core, getCanvas: vi.fn().mockRejectedValueOnce(new Error("coupure")) },
    };
    failing.core.getCanvas.mockImplementation(deps.core.getCanvas);
    const commands: TwitchCommand[] = [
      { kind: "moderator", canvasId, userId: "mod-1", isModerator: true },
      { kind: "moderator", canvasId, userId: "mod-2", isModerator: true },
    ];
    const acknowledged: string[] = [];
    let isRunning = true;
    const queue: TwitchCommandQueue = {
      async listTwitchCommands() {
        isRunning = false;
        return commands.map((command, index) => ({ id: `id-${index}`, command }));
      },
      async ackTwitchCommand(id) {
        acknowledged.push(id);
      },
    };
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await consumeTwitchCommands(failing, queue, () => isRunning);

    expect(acknowledged).toEqual(["id-0", "id-1"]);
    expect(roles).toEqual([{ userId: "mod-2", source: "twitch", isModerator: true }]);
    expect(logged).toHaveBeenCalledTimes(1);
    logged.mockRestore();
  });
});
