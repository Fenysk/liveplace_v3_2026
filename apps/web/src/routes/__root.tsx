// La coquille HTML commune à toutes les pages.

import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import type { ReactNode } from "react";

const RootDocument = ({ children }: { children: ReactNode }) => (
  <html lang="fr">
    <head>
      <HeadContent />
    </head>
    <body style={{ margin: 0, background: "#1b1d27", color: "#e8e6ee", fontFamily: "system-ui, sans-serif" }}>
      {children}
      <Scripts />
    </body>
  </html>
);

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "LivePlace" },
    ],
  }),
  shellComponent: RootDocument,
});
