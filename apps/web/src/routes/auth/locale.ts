// `/auth/locale` : `POST` retient la langue choisie dans le cookie `lp_locale`, `GET` dit celle qui est retenue (JOURNAL 2026-11-04).

import { createFileRoute } from "@tanstack/react-router";
import { pickLocaleResponse, savedLocaleResponse } from "../../ui/locale/locale-response";

export const Route = createFileRoute("/auth/locale")({
  server: {
    handlers: {
      GET: ({ request }) => savedLocaleResponse(request),
      POST: ({ request, context: { deps } }) =>
        pickLocaleResponse({ publicUrl: deps.publicUrl, isSecure: deps.isSecure }, request),
    },
  },
});
