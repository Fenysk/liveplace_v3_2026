// `POST /twitch/eventsub` : ce que Twitch poste sur une chaîne synchronisée (JOURNAL 2026-09-27).

import { createFileRoute } from "@tanstack/react-router";
import { receiveTwitchWebhook } from "../../usecase/twitch-webhook";

export const Route = createFileRoute("/twitch/eventsub")({
  server: {
    handlers: {
      POST: async ({ request, context }) => {
        const header = (name: string) => request.headers.get(`Twitch-Eventsub-Message-${name}`) ?? "";
        const answer = await receiveTwitchWebhook(context.deps, {
          id: header("Id"),
          timestamp: header("Timestamp"),
          signature: header("Signature"),
          type: header("Type"),
          // Le corps brut : la signature porte sur ses octets, pas sur un JSON relu.
          body: await request.text(),
        });
        if (answer.status === 200)
          return new Response(answer.challenge, { status: 200, headers: { "content-type": "text/plain" } });
        return new Response(null, { status: answer.status });
      },
    },
  },
});
