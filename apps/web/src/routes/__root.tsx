// La coquille HTML commune à toutes les pages.

import { createRootRouteWithContext, HeadContent, ScriptOnce, Scripts } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import type { ReactNode } from "react";
import type { CanvasOpener } from "../state/canvas-store";
import { ADSENSE_CLIENT } from "../ui/ads/adsense";
import { BetaBadge } from "../ui/beta/beta-badge";
import betaBadgeCss from "../ui/beta/beta-badge.css?url";
import { APPEARANCE_SCRIPT } from "../ui/design/appearance";
import designSystemCss from "../ui/design/design-system.css?url";
import { OBS_VIEW_SCRIPT } from "../ui/obs/obs-view";

export type RouterContext = { openCanvas: CanvasOpener };

// Écart §11.1 (JOURNAL 2026-10-04) : l'étiquette d'un emplacement de bêta, `null` en production.
const getBetaLabel = createServerFn({ method: "GET" }).handler(({ context }) => context.deps.betaLabel);

const RootDocument = ({ children }: { children: ReactNode }) => {
  const betaLabel = Route.useLoaderData();
  return (
    // `data-appearance` et `data-view` sont posés par script avant que React hydrate : un écart voulu, sur `<html>` seul.
    <html lang="fr" suppressHydrationWarning>
      <head>
        {/* Avant tout le reste : l'apparence est posée avant la première peinture (JOURNAL 2026-09-24). */}
        <ScriptOnce>{APPEARANCE_SCRIPT}</ScriptOnce>
        {/* Et la vue OBS : l'interface ne passe jamais sur le stream (JOURNAL 2026-09-25). */}
        <ScriptOnce>{OBS_VIEW_SCRIPT}</ScriptOnce>
        <HeadContent />
      </head>
      <body>
        {children}
        <BetaBadge label={betaLabel} />
        <Scripts />
      </body>
    </html>
  );
};

export const Route = createRootRouteWithContext<RouterContext>()({
  loader: () => getBetaLabel(),
  staleTime: Number.POSITIVE_INFINITY, // lue une fois : elle ne change qu'au déploiement
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "LivePlace" },
      // Connecte le site à AdSense sans charger de script : rien de Google chez le visiteur.
      { name: "google-adsense-account", content: ADSENSE_CLIENT },
    ],
    // Un `link` et non un `import "…css"` : la page rendue par le serveur arrive déjà stylée.
    links: [
      { rel: "stylesheet", href: designSystemCss },
      { rel: "stylesheet", href: betaBadgeCss },
    ],
  }),
  shellComponent: RootDocument,
});
