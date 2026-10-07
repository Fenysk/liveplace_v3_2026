// L'OAuth de Twitch (§10.1). Les champs de Twitch sont en snake_case (JOURNAL 2026-09-22) et ne sortent pas d'ici.

import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  SignedInUser,
  TwitchAuth,
  TwitchEventSub,
  TwitchLiveSource,
  TwitchPurpose,
  TwitchUser,
  TwitchWebhook,
  TwitchWebhookEvent,
  TwitchWebhookMessage,
} from "@liveplace/domain/ports";
import { z } from "zod";

const AUTHORIZE_URL = "https://id.twitch.tv/oauth2/authorize";
const CODE_EXCHANGE_URL = "https://id.twitch.tv/oauth2/token";
const USERS_URL = "https://api.twitch.tv/helix/users";
const MODERATORS_URL = "https://api.twitch.tv/helix/moderation/moderators";
const BANNED_URL = "https://api.twitch.tv/helix/moderation/banned";
const PAGE_SIZE = 100; // le maximum de Twitch

// §10.1 : l'e-mail pour tous ; lire ses modérateurs et ses bans, et être prévenu d'un
// ban, pour le seul streamer qui synchronise.
const SCOPES: Record<TwitchPurpose, string> = {
  signIn: "user:read:email",
  sync: "user:read:email moderation:read channel:moderate",
};

const GrantSchema = z.object({ access_token: z.string().min(1) });

const TwitchUserSchema = z.object({
  id: z.string().min(1),
  login: z.string().min(1),
  display_name: z.string().min(1),
  profile_image_url: z.string(),
  email: z.string().optional(), // avec le droit `user:read:email` ; absent si le compte n'en a pas de vérifié
});

// Sans paramètre, `helix/users` rend exactement l'utilisateur du token.
const TwitchUsersSchema = z.object({ data: z.tuple([TwitchUserSchema]) });

const ModerationUserSchema = z.object({
  user_id: z.string().min(1),
  user_login: z.string().min(1),
  user_name: z.string().min(1),
});

// `expires_at` vide : un ban définitif. Une date : un timeout.
const BannedUserSchema = ModerationUserSchema.extend({ expires_at: z.string() });

// Une page de Twitch : sans curseur, c'est la dernière.
const pageSchemaOf = <Item extends z.ZodType>(item: Item) =>
  z.object({ data: z.array(item), pagination: z.object({ cursor: z.string().optional() }) });

type TwitchAuthOptions = { clientId: string; clientSecret: string; redirectUri: string };

const toTwitchUser = ({
  user_id,
  user_login,
  user_name,
}: z.infer<typeof ModerationUserSchema>): TwitchUser => ({
  userId: user_id,
  login: user_login,
  displayName: user_name,
});

export function createTwitchAuth({ clientId, clientSecret, redirectUri }: TwitchAuthOptions): TwitchAuth {
  // Le token ne sort jamais de ce module : ni gardé, ni logué (§10.1). Il meurt avec la connexion qui l'a reçu.
  const exchangeCode = async (code: string): Promise<string> => {
    const exchanged = await fetch(CODE_EXCHANGE_URL, {
      method: "POST",
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });
    if (!exchanged.ok) throw new Error(`Twitch refuse le code (${exchanged.status})`);
    return GrantSchema.parse(await exchanged.json()).access_token;
  };

  const getHelix = async (url: string, token: string): Promise<unknown> => {
    const answer = await fetch(url, { headers: { Authorization: `Bearer ${token}`, "Client-Id": clientId } });
    if (!answer.ok) throw new Error(`${new URL(url).pathname} refuse la requête (${answer.status})`);
    return answer.json();
  };

  const getUser = async (token: string): Promise<SignedInUser> => {
    const [twitchUser] = TwitchUsersSchema.parse(await getHelix(USERS_URL, token)).data;
    return {
      userId: twitchUser.id,
      login: twitchUser.login,
      displayName: twitchUser.display_name,
      avatarUrl: twitchUser.profile_image_url,
      ...(twitchUser.email ? { email: twitchUser.email } : {}),
    };
  };

  // Toutes les pages d'une liste de la chaîne, dans l'ordre, avec le même token.
  const listAll = async <Item extends z.ZodType>(
    url: string,
    item: Item,
    token: string,
    broadcasterId: string,
  ) => {
    const schema = pageSchemaOf(item);
    const items: z.infer<Item>[] = [];
    let after: string | undefined;
    do {
      const query = new URLSearchParams({ broadcaster_id: broadcasterId, first: String(PAGE_SIZE) });
      if (after) query.set("after", after);
      const page = schema.parse(await getHelix(`${url}?${query}`, token));
      items.push(...page.data);
      after = page.pagination.cursor;
    } while (after);
    return items;
  };

  return {
    authorizeUrl(state, purpose) {
      const query = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: SCOPES[purpose],
        state,
      });
      return `${AUTHORIZE_URL}?${query}`;
    },

    async getUserFromCode(code) {
      return getUser(await exchangeCode(code));
    },

    // §10.1 : la chaîne du streamer, lue avec le token qu'il vient d'accorder.
    async getChannelFromCode(code) {
      const grant = await exchangeCode(code);
      const user = await getUser(grant);
      const [moderators, banned] = await Promise.all([
        listAll(MODERATORS_URL, ModerationUserSchema, grant, user.userId),
        listAll(BANNED_URL, BannedUserSchema, grant, user.userId),
      ]);
      return {
        user,
        moderators: moderators.map(toTwitchUser),
        bans: banned.map((ban) => ({ ...toTwitchUser(ban), isPermanent: ban.expires_at === "" })),
      };
    },
  };
}

