// `/{login}/background` : l'image du fond de la fresque, servie par le web pour que la page ne charge rien d'une autre origine
// (la CSP reste `default-src 'self'`). Écart §9.1 (JOURNAL 2026-10-10).

import { createFileRoute } from "@tanstack/react-router";
import {
  backgroundImageResponse,
  uploadBackgroundImageResponse,
} from "../ui/canvas/background-image-response";

export const Route = createFileRoute("/$login_/background")({
  server: {
    handlers: {
      GET: ({ params, request, context }) =>
        backgroundImageResponse(
          context.deps.backgroundImages,
          params.login,
          new URL(request.url).searchParams.get("v"),
        ),
      POST: ({ request, context }) =>
        uploadBackgroundImageResponse(
          {
            verifier: context.deps.verifier,
            durable: context.deps.durable,
            redis: context.deps.archiveWrites,
          },
          request,
          request.headers.get("cookie") ?? undefined,
        ),
    },
  },
});
