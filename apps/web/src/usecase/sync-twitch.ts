// « Synchroniser avec Twitch » (JOURNAL 2026-09-27) : la connexion habituelle, puis les modérateurs et les bans de
// la chaîne confiés au gateway, qui les applique (§2). Le web n'écrit que des noms, des actions et l'état.

import type { Timestamp } from "@liveplace/domain";
import type { AccountList, TwitchChannel, TwitchEventSub, TwitchWrites } from "@liveplace/domain/ports";
import { type SignInDeps, type SignInResult, signInTwitchUser } from "./sign-in";

export type TwitchSyncDeps = SignInDeps & {
  twitchWrites: Pick<TwitchWrites, "setTwitchUsers" | "queueTwitchCommands" | "setTwitchSync">;
  eventSub: Pick<TwitchEventSub, "subscribeToModeration" | "deleteSubscriptions">;
  // CDC §8 : un compte supprimé n'a plus d'abonnement (JOURNAL 2026-11-02).
  accounts: Pick<AccountList, "isDeletedAccount">;
  now: () => Timestamp;
};

// S'abonner, sauf pour un compte supprimé. L'effacement a pu passer pendant l'appel à Twitch : ce qui vient d'être créé pour lui est
// alors retiré, car l'effacement, lui, avait déjà fini de retirer les siens (la même garde que le suivi du live).
const subscribeToModeration = async (deps: TwitchSyncDeps, userId: string): Promise<void> => {
  if (await deps.accounts.isDeletedAccount(userId)) return;
  await deps.eventSub.subscribeToModeration(userId);
  if (await deps.accounts.isDeletedAccount(userId)) await deps.eventSub.deleteSubscriptions(userId);
};

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
  // A2 : rester à jour ensuite, sans garder de jeton. Un échec remonte : la synchro n'est pas notée faite.
  await subscribeToModeration(deps, user.userId);
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