// --- EventSub (JOURNAL 2026-09-27) : ce que Twitch poste sur /twitch/eventsub ------------------------------------

const MAX_MESSAGE_AGE_MS = 10 * 60 * 1000; // la règle de Twitch contre le rejeu

// Écart §4 (JOURNAL 2026-10-07) : les types qui disent le live d'une chaîne, et la version de chacun.
const LIVE_SUBSCRIPTIONS = [
  { type: "stream.online", version: "1" },
  { type: "stream.offline", version: "1" },
  { type: "channel.update", version: "2" },
];
const LIVE_TYPES = LIVE_SUBSCRIPTIONS.map(({ type }) => type);

const VerificationSchema = z.object({ challenge: z.string().min(1) });
const RevocationSchema = z.object({
  subscription: z.object({
    type: z.string(),
    condition: z.object({ broadcaster_user_id: z.string().min(1) }),
  }),
});
const BroadcasterEventSchema = z.object({ broadcaster_user_id: z.string().min(1) });
const StreamEventSchema = BroadcasterEventSchema.extend({ type: z.string() });
const CategoryEventSchema = BroadcasterEventSchema.extend({ category_name: z.string().default("") });
const ChannelUserEventSchema = ModerationUserSchema.extend(BroadcasterEventSchema.shape);
const NotificationSchema = z.object({ subscription: z.object({ type: z.string() }), event: z.unknown() });

// Une signature juste, à temps constant : une comparaison ordinaire laisse deviner la bonne octet par octet.
const isSignedBy = (secret: string, { id, timestamp, body, signature }: TwitchWebhookMessage): boolean => {
  const expected = Buffer.from(
    `sha256=${createHmac("sha256", secret)
      .update(id + timestamp + body)
      .digest("hex")}`,
  );
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
};

const toUser = (event: z.infer<typeof ChannelUserEventSchema>) => ({
  broadcasterId: event.broadcaster_user_id,
  user: toTwitchUser(event),
});

// Un événement suivi : les bans et les modérateurs de la chaîne, et son live. Tout autre type est ignoré.
const toNotificationEvent = (body: unknown): TwitchWebhookEvent => {
  const { subscription, event } = NotificationSchema.parse(body);
  switch (subscription.type) {
    // Écart §4 (JOURNAL 2026-10-07) : seul un `type: live` allume le statut, jamais une rediffusion.
    case "stream.online": {
      const online = StreamEventSchema.parse(event);
      return online.type === "live"
        ? { kind: "online", broadcasterId: online.broadcaster_user_id }
        : { kind: "ignored" };
    }
    case "stream.offline":
      return { kind: "offline", broadcasterId: BroadcasterEventSchema.parse(event).broadcaster_user_id };
    case "channel.update": {
      const channel = CategoryEventSchema.parse(event);
      return {
        kind: "category",
        broadcasterId: channel.broadcaster_user_id,
        category: channel.category_name,
      };
    }
    case "channel.ban": {
      const ban = ChannelUserEventSchema.extend({ is_permanent: z.boolean() }).parse(event);
      return { kind: "ban", ...toUser(ban), isPermanent: ban.is_permanent };
    }
    case "channel.unban":
      return { kind: "unban", ...toUser(ChannelUserEventSchema.parse(event)) };
    case "channel.moderator.add":
    case "channel.moderator.remove":
      return {
        kind: "moderator",
        ...toUser(ChannelUserEventSchema.parse(event)),
        isModerator: subscription.type === "channel.moderator.add",
      };
    default:
      return { kind: "ignored" };
  }
};

