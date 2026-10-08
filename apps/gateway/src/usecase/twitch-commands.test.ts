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
import type { ControlMessage } from "./broadcast";
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

// `unbannable` : ceux que le script refuse de bannir (les modérateurs nommés ici, Écart §5.4, JOURNAL 2026-10-08).
type Current = { moderators?: Moderator[]; bans?: BannedUser[]; unbannable?: string[] };

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
      const { action } = moderation;
      if (action.action === "ban" && current.unbannable?.includes(action.target))
        return { ok: false as const, error: "forbidden" as const };
      return {
        ok: true as const,
        value: slices[moderations.length - 1] ?? { version: 1, cells: 0, isDone: true },
      };
    },
    async setModerator(_asked: string, role: ModeratorRole) {
      roles.push(role);
      return { ok: true as const, value: undefined };
    },
    async copyTwitchUsers() {
      return undefined;
    },
  };
  const announced: ControlMessage[] = [];
  const broadcast = {
    announce: (control: ControlMessage) => {
      announced.push(control);
    },
  };
  return {
    deps: { core, broadcast, now: () => now, wait: async () => undefined },
    moderations,
    roles,
    announced,
  };
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

  // Un ban Twitch que le noyau refuse (un modérateur nommé ici) est ignoré : aucun retrait ne le suit (Écart §5.4, JOURNAL 2026-10-08)
  it("ignores a Twitch ban that the core refuses, a moderator named here: no clear follows", async () => {
    const { deps, moderations } = setup([], { unbannable: ["mod-here"] });

    const outcome = await applyTwitchCommand(deps, { kind: "ban", canvasId, userId: "mod-here" });

    expect(outcome).toBe("done");
    expect(moderations.map(({ action }) => action.action)).toEqual(["ban"]);
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

  // Dans la liste, un ban refusé (un modérateur nommé ici) ne retient pas les suivants et ne retire rien ; la synchro suivante le retentera
  it("keeps going past a ban the core refuses in the list, and clears nothing of the refused one", async () => {
    const { deps, moderations } = setup([], { unbannable: ["mod-here"] });

    await applyTwitchCommand(deps, { kind: "bans", canvasId, userIds: ["mod-here", "troll"] });

    expect(moderations.map(({ action, slice }) => `${action.action}:${action.target}:${slice}`)).toEqual([
      "ban:mod-here:first",
      "ban:troll:first",
      "clearUser:troll:first",
    ]);
  });
});

