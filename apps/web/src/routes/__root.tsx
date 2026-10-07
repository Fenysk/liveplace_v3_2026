// La coquille HTML commune à toutes les pages.

import { createRootRouteWithContext, HeadContent, ScriptOnce, Scripts } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import type { ReactNode } from "react";
import type { CanvasOpener } from "../state/canvas-store";
import { ADSENSE_CLIENT } from "../ui/ads/adsense";
import { BetaBadge } from "../ui/beta/beta-badge";
import betaBadgeCss from "../ui/beta/beta-badge.css?url";
import designSystemCss from "../ui/design/design-system.css?url";
import { THEME_SCRIPT } from "../ui/design/theme";
import { resolveLocale } from "../ui/locale/locale";
import { LocaleProvider, useLocale } from "../ui/locale/use-locale";
import { OBS_VIEW_SCRIPT } from "../ui/obs/obs-view";

export type RouterContext = { openCanvas: CanvasOpener };

// Écart §11.1 (JOURNAL 2026-10-04) : l'étiquette d'un emplacement de bêta, `null` en production.
// Écart §14 (JOURNAL 2026-10-07) : et la langue de la page, d'après le cookie, sinon `Accept-Language`.
const getRootPage = createServerFn({ method: "GET" }).handler(({ context }) => ({
  betaLabel: context.deps.betaLabel,
  locale: resolveLocale({
    cookieHeader: getRequestHeader("cookie"),
    preferenceHeader: getRequestHeader("accept-language"),
  }),
}));

const RootDocument = ({ children }: { children: ReactNode }) => {
  const { betaLabel } = Route.useLoaderData();
  const locale = useLocale();
  return (
    // `data-theme` et `data-view` sont posés par script avant que React hydrate : un écart voulu, sur `<html>` seul.
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* Avant tout le reste : le thème est posé avant la première peinture (JOURNAL 2026-09-24). */}
        <ScriptOnce>{THEME_SCRIPT}</ScriptOnce>
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

// La langue vit dans `LocaleProvider` : le serveur la rend, puis le visiteur la change sans recharger.
const RootShell = ({ children }: { children: ReactNode }) => (
  <LocaleProvider initial={Route.useLoaderData().locale}>
    <RootDocument>{children}</RootDocument>
  </LocaleProvider>
);

export const Route = createRootRouteWithContext<RouterContext>()({
  loader: () => getRootPage(),
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
  shellComponent: RootShell,
});
