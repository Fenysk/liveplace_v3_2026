// `/auth/twitch` : pose le cookie de l'aller et part chez Twitch (§10.1).

import { serializeCookie } from "@liveplace/shared";
import { createFileRoute } from "@tanstack/react-router";
import { redirectWithCookies } from "../../shared/redirect";
import { OAUTH_COOKIE, OAUTH_TTL_SECONDS, toOAuthCookieValue, toReturnPath } from "../../usecase/oauth";

export const Route = createFileRoute("/auth/twitch")({
  server: {
    handlers: {
      GET: ({ request, context }) => {
        const { deps } = context;
        const pending = {
          state: crypto.randomUUID(),
          returnPath: toReturnPath(new URL(request.url).searchParams.get("returnTo")),
        };
        const cookie = serializeCookie(
          OAUTH_COOKIE,
          toOAuthCookieValue(pending),
          OAUTH_TTL_SECONDS,
          deps.isSecure,
        );
        return redirectWithCookies(deps.twitch.authorizeUrl(pending.state), [cookie]);
      },
    },
  },
});
