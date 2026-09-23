// La coquille HTML commune à toutes les pages.

import { createRootRouteWithContext, HeadContent, Scripts } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { CanvasOpener } from "../state/canvas-store";
import { VOID_COLOR } from "../ui/canvas/render-scene";

export type RouterContext = { openCanvas: CanvasOpener };

const RootDocument = ({ children }: { children: ReactNode }) => (
  <html lang="fr">
    <head>
      <HeadContent />
    </head>
    <body
      style={{ margin: 0, background: VOID_COLOR, color: "#e8e6ee", fontFamily: "system-ui, sans-serif" }}
    >
      {children}
      <Scripts />
    </body>
  </html>
);

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "LivePlace" },
    ],
  }),
  shellComponent: RootDocument,
});
