// `/auth/signout` : efface le cookie de session (§9.1).

import { SESSION_COOKIE } from "@liveplace/domain";
import { serializeCookie } from "@liveplace/shared";
import { createFileRoute } from "@tanstack/react-router";
import { redirectWithCookies } from "../../shared/redirect";
import { toReturnPath } from "../../usecase/oauth";

export const Route = createFileRoute("/auth/signout")({
  server: {
    handlers: {
      GET: ({ request, context }) => {
        const returnPath = toReturnPath(new URL(request.url).searchParams.get("returnTo"));
        return redirectWithCookies(returnPath ?? "/", [
          serializeCookie(SESSION_COOKIE, "", 0, context.deps.isSecure),
        ]);
      },
    },
  },
});
