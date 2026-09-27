// L'OAuth de Twitch (§10.1). Les champs de Twitch sont en snake_case (JOURNAL 2026-09-22) et ne sortent pas d'ici.

import type { SignedInUser, TwitchAuth, TwitchPurpose, TwitchUser } from "@liveplace/domain/ports";
import { z } from "zod";

const AUTHORIZE_URL = "https://id.twitch.tv/oauth2/authorize";
const CODE_EXCHANGE_URL = "https://id.twitch.tv/oauth2/token";
const USERS_URL = "https://api.twitch.tv/helix/users";
const MODERATORS_URL = "https://api.twitch.tv/helix/moderation/moderators";
const BANNED_URL = "https://api.twitch.tv/helix/moderation/banned";
const PAGE_SIZE = 100; // le maximum de Twitch

// Écart §10.1 (JOURNAL 2026-09-27) : l'e-mail pour tous ; lire ses modérateurs et ses bans, et être prévenu d'un
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

    // Écart §10.1 (JOURNAL 2026-09-27) : la chaîne du streamer, lue avec le token qu'il vient d'accorder.
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
