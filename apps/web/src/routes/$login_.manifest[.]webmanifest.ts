// `/{login}/manifest.webmanifest` : le manifest d'application web du canvas (§9.10).

import { createFileRoute } from "@tanstack/react-router";
import { webManifestResponse } from "../ui/pwa/web-manifest";

export const Route = createFileRoute("/$login_/manifest.webmanifest")({
  server: {
    handlers: {
      GET: ({ params, context }) => webManifestResponse(context.deps.durable, params.login),
    },
  },
});
