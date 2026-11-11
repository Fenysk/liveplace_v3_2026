// `POST /dev/timelapse` : le GIF timelapse du développeur, une ligne JSON par événement (JOURNAL 2026-11-11). `dev` fait 3 caractères :
// ce n'est jamais un pseudo Twitch, `$login.tsx` ne le prend pas. Jamais en GET.

import { createFileRoute } from "@tanstack/react-router";
import { timelapseResponse } from "../../ui/developer/timelapse-response";

export const Route = createFileRoute("/dev/timelapse")({
  server: {
    handlers: {
      POST: ({ request, context: { deps } }) =>
        timelapseResponse(
          {
            source: deps.timelapseSource,
            chunks: deps.chunkReader,
            verifier: deps.verifier,
            publicUrl: deps.publicUrl,
          },
          request,
        ),
    },
  },
});
