// Le routeur de Start, construit sur l'arbre généré depuis `routes/`, et le câblage du web (§9.2).

import { createRouter } from "@tanstack/react-router";
import { createWsClient } from "../net/ws-client";
import { type CanvasMode, createCanvasStore } from "../state/canvas-store";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
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
