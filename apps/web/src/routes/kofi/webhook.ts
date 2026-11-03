// `POST /kofi/webhook` : un don Ko-fi (JOURNAL 2026-11-03).

import { createFileRoute } from "@tanstack/react-router";
import { kofiWebhookResponse } from "../../ui/kofi/kofi-webhook-response";

export const Route = createFileRoute("/kofi/webhook")({
  server: {
    handlers: {
      POST: ({ request, context: { deps } }) =>
        kofiWebhookResponse(
          { webhook: deps.kofiWebhook, now: deps.now, donations: deps.donations, redis: deps.redis },
          request,
        ),
    },
  },
});
