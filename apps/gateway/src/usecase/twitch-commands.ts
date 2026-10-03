// §2 : les actions venues de Twitch. Le web les dépose, le gateway les applique avec ses
// scripts, au nom du streamer et avec l'origine Twitch.

import type { Timestamp } from "@liveplace/domain";
import type { CanvasCore, Moderation, TwitchCommand, TwitchCommandQueue } from "@liveplace/domain/ports";

// Une attente bornée : à l'arrêt, la boucle ne retient pas le process plus longtemps.
const WAIT_MS = 5000;

export type TwitchCommandsDeps = {
  core: Pick<CanvasCore, "getCanvas" | "moderate" | "setModerator" | "listModerators" | "listBans">;
  now: () => Timestamp;
};

// Bannir, c'est `ban` puis `clearUser` jusqu'à la dernière tranche, comme depuis la pill Inspection (§5.4).
const clearAll = async (
  deps: TwitchCommandsDeps,
  canvasId: string,
  moderation: Omit<Moderation, "slice">,
) => {
  let result = await deps.core.moderate(canvasId, { ...moderation, slice: "first" });
  while (result.ok && !result.value.isDone)
    result = await deps.core.moderate(canvasId, { ...moderation, slice: "next" });
};

type OwnedCommand<Kind extends TwitchCommand["kind"]> = Extract<TwitchCommand, { kind: Kind }> & {
  ownerId: string;
};

// Un ban ou un déban venu de Twitch, au nom du streamer. Un ban retire ensuite ses pixels.
const applyBan = async (deps: TwitchCommandsDeps, command: OwnedCommand<"ban" | "unban">) => {
  const { canvasId, userId, ownerId } = command;
  const origin = { by: ownerId, nowMs: deps.now(), source: "twitch" } as const;
  const moderated = await deps.core.moderate(canvasId, {
    ...origin,
    action: { action: command.kind, target: userId },
    slice: "first",
  });
  if (command.kind === "ban" && moderated.ok)
    await clearAll(deps, canvasId, { ...origin, action: { action: "clearUser", target: userId } });
};

const setTwitchModerator = (
  deps: TwitchCommandsDeps,
  canvasId: string,
  userId: string,
  isModerator: boolean,
) => deps.core.setModerator(canvasId, { userId, source: "twitch", isModerator });

// La liste des modérateurs Twitch : ceux qui manquent sont nommés, ceux qui n'y sont plus perdent l'origine Twitch.
const applyModeratorList = async (
  deps: TwitchCommandsDeps,
  { canvasId, userIds }: OwnedCommand<"moderators">,
) => {
  const listed = new Set(userIds);
  const fromTwitch = new Set(
    (await deps.core.listModerators(canvasId)).filter((user) => user.isFromTwitch).map((user) => user.userId),
  );
  for (const userId of listed)
    if (!fromTwitch.has(userId)) await setTwitchModerator(deps, canvasId, userId, true);
  for (const userId of fromTwitch)
    if (!listed.has(userId)) await setTwitchModerator(deps, canvasId, userId, false);
};

// La liste des bannis Twitch : un non-banni est banni, un ban Twitch que Twitch a levé est levé. Un ban d'ici reste.
const applyBanList = async (deps: TwitchCommandsDeps, command: OwnedCommand<"bans">) => {
  const listed = new Set(command.userIds);
  const bans = await deps.core.listBans(command.canvasId);
  const banned = new Set(bans.map((user) => user.userId));
  const own = { canvasId: command.canvasId, ownerId: command.ownerId };
  for (const userId of listed) if (!banned.has(userId)) await applyBan(deps, { ...own, kind: "ban", userId });
  for (const { userId, isFromTwitch } of bans)
    if (isFromTwitch && !listed.has(userId)) await applyBan(deps, { ...own, kind: "unban", userId });
};

export async function applyTwitchCommand(deps: TwitchCommandsDeps, command: TwitchCommand): Promise<void> {
  const meta = await deps.core.getCanvas(command.canvasId);
  if (!meta) return; // canvas supprimé ou en cours de restore : la prochaine synchro rattrapera
  switch (command.kind) {
    case "ban":
    case "unban":
      return applyBan(deps, { ...command, ownerId: meta.ownerId });
    case "moderator":
      await setTwitchModerator(deps, command.canvasId, command.userId, command.isModerator);
      return;
    case "moderators":
      return applyModeratorList(deps, { ...command, ownerId: meta.ownerId });
    case "bans":
      return applyBanList(deps, { ...command, ownerId: meta.ownerId });
  }
}

// Une action qui échoue est journalisée puis acquittée : la file continue, et la synchro suivante la rattrape.
export async function consumeTwitchCommands(
  deps: TwitchCommandsDeps,
  queue: TwitchCommandQueue,
  isRunning: () => boolean,
): Promise<void> {
  while (isRunning()) {
    for (const { id, command } of await queue.listTwitchCommands(WAIT_MS)) {
      await applyTwitchCommand(deps, command).catch((error: unknown) =>
        console.error("gateway: action Twitch non appliquée", command, error),
      );
      await queue.ackTwitchCommand(id);
    }
  }
}
