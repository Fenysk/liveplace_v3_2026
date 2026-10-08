// §2 : les actions venues de Twitch. Le web les dépose, le gateway les applique avec ses
// scripts, au nom du streamer et avec l'origine Twitch.

import type { CanvasMeta, Timestamp } from "@liveplace/domain";
import type {
  CanvasCore,
  CanvasTwitchCommand,
  Moderation,
  TwitchCommand,
  TwitchCommandQueue,
} from "@liveplace/domain/ports";
import type { Broadcast } from "./broadcast";

// Une attente bornée : à l'arrêt, la boucle ne retient pas le process plus longtemps.
const WAIT_MS = 5000;

// Écart §15 (JOURNAL 2026-10-06) : le temps qu'un successeur se pose, quelques secondes au plus.
const FOLLOW_RETRY_MS = 250;
const FOLLOW_MAX_ATTEMPTS = 20;

export type TwitchCommandsDeps = {
  core: Pick<
    CanvasCore,
    "getCanvas" | "moderate" | "setModerator" | "listModerators" | "listBans" | "copyTwitchUsers"
  >;
  broadcast: Pick<Broadcast, "announce">; // Écart §4 (JOURNAL 2026-10-07) : le live d'un compte, à toutes les pages
  now: () => Timestamp;
  wait: (ms: number) => Promise<void>;
};

// `lost` : aucun canvas prêt n'a pu la recevoir. On ne l'acquitte pas : elle n'est pas appliquée, pas oubliée.
export type CommandOutcome = "done" | "lost";

// Un script a refusé parce que le canvas vient d'être archivé : l'action repart sur son successeur.
class CanvasArchivedError extends Error {}

const orRestartIfArchived = <Done extends { ok: boolean }>(result: Done): Done => {
  if (!result.ok && "error" in result && result.error === "canvas_archived") throw new CanvasArchivedError();
  return result;
};

// Bannir, c'est `ban` puis `clearUser` jusqu'à la dernière tranche, comme depuis la pill Inspection (§5.4).
const clearAll = async (
  deps: TwitchCommandsDeps,
  canvasId: string,
  moderation: Omit<Moderation, "slice">,
) => {
  let result = orRestartIfArchived(await deps.core.moderate(canvasId, { ...moderation, slice: "first" }));
  while (result.ok && !result.value.isDone)
    result = orRestartIfArchived(await deps.core.moderate(canvasId, { ...moderation, slice: "next" }));
};

type OwnedCommand<Kind extends CanvasTwitchCommand["kind"]> = Extract<CanvasTwitchCommand, { kind: Kind }> & {
  ownerId: string;
};

// Un ban ou un déban venu de Twitch, au nom du streamer. Un ban retire ensuite ses pixels. Écart §5.4 (JOURNAL 2026-10-08) :
// un ban que le script refuse (modérateur nommé ici) est ignoré, sans retrait ; la synchro suivante le retentera.
const applyBan = async (deps: TwitchCommandsDeps, command: OwnedCommand<"ban" | "unban">) => {
  const { canvasId, userId, ownerId } = command;
  const origin = { by: ownerId, nowMs: deps.now(), source: "twitch" } as const;
  const moderated = orRestartIfArchived(
    await deps.core.moderate(canvasId, {
      ...origin,
      action: { action: command.kind, target: userId },
      slice: "first",
    }),
  );
  if (command.kind === "ban" && moderated.ok)
    await clearAll(deps, canvasId, { ...origin, action: { action: "clearUser", target: userId } });
};

const setTwitchModerator = async (
  deps: TwitchCommandsDeps,
  canvasId: string,
  userId: string,
  isModerator: boolean,
) => orRestartIfArchived(await deps.core.setModerator(canvasId, { userId, source: "twitch", isModerator }));

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

// Le canvas qui sert aujourd'hui une action : le canvas visé, ou celui qui l'a remplacé, de proche en proche.
// `missing` : le canvas visé n'existe pas (ou plus). `lost` : on a suivi, mais aucun canvas prêt ne s'est posé à temps.
type Followed =
  | { status: "found"; canvasId: string; meta: CanvasMeta }
  | { status: "missing" }
  | { status: "lost" };

