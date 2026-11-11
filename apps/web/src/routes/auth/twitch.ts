// `/auth/twitch` : déjà connecté, va sur sa fresque sans Twitch ; sinon pose le cookie de l'aller et part chez Twitch (§10.1).

import type { Session } from "@liveplace/domain";
import { serializeCookie } from "@liveplace/shared";
import { createFileRoute } from "@tanstack/react-router";
import { redirectWithCookies } from "../../shared/redirect";
import {
  OAUTH_COOKIE,
  OAUTH_TTL_SECONDS,
  type PendingSignIn,
  toOAuthCookieValue,
  toReturnPath,
} from "../../usecase/oauth";

export const Route = createFileRoute("/auth/twitch")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const { deps } = context;
        const query = new URL(request.url).searchParams;
        const pending: PendingSignIn = {
          state: crypto.randomUUID(),
          returnPath: toReturnPath(query.get("returnTo")),
          // §10.1 : `sync=1`, le streamer synchronise sa chaîne.
          purpose: query.get("sync") === "1" ? "sync" : "signIn",
        };
        // Un cookie illisible ne bloque pas : on repart chez Twitch. `sync=1` y repart toujours.
        let session: Session | null = null;
        if (pending.purpose === "signIn") {
          try {
            session = await deps.verifier.verify(request.headers.get("cookie") ?? undefined);
          } catch (error) {
            console.error("auth/twitch : cookie de session non vérifié", error);
          }
        }
        if (session) return redirectWithCookies(pending.returnPath ?? `/${session.login}`, []);
        const cookie = serializeCookie(
          OAUTH_COOKIE,
          toOAuthCookieValue(pending),
          OAUTH_TTL_SECONDS,
          deps.isSecure,
        );
        return redirectWithCookies(deps.twitch.authorizeUrl(pending.state, pending.purpose), [cookie]);
      },
    },
  },
});
