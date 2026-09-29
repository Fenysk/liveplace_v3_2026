// Le routeur de Start, construit sur l'arbre généré depuis `routes/`, et le câblage du web (§9.2).

import { createRouter } from "@tanstack/react-router";
import { getGlobalStartContext } from "@tanstack/react-start";
import { createWsClient } from "../net/ws-client";
import { type CanvasMode, createCanvasStore } from "../state/canvas-store";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  // JOURNAL 2026-09-29 : le nonce de la requête, sur chaque script du rendu serveur. Le navigateur le relit dans la page.
  const nonce = getGlobalStartContext()?.nonce;
  return createRouter({
    routeTree,
    scrollRestoration: true,
    ssr: nonce ? { nonce } : {},
    // `app/` est la seule couche qui voit `state/` et `net/` : elle les assemble ici.
    context: {
      openCanvas: (canvasId: string, mode: CanvasMode) =>
        createCanvasStore(canvasId, createWsClient(), {
          mode,
          now: Date.now,
          reload: () => window.location.reload(),
        }),
    },
  });
}
