// `/auth/twitch/callback` : vérifie le `state`, connecte, pose le cookie de session (§10.1).

import { SESSION_COOKIE, SESSION_TTL_SECONDS } from "@liveplace/domain";
import { cookieValue, serializeCookie } from "@liveplace/shared";
import { createFileRoute } from "@tanstack/react-router";
import { redirectWithCookies } from "../../shared/redirect";
import { OAUTH_COOKIE, parseOAuthCookie } from "../../usecase/oauth";
import { completeSignIn } from "../../usecase/sign-in";

export const Route = createFileRoute("/auth/twitch/callback")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const { deps } = context;
        const url = new URL(request.url);
        const pending = parseOAuthCookie(
          cookieValue(request.headers.get("cookie") ?? undefined, OAUTH_COOKIE),
        );
        // Le cookie de l'aller ne sert qu'une fois.
        const clearOAuth = serializeCookie(OAUTH_COOKIE, "", 0, deps.isSecure);

        // Sans le bon `state`, ce retour ne vient pas du navigateur qui est parti chez Twitch.
        if (!pending || url.searchParams.get("state") !== pending.state) {
          return new Response("Connexion refusée : state invalide.", {
            status: 400,
            headers: { "set-cookie": clearOAuth },
          });
        }

        const code = url.searchParams.get("code");
        // Refus sur l'écran de Twitch : retour sans session.
        if (!code) return redirectWithCookies(pending.returnPath ?? "/", [clearOAuth]);

        try {
          const { signedSession, login } = await completeSignIn(deps, code);
          const session = serializeCookie(SESSION_COOKIE, signedSession, SESSION_TTL_SECONDS, deps.isSecure);
          return redirectWithCookies(pending.returnPath ?? `/${login}`, [clearOAuth, session]);
        } catch (error) {
          console.error("Connexion Twitch en échec :", error instanceof Error ? error.message : error);
          return new Response("La connexion Twitch a échoué. Réessaie dans un instant.", {
            status: 502,
            headers: { "set-cookie": clearOAuth },
          });
        }
      },
    },
  },
});
