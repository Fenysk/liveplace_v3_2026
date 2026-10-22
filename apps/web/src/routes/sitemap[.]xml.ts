// `/sitemap.xml` : le plan du site, que `/robots.txt` annonce aux moteurs de recherche.

import { createFileRoute } from "@tanstack/react-router";
import { sitemapXmlResponse } from "../ui/sitemap/sitemap-xml";

export const Route = createFileRoute("/sitemap.xml")({
  server: { handlers: { GET: ({ context }) => sitemapXmlResponse(context.deps.publicUrl) } },
});
