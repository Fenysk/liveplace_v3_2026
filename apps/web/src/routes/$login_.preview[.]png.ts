// `/{login}/preview.png` : l'image du canvas dans la carte d'aperçu de son lien, rendue par le serveur du web.

import { createFileRoute } from "@tanstack/react-router";
import { canvasPreviewResponse } from "../ui/link-preview/preview-response";

export const Route = createFileRoute("/$login_/preview.png")({
  server: {
    handlers: {
      GET: ({ params, context }) => canvasPreviewResponse(context.deps.canvasPreviews, params.login),
    },
  },
});
