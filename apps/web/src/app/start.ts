// Le point d'entrée de Start : les dépendances du serveur, posées dans le contexte de chaque requête.
// Écart §9.2 (JOURNAL 2026-09-22) : `routes/` (couche ui) les lit là, sans importer l'infra.

import { createMiddleware, createStart } from "@tanstack/react-start";

const serverDepsMiddleware = createMiddleware({ type: "request" }).server(async ({ next }) => {
  // Import dynamique : Redis, Convex et jose n'entrent jamais dans le bundle du navigateur.
  const { getServerDeps } = await import("./server-deps");
  return next({ context: { deps: getServerDeps() } });
});

export const startInstance = createStart(() => ({ requestMiddleware: [serverDepsMiddleware] }));