describe("a Twitch live told to the pages (Écart §4, JOURNAL 2026-10-07)", () => {
  // Annonce le live d'un compte à toutes les pages jointes, avec sa catégorie, sans toucher à aucun canvas
  it("announces the live of an account to the joined pages, with its category, touching no canvas", async () => {
    const { deps, announced, moderations } = setup();

    const outcome = await applyTwitchCommand(deps, {
      kind: "twitchLive",
      userId: "owner-1",
      twitchLive: { category: "Art" },
    });

    expect(outcome).toBe("done");
    expect(announced).toEqual([{ t: "twitchLive", userId: "owner-1", twitchLive: { category: "Art" } }]);
    expect(moderations).toEqual([]);
  });

  // La fin d'un live s'annonce sans live, sans clé vide
  it("announces the end of a live without a live, not with an empty key", async () => {
    const { deps, announced } = setup();

    await applyTwitchCommand(deps, { kind: "twitchLive", userId: "owner-1" });

    expect(announced).toEqual([{ t: "twitchLive", userId: "owner-1" }]);
    expect(announced[0]).not.toHaveProperty("twitchLive");
  });

  // Acquitte un live comme les autres actions de la file, sans qu'un canvas prêt soit nécessaire
  it("acknowledges a live like the other commands of the queue, with no ready canvas needed", async () => {
    const { deps, announced } = setup();
    const acknowledged: string[] = [];
    let isRunning = true;
    const queue: TwitchCommandQueue = {
      async listTwitchCommands() {
        isRunning = false;
        return [{ id: "id-0", command: { kind: "twitchLive", userId: "unknown-owner" } }];
      },
      async ackTwitchCommand(id) {
        acknowledged.push(id);
      },
    };

    await consumeTwitchCommands(deps, queue, () => isRunning);

    expect(acknowledged).toEqual(["id-0"]);
    expect(announced).toHaveLength(1);
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

  // Acquitte un ban que le noyau refuse sans le retenter ni le journaliser comme une panne (Écart §5.4, JOURNAL 2026-10-08)
  it("acknowledges a ban the core refuses, without retrying it nor logging it as a failure", async () => {
    const { deps, moderations } = setup([], { unbannable: ["mod-here"] });
    const acknowledged: string[] = [];
    let isRunning = true;
    const queue: TwitchCommandQueue = {
      async listTwitchCommands() {
        isRunning = false;
        return [
          { id: "id-0", command: { kind: "ban", canvasId, userId: "mod-here" } },
          { id: "id-1", command: { kind: "ban", canvasId, userId: "troll" } },
        ];
      },
      async ackTwitchCommand(id) {
        acknowledged.push(id);
      },
    };
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await consumeTwitchCommands(deps, queue, () => isRunning);

    expect(acknowledged).toEqual(["id-0", "id-1"]);
    expect(moderations.map(({ action }) => `${action.action}:${action.target}`)).toEqual([
      "ban:mod-here",
      "ban:troll",
      "clearUser:troll",
    ]);
    expect(logged).not.toHaveBeenCalled();
    logged.mockRestore();
  });
});

// Écart §15 (JOURNAL 2026-10-06) : une action visait le canvas actif d'hier ; elle suit `successorId` jusqu'à celui d'aujourd'hui.
describe("following the successor of an archived canvas (Écart §15, JOURNAL 2026-10-06)", () => {
  const ready = (canvasId: string): CanvasMeta => ({ ...meta, ownerId: `owner-of-${canvasId}` });
  const archived = (successorId?: string): CanvasMeta => ({
    ...meta,
    archivedAt: now - 1000,
    ...(successorId ? { successorId } : {}),
  });

  // Un noyau dont chaque canvas répond ce qu'on lui a écrit, dans l'ordre ; la dernière réponse reste.
  const chain = (answers: Record<string, (CanvasMeta | null)[]>, refusals: { archivedOn?: string } = {}) => {
    const moderations: { canvasId: string; moderation: Moderation }[] = [];
    const roles: { canvasId: string; role: ModeratorRole }[] = [];
    const copies: { from: string; to: string; userIds: readonly string[] }[] = [];
    const waits: number[] = [];
    const core = {
      async getCanvas(asked: string) {
        const next = answers[asked];
        return next && next.length > 1 ? (next.shift() ?? null) : (next?.[0] ?? null);
      },
      async listModerators() {
        return [];
      },
      async listBans() {
        return [];
      },
      async moderate(asked: string, moderation: Moderation) {
        moderations.push({ canvasId: asked, moderation });
        if (asked === refusals.archivedOn) return { ok: false as const, error: "canvas_archived" as const };
        return { ok: true as const, value: { version: 1, cells: 0, isDone: true } };
      },
      async setModerator(asked: string, role: ModeratorRole) {
        roles.push({ canvasId: asked, role });
        if (asked === refusals.archivedOn) return { ok: false as const, error: "canvas_archived" as const };
        return { ok: true as const, value: undefined };
      },
      async copyTwitchUsers(from: string, to: string, userIds: readonly string[]) {
        copies.push({ from, to, userIds });
      },
    };
    const deps = {
      core,
      broadcast: { announce: () => undefined },
      now: () => now,
      wait: async (ms: number) => {
        waits.push(ms);
      },
    };
    return { deps, moderations, roles, copies, waits };
  };

  const ban: TwitchCommand = { kind: "ban", canvasId: "canvas-a", userId: "troll" };

  // Applique l'action sur le successeur d'une archive, et lui recopie le nom Twitch de la personne
  it("applies the action on the successor of an archive, and copies the person's Twitch name to it", async () => {
    const { deps, moderations, copies, waits } = chain({
      "canvas-a": [archived("canvas-b")],
      "canvas-b": [ready("canvas-b")],
    });

    const outcome = await applyTwitchCommand(deps, ban);

    expect(outcome).toBe("done");
    expect(moderations.map(({ canvasId }) => canvasId)).toEqual(["canvas-b", "canvas-b"]);
    expect(moderations[0]?.moderation).toMatchObject({ by: "owner-of-canvas-b", action: { action: "ban" } });
    expect(copies).toEqual([{ from: "canvas-a", to: "canvas-b", userIds: ["troll"] }]);
    expect(waits).toEqual([]);
  });

  // Suit les successeurs de proche en proche, jusqu'au canvas prêt et non archivé
  it("follows the successors one after another, down to the ready canvas that is not archived", async () => {
    const { deps, moderations, copies } = chain({
      "canvas-a": [archived("canvas-b")],
      "canvas-b": [archived("canvas-c")],
      "canvas-c": [ready("canvas-c")],
    });

    await applyTwitchCommand(deps, ban);

    expect(new Set(moderations.map(({ canvasId }) => canvasId))).toEqual(new Set(["canvas-c"]));
    expect(copies).toEqual([{ from: "canvas-a", to: "canvas-c", userIds: ["troll"] }]);
  });

  // Attend un successeur pas encore posé ou pas prêt, par petites pauses, puis l'applique
  it("waits, in short pauses, for a successor not yet set or not ready, then applies the action", async () => {
    const { deps, moderations, waits } = chain({
      "canvas-a": [archived("canvas-b")],
      "canvas-b": [null, null, ready("canvas-b")],
    });

    expect(await applyTwitchCommand(deps, ban)).toBe("done");

    expect(waits).toEqual([250, 250]);
    expect(moderations[0]?.canvasId).toBe("canvas-b");
  });

  // Une archive qu'on rouvre n'a pas encore de successeur : l'action attend qu'elle soit de nouveau le canvas actif
  it("waits while an archive being reopened has no successor, until it is the active canvas again", async () => {
    const { deps, moderations, waits, copies } = chain({
      "canvas-a": [archived(), archived(), ready("canvas-a")],
    });

    expect(await applyTwitchCommand(deps, ban)).toBe("done");

    expect(waits).toEqual([250, 250]);
    expect(moderations[0]?.canvasId).toBe("canvas-a");
    expect(copies).toEqual([]);
  });

  // Ne laisse pas l'action se perdre : au bout de quelques secondes, elle est dite perdue, sans rien appliquer
  it("never lets the action get lost silently: after a few seconds it is said lost, with nothing applied", async () => {
    const { deps, moderations, waits } = chain({
      "canvas-a": [archived("canvas-b")],
      "canvas-b": [null],
    });

    expect(await applyTwitchCommand(deps, ban)).toBe("lost");

    expect(moderations).toEqual([]);
    expect(waits.length * 250).toBeLessThanOrEqual(5000);
    expect(waits.length).toBeGreaterThan(10);
  });

  // Une boucle de successeurs ne tourne pas sans fin
  it("does not spin forever on a loop of successors", async () => {
    const { deps, moderations } = chain({
      "canvas-a": [archived("canvas-b")],
      "canvas-b": [archived("canvas-a")],
    });

    expect(await applyTwitchCommand(deps, ban)).toBe("lost");

    expect(moderations).toEqual([]);
  });

  // Un script qui refuse parce que le canvas vient d'être archivé : l'action repart sur le successeur
  it("restarts on the successor when a script refuses because the canvas was just archived", async () => {
    const { deps, moderations, roles, copies } = chain(
      {
        "canvas-a": [ready("canvas-a"), archived("canvas-b")],
        "canvas-b": [ready("canvas-b")],
      },
      { archivedOn: "canvas-a" },
    );

    const outcome = await applyTwitchCommand(deps, {
      kind: "moderator",
      canvasId: "canvas-a",
      userId: "mod-1",
      isModerator: true,
    });
    await applyTwitchCommand(deps, ban);

    expect(outcome).toBe("done");
    expect(roles).toEqual([
      { canvasId: "canvas-a", role: { userId: "mod-1", source: "twitch", isModerator: true } },
      { canvasId: "canvas-b", role: { userId: "mod-1", source: "twitch", isModerator: true } },
    ]);
    expect(moderations.every(({ canvasId }) => canvasId === "canvas-b")).toBe(true);
    expect(copies[0]).toEqual({ from: "canvas-a", to: "canvas-b", userIds: ["mod-1"] });
  });

  // Une liste complète suit aussi, avec les noms de toutes ses personnes
  it("follows a full list too, with the names of all its people", async () => {
    const { deps, copies } = chain({
      "canvas-a": [archived("canvas-b")],
      "canvas-b": [ready("canvas-b")],
    });

    await applyTwitchCommand(deps, { kind: "bans", canvasId: "canvas-a", userIds: ["one", "two"] });

    expect(copies).toEqual([{ from: "canvas-a", to: "canvas-b", userIds: ["one", "two"] }]);
  });

  // Un canvas supprimé n'attend rien : l'action est abandonnée sans pause, comme avant
  it("waits for nothing on a deleted canvas: the action is dropped without a pause, as before", async () => {
    const { deps, moderations, waits } = chain({});

    expect(await applyTwitchCommand(deps, ban)).toBe("done");

    expect(moderations).toEqual([]);
    expect(waits).toEqual([]);
  });

  // Ne recopie aucun nom quand le canvas visé est toujours le bon
  it("copies no name when the targeted canvas is still the right one", async () => {
    const { deps, copies } = chain({ "canvas-a": [ready("canvas-a")] });

    await applyTwitchCommand(deps, ban);

    expect(copies).toEqual([]);
  });

  // N'acquitte jamais une action perdue, et continue la file
  it("never acknowledges a lost action, and carries on with the queue", async () => {
    const { deps } = chain({
      "canvas-a": [archived("canvas-b")],
      "canvas-b": [null],
      "canvas-c": [ready("canvas-c")],
    });
    const commands: TwitchCommand[] = [ban, { kind: "ban", canvasId: "canvas-c", userId: "other" }];
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

    await consumeTwitchCommands(deps, queue, () => isRunning);

    expect(acknowledged).toEqual(["id-1"]);
    expect(logged).toHaveBeenCalledTimes(1);
    logged.mockRestore();
  });
});
