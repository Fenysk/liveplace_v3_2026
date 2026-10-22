import { describe, expect, it } from "vitest";
import { sitemapXmlResponse } from "./sitemap-xml";

describe("le plan du site", () => {
  // Quand un robot lit `/sitemap.xml`, le système doit le servir en XML, gardé un jour comme `/robots.txt`
  it("serves the sitemap as XML kept for a day", async () => {
    const response = sitemapXmlResponse("https://liveplace.example");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/xml; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("public, max-age=86400");
    expect(await response.text()).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        "  <url>",
        "    <loc>https://liveplace.example/</loc>",
        "  </url>",
        "</urlset>",
        "",
      ].join("\n"),
    );
  });

  // Les moteurs de recherche n'indexent que `/` : le plan ne liste rien d'autre, sur l'adresse publique du serveur
  it("lists the home page only, on the public address of the server", async () => {
    const text = await sitemapXmlResponse("http://localhost:3150").text();

    expect(text.match(/<loc>/g)).toHaveLength(1);
    expect(text).toContain("<loc>http://localhost:3150/</loc>");
    expect(text).not.toContain("liveplace.example");
  });
});