// Écart §4 (JOURNAL 2026-10-07) : un abonnement de live retiré n'est jamais la synchro de modération révoquée.
const toRevocationEvent = (body: unknown): TwitchWebhookEvent => {
  const { subscription } = RevocationSchema.parse(body);
  return {
    kind: LIVE_TYPES.includes(subscription.type) ? "liveRevoked" : "revocation",
    broadcasterId: subscription.condition.broadcaster_user_id,
  };
};

export function createTwitchWebhook(secret: string): TwitchWebhook {
  return {
    read(message, nowMs) {
      if (!isSignedBy(secret, message)) return null;
      const sentAt = Date.parse(message.timestamp);
      if (!Number.isFinite(sentAt) || Math.abs(nowMs - sentAt) > MAX_MESSAGE_AGE_MS) return null;
      const body: unknown = JSON.parse(message.body);
      if (message.type === "webhook_callback_verification")
        return { kind: "verification", challenge: VerificationSchema.parse(body).challenge };
      if (message.type === "revocation") return toRevocationEvent(body);
      return toNotificationEvent(body);
    },
  };
}

// --- Les abonnements EventSub (JOURNAL 2026-09-27) : pris avec le jeton de l'application, jamais celui du streamer --

const SUBSCRIPTIONS_URL = "https://api.twitch.tv/helix/eventsub/subscriptions";
// Ce que la synchro suit : les bans et les modérateurs de la chaîne (A2).
const MODERATION_TYPES = [
  "channel.ban",
  "channel.unban",
  "channel.moderator.add",
  "channel.moderator.remove",
];
const MODERATION_SUBSCRIPTIONS = MODERATION_TYPES.map((type) => ({ type, version: "1" }));
// Un abonnement dans un autre état (révoqué, échoué) ne livre plus rien : on en recrée un.
const ACTIVE_STATUSES = new Set(["enabled", "webhook_callback_verification_pending"]);
// Écart §4 (JOURNAL 2026-10-07) : aucun appel à Twitch ne pend, sous le délai de 10 s qu'il laisse à un webhook.
const TWITCH_TIMEOUT_MS = 4000;

const AppGrantSchema = z.object({ access_token: z.string().min(1) });
const SubscriptionsSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      status: z.string(),
      transport: z.object({ callback: z.string().optional() }),
    }),
  ),
});

type AppCredentials = { clientId: string; clientSecret: string };

// Un appel à l'API avec le jeton de l'application, redemandé une fois s'il a expiré. Le jeton reste en mémoire seulement.
function createAppHelix({ clientId, clientSecret }: AppCredentials) {
  let appGrant: string | null = null;

  const getAppGrant = async (): Promise<string> => {
    if (appGrant) return appGrant;
    const answer = await fetch(CODE_EXCHANGE_URL, {
      method: "POST",
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "client_credentials",
      }),
      signal: AbortSignal.timeout(TWITCH_TIMEOUT_MS),
    });
    if (!answer.ok) throw new Error(`Twitch refuse le jeton de l'application (${answer.status})`);
    appGrant = AppGrantSchema.parse(await answer.json()).access_token;
    return appGrant;
  };

  const callHelix = async (url: string, init: RequestInit = {}, isRetry = false): Promise<Response> => {
    const headers = {
      ...init.headers,
      Authorization: `Bearer ${await getAppGrant()}`,
      "Client-Id": clientId,
    };
    const answer = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(TWITCH_TIMEOUT_MS) });
    if (answer.status !== 401 || isRetry) return answer;
    appGrant = null;
    return callHelix(url, init, true);
  };

  return callHelix;
}

type TwitchEventSubOptions = AppCredentials & {
  callbackUrl: string;
  secret: string;
  isBeta: boolean;
};

