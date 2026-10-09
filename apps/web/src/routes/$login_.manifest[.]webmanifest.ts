// `/{login}/manifest.webmanifest` : le manifest d'application web du canvas (Écart §9.1, JOURNAL 2026-10-08).

import { createFileRoute } from "@tanstack/react-router";
import { webManifestResponse } from "../ui/pwa/web-manifest";

export const Route = createFileRoute("/$login_/manifest.webmanifest")({
  server: {
    handlers: {
      GET: ({ params, context }) => webManifestResponse(context.deps.durable, params.login),
    },
  },
});
