// Le point d'entrée de Start : les dépendances du serveur, posées dans le contexte de chaque requête.
// §9.2 : `routes/` (couche ui) les lit là, sans importer l'infra.

import { createMiddleware, createStart } from "@tanstack/react-start";

const serverDepsMiddleware = createMiddleware({ type: "request" }).server(async ({ next }) => {
  // Import dynamique : Redis, Convex et jose n'entrent jamais dans le bundle du navigateur.
  const { getServerDeps } = await import("./server-deps");
  return next({ context: { deps: getServerDeps() } });
});

// JOURNAL 2026-09-29 : les en-têtes de sécurité, et le nonce que le routeur pose sur ses scripts (`router.tsx`).
const securityMiddleware = createMiddleware({ type: "request" })
  .middleware([serverDepsMiddleware])
  .server(async ({ request, next, context }) => {
    const { createNonce, refuseMethod, securityHeaders } = await import("./security-headers");
    const nonce = createNonce();
    const headers = securityHeaders({
      nonce,
      publicUrl: context.deps.publicUrl,
      isProduction: import.meta.env.PROD,
    });
    const refused = refuseMethod(request.method, headers);
    if (refused) return refused;
    const result = await next({ context: { nonce } });
    // Sur la réponse finale : une route serveur (`/auth/*`, `/twitch/eventsub`) ou une 404 rend la sienne.
    for (const [name, value] of Object.entries(headers)) result.response.headers.set(name, value);
    return result;
  });

export const startInstance = createStart(() => ({
  requestMiddleware: [serverDepsMiddleware, securityMiddleware],
}));
