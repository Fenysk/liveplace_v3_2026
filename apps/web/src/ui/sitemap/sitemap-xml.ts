// `/sitemap.xml` : le plan du site, la page d'accueil seule (Écart §9.1, JOURNAL 2026-10-22). Les moteurs de recherche n'indexent
// rien d'autre : les pages de canvas, la vue OBS et les archives n'y sont jamais.

export const sitemapXmlResponse = (publicUrl: string): Response =>
  new Response(
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      "  <url>",
      `    <loc>${publicUrl}/</loc>`,
      "  </url>",
      "</urlset>",
      "",
    ].join("\n"),
    {
      status: 200,
      headers: {
        "content-type": "application/xml; charset=utf-8",
        "cache-control": "public, max-age=86400",
      },
    },
  );
