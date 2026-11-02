import { describe, expect, it } from "vitest";
import type { TwitchCommand } from "./ports";
import { listCommandAccounts, withoutCommandAccounts } from "./twitch-command";

describe("the accounts a Twitch action names (CDC §8, JOURNAL 2026-11-02)", () => {
  // Chaque genre d'action dit ses comptes : un seul, ou la liste complète
  it("lists the account of a single action and the accounts of a complete list", () => {
    const commands: [TwitchCommand, string[]][] = [
      [{ kind: "ban", canvasId: "c1", userId: "u1" }, ["u1"]],
      [{ kind: "unban", canvasId: "c1", userId: "u2" }, ["u2"]],
      [{ kind: "moderator", canvasId: "c1", userId: "u3", isModerator: true }, ["u3"]],
      [{ kind: "twitchLive", userId: "u4" }, ["u4"]],
      [{ kind: "moderators", canvasId: "c1", userIds: ["u5", "u6"] }, ["u5", "u6"]],
      [{ kind: "bans", canvasId: "c1", userIds: [] }, []],
    ];

    for (const [command, accounts] of commands) expect(listCommandAccounts(command)).toEqual(accounts);
  });

  // Une action sur un seul compte supprimé n'a plus d'objet ; sur un autre compte, elle reste la même
  it("drops a single action on a deleted account and keeps one on another account", () => {
    const ban: TwitchCommand = { kind: "ban", canvasId: "c1", userId: "u1" };

    expect(withoutCommandAccounts(ban, new Set(["u1"]))).toBeNull();
    expect(withoutCommandAccounts(ban, new Set(["u2"]))).toBe(ban);
  });

  // Une liste complète perd le compte supprimé et garde les autres, même si elle se vide : une liste vide dit que personne ne reste
  it("takes the deleted account out of a complete list and keeps the list, even when it empties", () => {
    const moderators: TwitchCommand = { kind: "moderators", canvasId: "c1", userIds: ["u1", "u2", "u3"] };

    expect(withoutCommandAccounts(moderators, new Set(["u2"]))).toEqual({
      kind: "moderators",
      canvasId: "c1",
      userIds: ["u1", "u3"],
    });
    expect(
      withoutCommandAccounts({ kind: "bans", canvasId: "c1", userIds: ["u1"] }, new Set(["u1"])),
    ).toEqual({
      kind: "bans",
      canvasId: "c1",
      userIds: [],
    });
  });
});
