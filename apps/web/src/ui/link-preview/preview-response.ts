// `/{login}/preview.png` : l'image du canvas pour la carte d'aperçu de son lien. Séparée de la route pour se tester sans routeur.

import type { CanvasPreviews } from "../../usecase/canvas-preview";
import { PREVIEW_SLICE_SECONDS } from "./link-preview";

export async function canvasPreviewResponse(previews: CanvasPreviews, login: string): Promise<Response> {
  const png = await previews.get(login);
  if (!png) return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
  return new Response(png, {
    status: 200,
    headers: { "content-type": "image/png", "cache-control": `public, max-age=${PREVIEW_SLICE_SECONDS}` },
  });
}
