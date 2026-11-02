// Les comptes qu'une action venue de Twitch nomme (CDC §8, JOURNAL 2026-11-02) : de quoi refuser, pour un compte supprimé, l'action
// que Twitch livre après la purge de Redis.

import type { TwitchCommand } from "./ports";

export function listCommandAccounts(command: TwitchCommand): string[] {
  switch (command.kind) {
    case "moderators":
    case "bans":
      return command.userIds;
    case "ban":
    case "unban":
    case "moderator":
    case "twitchLive":
      return [command.userId];
  }
}

// L'action sans ces comptes. Une liste complète (`moderators`, `bans`) perd leurs identifiants, c'est toujours la liste du reste ;
// une action sur un seul compte n'a plus d'objet : `null`.
export function withoutCommandAccounts(
  command: TwitchCommand,
  userIds: ReadonlySet<string>,
): TwitchCommand | null {
  if (command.kind === "moderators" || command.kind === "bans")
    return { ...command, userIds: command.userIds.filter((userId) => !userIds.has(userId)) };
  return userIds.has(command.userId) ? null : command;
}
