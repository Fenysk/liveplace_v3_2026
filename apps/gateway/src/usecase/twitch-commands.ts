// Écart §2 (JOURNAL 2026-09-27) : les actions venues de Twitch. Le web les dépose, le gateway les applique avec ses
// scripts, au nom du streamer et avec l'origine Twitch.

import type { Timestamp } from "@liveplace/domain";
import type { CanvasCore, Moderation, TwitchCommand, TwitchCommandQueue } from "@liveplace/domain/ports";

// Une attente bornée : à l'arrêt, la boucle ne retient pas le process plus longtemps.
const WAIT_MS = 5000;

export type TwitchCommandsDeps = {
  core: Pick<CanvasCore, "getCanvas" | "moderate" | "setModerator">;
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

export async function applyTwitchCommand(deps: TwitchCommandsDeps, command: TwitchCommand): Promise<void> {
  const { canvasId, userId } = command;
  const meta = await deps.core.getCanvas(canvasId);
  if (!meta) return; // canvas supprimé ou en cours de restore : la prochaine synchro rattrapera
  if (command.kind === "moderator") {
    await deps.core.setModerator(canvasId, { userId, source: "twitch", isModerator: command.isModerator });
    return;
  }
  const origin = { by: meta.ownerId, nowMs: deps.now(), source: "twitch" } as const;
  const moderated = await deps.core.moderate(canvasId, {
    ...origin,
    action: { action: command.kind, target: userId },
    slice: "first",
  });
  if (command.kind === "ban" && moderated.ok)
    await clearAll(deps, canvasId, { ...origin, action: { action: "clearUser", target: userId } });
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
