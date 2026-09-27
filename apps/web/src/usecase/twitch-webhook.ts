// Écart §9 (JOURNAL 2026-09-27) : ce que Twitch poste sur /twitch/eventsub. Le web répond, et dépose pour le
// gateway ce qu'il faut appliquer (§2) : il ne touche à aucun pixel.

import type { Timestamp } from "@liveplace/domain";
import type {
  DurableStore,
  TwitchCommand,
  TwitchWebhook,
  TwitchWebhookEvent,
  TwitchWebhookMessage,
  TwitchWrites,
} from "@liveplace/domain/ports";

export type TwitchWebhookDeps = {
  webhook: TwitchWebhook;
  now: () => Timestamp;
  durable: Pick<DurableStore, "getActiveCanvasForOwner">;
  twitchWrites: TwitchWrites;
};

// `204` dès que c'est noté : Twitch réessaie, puis coupe l'abonnement, si la réponse tarde.
export type TwitchWebhookAnswer = { status: 200; challenge: string } | { status: 204 } | { status: 403 };

type ChannelEvent = Exclude<TwitchWebhookEvent, { kind: "verification" | "ignored" }>;

// L'action à confier au gateway. Un timeout n'est pas un ban (A3) : rien.
const commandOf = (event: ChannelEvent, canvasId: string): TwitchCommand | null => {
  switch (event.kind) {
    case "ban":
      return event.isPermanent ? { kind: "ban", canvasId, userId: event.user.userId } : null;
    case "unban":
      return { kind: "unban", canvasId, userId: event.user.userId };
    case "moderator":
      return { kind: "moderator", canvasId, userId: event.user.userId, isModerator: event.isModerator };
    case "revocation":
      return null;
  }
};

const applyChannelEvent = async (deps: TwitchWebhookDeps, event: ChannelEvent): Promise<void> => {
  const canvas = await deps.durable.getActiveCanvasForOwner(event.broadcasterId);
  if (!canvas) return; // une chaîne sans canvas ici : un abonnement resté d'un compte parti
  const { canvasId } = canvas;
  if (event.kind === "revocation") {
    await deps.twitchWrites.setTwitchSync(canvasId, { status: "revoked", syncedAt: deps.now() });
    return;
  }
  const command = commandOf(event, canvasId);
  if (!command) return;
  await deps.twitchWrites.setTwitchUsers(canvasId, [event.user]);
  await deps.twitchWrites.queueTwitchCommands([command]);
};

export async function receiveTwitchWebhook(
  deps: TwitchWebhookDeps,
  message: TwitchWebhookMessage,
): Promise<TwitchWebhookAnswer> {
  const event = deps.webhook.read(message, deps.now());
  if (!event) return { status: 403 };
  if (event.kind === "verification") return { status: 200, challenge: event.challenge };
  if (event.kind !== "ignored") await applyChannelEvent(deps, event);
  return { status: 204 };
}
