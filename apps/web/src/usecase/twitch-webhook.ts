// §9 : ce que Twitch poste sur /twitch/eventsub. Le web répond, et dépose pour le
// gateway ce qu'il faut appliquer (§2) : il ne touche à aucun pixel.

import type { Timestamp } from "@liveplace/domain";
import type {
  CanvasTwitchCommand,
  DurableStore,
  TwitchLiveEvent,
  TwitchWebhook,
  TwitchWebhookEvent,
  TwitchWebhookMessage,
  TwitchWrites,
} from "@liveplace/domain/ports";
import type { TwitchLiveTracker } from "./twitch-live";

export type TwitchWebhookDeps = {
  webhook: TwitchWebhook;
  now: () => Timestamp;
  durable: Pick<DurableStore, "getActiveCanvasForOwner">;
  twitchWrites: TwitchWrites;
  tracker: Pick<TwitchLiveTracker, "apply">; // Écart §4 (JOURNAL 2026-10-07)
};

// `204` dès que c'est noté : Twitch réessaie, puis coupe l'abonnement, si la réponse tarde.
export type TwitchWebhookAnswer = { status: 200; challenge: string } | { status: 204 } | { status: 403 };

type ChannelEvent = Exclude<TwitchWebhookEvent, { kind: "verification" | "ignored" } | TwitchLiveEvent>;

// Écart §4 (JOURNAL 2026-10-07) : le live n'a pas de canvas ici, et sa révocation n'est pas celle de la modération.
const isLiveEvent = (event: TwitchWebhookEvent): event is TwitchLiveEvent =>
  event.kind === "online" ||
  event.kind === "offline" ||
  event.kind === "category" ||
  event.kind === "liveRevoked";

// L'action à confier au gateway. Un timeout n'est pas un ban (A3) : rien.
const commandOf = (event: ChannelEvent, canvasId: string): CanvasTwitchCommand | null => {
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

type AppliedEvent = Exclude<TwitchWebhookEvent, { kind: "verification" }>;

const applyEvent = async (deps: TwitchWebhookDeps, event: AppliedEvent): Promise<void> => {
  if (isLiveEvent(event)) await deps.tracker.apply(event);
  else if (event.kind !== "ignored") await applyChannelEvent(deps, event);
};

// Écart §5.1 (JOURNAL 2026-10-08) : Twitch livre « au moins une fois ». Un identifiant déjà reçu ne rejoue rien ; si
// l'action échoue, il est rendu, pour que la redélivrance de Twitch passe.
const applyOnce = async (deps: TwitchWebhookDeps, messageId: string, event: AppliedEvent): Promise<void> => {
  if (!(await deps.twitchWrites.reserveTwitchMessage(messageId))) return;
  try {
    await applyEvent(deps, event);
  } catch (error) {
    await deps.twitchWrites.releaseTwitchMessage(messageId);
    throw error;
  }
};

export async function receiveTwitchWebhook(
  deps: TwitchWebhookDeps,
  message: TwitchWebhookMessage,
): Promise<TwitchWebhookAnswer> {
  const event = deps.webhook.read(message, deps.now());
  if (!event) return { status: 403 };
  if (event.kind === "verification") return { status: 200, challenge: event.challenge };
  // Après la signature et la fraîcheur : un message non signé ne réserve jamais un identifiant. Une révocation garde son comportement.
  if (message.type === "notification") await applyOnce(deps, message.id, event);
  else await applyEvent(deps, event);
  return { status: 204 };
}
