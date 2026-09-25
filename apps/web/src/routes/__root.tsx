// La coquille HTML commune à toutes les pages.

import { createRootRouteWithContext, HeadContent, ScriptOnce, Scripts } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { CanvasOpener } from "../state/canvas-store";
import designSystemCss from "../ui/design/design-system.css?url";
import { THEME_SCRIPT } from "../ui/design/theme";
import { OBS_VIEW_SCRIPT } from "../ui/obs/obs-view";

export type RouterContext = { openCanvas: CanvasOpener };

const RootDocument = ({ children }: { children: ReactNode }) => (
  // `data-theme` et `data-view` sont posés par script avant que React hydrate : un écart voulu, sur `<html>` seul.
  <html lang="fr" suppressHydrationWarning>
    <head>
      {/* Avant tout le reste : le thème est posé avant la première peinture (JOURNAL 2026-09-24). */}
      <ScriptOnce>{THEME_SCRIPT}</ScriptOnce>
      {/* Et la vue OBS : l'interface ne passe jamais sur le stream (JOURNAL 2026-09-25). */}
      <ScriptOnce>{OBS_VIEW_SCRIPT}</ScriptOnce>
      <HeadContent />
    </head>
    <body>
      {children}
      <Scripts />
    </body>
  </html>
);

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "LivePlace" },
    ],
    // Un `link` et non un `import "…css"` : la page rendue par le serveur arrive déjà stylée.
    links: [{ rel: "stylesheet", href: designSystemCss }],
  }),
  shellComponent: RootDocument,
});