export function createTwitchEventSub({
  callbackUrl,
  secret,
  isBeta,
  ...credentials
}: TwitchEventSubOptions): TwitchEventSub {
  const callHelix = createAppHelix(credentials);

  type Subscription = z.infer<typeof SubscriptionsSchema>["data"][number];

  // Pourquoi on ne s'abonne pas d'ici, ou `null` si on le peut.
  const skipReason = (): string | null => {
    // Twitch ne livre qu'à une adresse publique en https : sur le poste de développement, rien à prendre.
    if (!callbackUrl.startsWith("https://")) return "l'adresse de retour n'est pas publique";
    // Écart §10.1 (JOURNAL 2026-10-05) : Twitch ne garde qu'un abonnement par type et par chaîne ; une bêta le volerait à la prod.
    return isBeta ? "emplacement de bêta" : null;
  };

  const listSubscriptions = async (broadcasterId: string): Promise<Subscription[]> => {
    const listed = await callHelix(`${SUBSCRIPTIONS_URL}?${new URLSearchParams({ user_id: broadcasterId })}`);
    if (!listed.ok) throw new Error(`eventsub/subscriptions refuse la liste (${listed.status})`);
    return SubscriptionsSchema.parse(await listed.json()).data;
  };

  // Un des nôtres vers une autre adresse (une bêta d'avant le 2026-10-05) : la prod le reprend.
  const clearElsewhere = async (found: Subscription[]): Promise<void> => {
    const elsewhere = found.filter(
      (one) => MODERATION_TYPES.includes(one.type) && one.transport.callback !== callbackUrl,
    );
    for (const one of elsewhere) {
      const cleared = await callHelix(`${SUBSCRIPTIONS_URL}?${new URLSearchParams({ id: one.id })}`, {
        method: "DELETE",
      });
      if (!cleared.ok && cleared.status !== 404)
        throw new Error(`eventsub ${one.type} non supprimé (${cleared.status})`);
    }
  };

  const createMissing = async (
    broadcasterId: string,
    found: Subscription[],
    wanted: readonly { type: string; version: string }[],
  ): Promise<void> => {
    const active = new Set(
      found
        .filter((one) => ACTIVE_STATUSES.has(one.status) && one.transport.callback === callbackUrl)
        .map((one) => one.type),
    );
    for (const { type, version } of wanted.filter(({ type: asked }) => !active.has(asked))) {
      const created = await callHelix(SUBSCRIPTIONS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          version,
          condition: { broadcaster_user_id: broadcasterId },
          transport: { method: "webhook", callback: callbackUrl, secret },
        }),
      });
      // 409 : Twitch l'a déjà, créé entre la liste et maintenant.
      if (!created.ok && created.status !== 409)
        throw new Error(`eventsub ${type} refusé (${created.status})`);
    }
  };

  // Les abonnements de la chaîne, ou `null` quand on ne s'abonne pas d'ici.
  const listWhenAllowed = async (broadcasterId: string): Promise<Subscription[] | null> => {
    const reason = skipReason();
    if (!reason) return listSubscriptions(broadcasterId);
    console.info(`EventSub sauté : ${reason}`, callbackUrl);
    return null;
  };

  return {
    async subscribeToModeration(broadcasterId) {
      const found = await listWhenAllowed(broadcasterId);
      if (!found) return;
      await clearElsewhere(found);
      await createMissing(broadcasterId, found, MODERATION_SUBSCRIPTIONS);
    },

    // Écart §4 (JOURNAL 2026-10-07) : le live de la chaîne, avec les mêmes règles que la modération.
    async subscribeToLive(broadcasterId) {
      const found = await listWhenAllowed(broadcasterId);
      if (found) await createMissing(broadcasterId, found, LIVE_SUBSCRIPTIONS);
    },
  };
}

// --- Le live d'une chaîne maintenant (Écart §4, JOURNAL 2026-10-07) : le filet des abonnements, avec le jeton de l'application ---

const STREAMS_URL = "https://api.twitch.tv/helix/streams";
const CHANNELS_URL = "https://api.twitch.tv/helix/channels";

// `type` : « live » pour un stream en cours, vide quand Twitch n'a pas su le dire.
const StreamsSchema = z.object({
  data: z.array(z.object({ type: z.string(), game_name: z.string().default("") })),
});
const ChannelsSchema = z.object({ data: z.array(z.object({ game_name: z.string().default("") })) });

export function createTwitchLiveSource(credentials: AppCredentials): TwitchLiveSource {
  const callHelix = createAppHelix(credentials);

  const getHelix = async (url: string, query: Record<string, string>): Promise<unknown> => {
    const answer = await callHelix(`${url}?${new URLSearchParams(query)}`);
    if (!answer.ok) throw new Error(`${new URL(url).pathname} refuse la requête (${answer.status})`);
    return answer.json();
  };

  return {
    async getLive(userId) {
      const [stream] = StreamsSchema.parse(await getHelix(STREAMS_URL, { user_id: userId })).data;
      return stream?.type === "live" ? { category: stream.game_name } : null;
    },

    // La catégorie de la chaîne, que l'événement `stream.online` ne porte pas.
    async getCategory(userId) {
      const [channel] = ChannelsSchema.parse(await getHelix(CHANNELS_URL, { broadcaster_id: userId })).data;
      return channel?.game_name ?? "";
    },
  };
}
