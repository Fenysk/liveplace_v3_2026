// L'OAuth de Twitch (§10.1). Les champs de Twitch sont en snake_case (JOURNAL 2026-09-22) et ne sortent pas d'ici.

import type { TwitchAuth } from "@liveplace/domain/ports";
import { z } from "zod";

const AUTHORIZE_URL = "https://id.twitch.tv/oauth2/authorize";
const CODE_EXCHANGE_URL = "https://id.twitch.tv/oauth2/token";
const USERS_URL = "https://api.twitch.tv/helix/users";

const GrantSchema = z.object({ access_token: z.string().min(1) });

const TwitchUserSchema = z.object({
  id: z.string().min(1),
  login: z.string().min(1),
  display_name: z.string().min(1),
  profile_image_url: z.string(),
});

// Sans paramètre, `helix/users` rend exactement l'utilisateur du token.
const TwitchUsersSchema = z.object({ data: z.tuple([TwitchUserSchema]) });

type TwitchAuthOptions = { clientId: string; clientSecret: string; redirectUri: string };

export function createTwitchAuth({ clientId, clientSecret, redirectUri }: TwitchAuthOptions): TwitchAuth {
  return {
    authorizeUrl(state) {
      // Aucun scope : l'identité publique suffit (§10.1).
      const query = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "",
        state,
      });
      return `${AUTHORIZE_URL}?${query}`;
    },

    // Le token ne sort jamais de cette fonction : ni gardé, ni logué (§10.1).
    async getUserFromCode(code) {
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
      const grant = GrantSchema.parse(await exchanged.json());

      const answer = await fetch(USERS_URL, {
        headers: { Authorization: `Bearer ${grant.access_token}`, "Client-Id": clientId },
      });
      if (!answer.ok) throw new Error(`helix/users refuse la requête (${answer.status})`);
      const [twitchUser] = TwitchUsersSchema.parse(await answer.json()).data;

      return {
        userId: twitchUser.id,
        login: twitchUser.login,
        displayName: twitchUser.display_name,
        avatarUrl: twitchUser.profile_image_url,
      };
    },
  };
}