const followToLiveCanvas = async (deps: TwitchCommandsDeps, from: string): Promise<Followed> => {
  let canvasId = from;
  let isFollowing = false; // un successeur absent n'est pas « supprimé » : il n'est pas encore prêt
  for (let attempt = 0; attempt < FOLLOW_MAX_ATTEMPTS; attempt++) {
    const meta = await deps.core.getCanvas(canvasId);
    if (!meta && !isFollowing) return { status: "missing" };
    if (meta && meta.archivedAt === undefined) return { status: "found", canvasId, meta };
    // Archivé sans successeur : une archive qu'on rouvre, elle redevient le canvas actif dans un instant.
    if (meta?.successorId) {
      canvasId = meta.successorId;
      isFollowing = true;
    } else await deps.wait(FOLLOW_RETRY_MS);
  }
  return { status: "lost" };
};

const userIdsOf = (command: CanvasTwitchCommand): readonly string[] =>
  "userIds" in command ? command.userIds : [command.userId];

const applyOn = async (
  deps: TwitchCommandsDeps,
  command: CanvasTwitchCommand,
  ownerId: string,
): Promise<void> => {
  switch (command.kind) {
    case "ban":
    case "unban":
      return applyBan(deps, { ...command, ownerId });
    case "moderator":
      await setTwitchModerator(deps, command.canvasId, command.userId, command.isModerator);
      return;
    case "moderators":
      return applyModeratorList(deps, { ...command, ownerId });
    case "bans":
      return applyBanList(deps, { ...command, ownerId });
  }
};

const applyOnCanvas = async (
  deps: TwitchCommandsDeps,
  command: CanvasTwitchCommand,
): Promise<CommandOutcome> => {
  let canvasId = command.canvasId;
  // Une course avec l'archivage (un script refuse) redemande le canvas : il a maintenant son successeur.
  for (let round = 0; round < FOLLOW_MAX_ATTEMPTS; round++) {
    const followed = await followToLiveCanvas(deps, canvasId);
    if (followed.status === "missing") return "done"; // supprimé ou en cours de restore : la prochaine synchro rattrapera
    if (followed.status === "lost") return "lost";
    // Le web a écrit les noms sur le canvas visé : le successeur ne les a que s'ils y étaient avant sa copie.
    if (followed.canvasId !== command.canvasId)
      await deps.core.copyTwitchUsers(command.canvasId, followed.canvasId, userIdsOf(command));
    try {
      await applyOn(deps, { ...command, canvasId: followed.canvasId }, followed.meta.ownerId);
      return "done";
    } catch (error) {
      if (!(error instanceof CanvasArchivedError)) throw error;
      canvasId = followed.canvasId;
    }
  }
  return "lost";
};

export async function applyTwitchCommand(
  deps: TwitchCommandsDeps,
  command: TwitchCommand,
): Promise<CommandOutcome> {
  // Écart §4 (JOURNAL 2026-10-07) : un live n'a pas de canvas. Les pages du streamer et les connexions du compte le prennent.
  if (command.kind === "twitchLive") {
    const { userId, twitchLive } = command;
    deps.broadcast.announce({ t: "twitchLive", userId, ...(twitchLive ? { twitchLive } : {}) });
    return "done";
  }
  return applyOnCanvas(deps, command);
}

// Une action qui échoue est journalisée puis acquittée : la file continue, et la synchro suivante la rattrape.
// Une action perdue ne l'est pas : elle reste à lire au prochain démarrage.
export async function consumeTwitchCommands(
  deps: TwitchCommandsDeps,
  queue: TwitchCommandQueue,
  isRunning: () => boolean,
): Promise<void> {
  while (isRunning()) {
    for (const { id, command } of await queue.listTwitchCommands(WAIT_MS)) {
      const outcome = await applyTwitchCommand(deps, command).catch((error: unknown) => {
        console.error("gateway: action Twitch non appliquée", command, error);
        return "done" as const;
      });
      if (outcome === "lost")
        console.error("gateway: action Twitch sans canvas prêt, gardée sans acquit", command);
      else await queue.ackTwitchCommand(id);
    }
  }
}
