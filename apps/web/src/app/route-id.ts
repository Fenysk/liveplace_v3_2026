// La route servie pour un chemin, lue dans l'arbre des routes : jamais une expression du chemin (JOURNAL 2026-10-04).
// Jamais importé par le navigateur : voir `start.ts`.

import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// Un routeur pour le seul appariement : celui du rendu naît à chaque requête, avec son nonce (`router.tsx`).
const matcher = createRouter({
  routeTree,
  context: {
    openCanvas: () => {
      throw new Error("route-id : l'appariement n'ouvre jamais de canvas");
    },
  },
});

export const routeIdOf = (pathname: string): string | undefined => {
  const [, params, route] = matcher.getMatchedRoutes(pathname);
  // `**` : le chemin n'est celui d'aucune route, une 404 retombe sur la plus proche.
  return params["**"] === undefined ? route?.id : undefined;
};
