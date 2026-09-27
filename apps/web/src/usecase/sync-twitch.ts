// « Synchroniser avec Twitch » (JOURNAL 2026-09-27) : la connexion habituelle, puis les modérateurs et les bans de
// la chaîne confiés au gateway, qui les applique (§2). Le web n'écrit que des noms, des actions et l'état.

import type { Timestamp } from "@liveplace/domain";
import type { TwitchChannel, TwitchWrites } from "@liveplace/domain/ports";
import { type SignInDeps, type SignInResult, signInTwitchUser } from "./sign-in";

export type TwitchSyncDeps = SignInDeps & { twitchWrites: TwitchWrites; now: () => Timestamp };

const syncChannel = async (
  deps: TwitchSyncDeps,
  { user, moderators, bans }: TwitchChannel,
): Promise<void> => {
  const canvas = await deps.durable.getActiveCanvasForOwner(user.userId);
  if (!canvas) throw new Error("synchro Twitch : aucun canvas actif après la connexion");
  const { canvasId } = canvas;
  // A3 : un timeout n'est pas un ban.
  const permanentBans = bans.filter((ban) => ban.isPermanent);
  const named = [...moderators, ...permanentBans].map(({ userId, login, displayName }) => ({
    userId,
    login,
    displayName,
  }));
  await deps.twitchWrites.setTwitchUsers(canvasId, named);
  await deps.twitchWrites.queueTwitchCommands([
    { kind: "moderators", canvasId, userIds: moderators.map((moderator) => moderator.userId) },
    { kind: "bans", canvasId, userIds: permanentBans.map((ban) => ban.userId) },
  ]);
  await deps.twitchWrites.setTwitchSync(canvasId, { status: "ok", syncedAt: deps.now() });
};

export async function completeTwitchSync(
  deps: TwitchSyncDeps,
  code: string,
  returnPath: string | null,
): Promise<SignInResult> {
  const channel = await deps.twitch.getChannelFromCode(code);
  const signedIn = await signInTwitchUser(deps, channel.user, returnPath);
  await syncChannel(deps, channel);
  return signedIn;
}
