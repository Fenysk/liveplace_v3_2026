// `/auth/twitch/callback` : vérifie le `state`, connecte, pose le cookie de session (§10.1).

import { SESSION_COOKIE, SESSION_TTL_SECONDS } from "@liveplace/domain";
import { cookieValue, serializeCookie } from "@liveplace/shared";
import { createFileRoute } from "@tanstack/react-router";
import { redirectWithCookies } from "../../shared/redirect";
import { ACCOUNT_TEXTS } from "../../ui/account/account-texts";
import { resolveRequestLocale } from "../../ui/locale/locale";
import { OAUTH_COOKIE, parseOAuthCookie } from "../../usecase/oauth";
import { completeSignIn } from "../../usecase/sign-in";
import { completeTwitchSync } from "../../usecase/sync-twitch";

export const Route = createFileRoute("/auth/twitch/callback")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const { deps } = context;
        // Écart §14 (JOURNAL 2026-10-07) : le visiteur lit ces deux phrases brutes dans sa langue.
        const texts = ACCOUNT_TEXTS[resolveRequestLocale(request)];
        const url = new URL(request.url);
        const pending = parseOAuthCookie(
          cookieValue(request.headers.get("cookie") ?? undefined, OAUTH_COOKIE),
        );
        // Le cookie de l'aller ne sert qu'une fois.
        const clearOAuth = serializeCookie(OAUTH_COOKIE, "", 0, deps.isSecure);

        // Sans le bon `state`, ce retour ne vient pas du navigateur qui est parti chez Twitch.
        if (!pending || url.searchParams.get("state") !== pending.state) {
          return new Response(texts.signInRefused, {
            status: 400,
            headers: { "set-cookie": clearOAuth },
          });
        }

        const code = url.searchParams.get("code");
        // Refus sur l'écran de Twitch : retour sans session.
        if (!code) return redirectWithCookies(pending.returnPath ?? "/", [clearOAuth]);

        try {
          const { signedSession, login } =
            pending.purpose === "sync"
              ? await completeTwitchSync(deps, code, pending.returnPath)
              : await completeSignIn(deps, code, pending.returnPath);
          const session = serializeCookie(SESSION_COOKIE, signedSession, SESSION_TTL_SECONDS, deps.isSecure);
          return redirectWithCookies(pending.returnPath ?? `/${login}`, [clearOAuth, session]);
        } catch (error) {
          console.error("Connexion Twitch en échec :", error instanceof Error ? error.message : error);
          return new Response(texts.signInFailed, {
            status: 502,
            headers: { "set-cookie": clearOAuth },
          });
        }
      },
    },
  },
});
