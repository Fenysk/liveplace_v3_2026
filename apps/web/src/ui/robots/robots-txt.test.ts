import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { robotsTxtResponse } from "./robots-txt";

const PUBLIC_URL = "https://liveplace.example";

type Rule = { isAllowed: boolean; pattern: string };
type Section = { agents: string[]; rules: Rule[] };

// RFC 9309 : des lignes `User-agent` qui se suivent ouvrent une seule section, ses règles viennent après.
const parseSections = (text: string): Section[] => {
  const sections: Section[] = [];
  let isOpeningAgents = false;
  for (const line of text.split("\n")) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (field === "user-agent") {
      if (!isOpeningAgents) sections.push({ agents: [], rules: [] });
      sections.at(-1)?.agents.push(value.toLowerCase());
      isOpeningAgents = true;
    } else if (field === "allow" || field === "disallow") {
      isOpeningAgents = false;
      sections.at(-1)?.rules.push({ isAllowed: field === "allow", pattern: value });
    }
  }
  return sections;
};

const matchesPath = (pattern: string, path: string): boolean => {
  const isAnchored = pattern.endsWith("$");
  const body = (isAnchored ? pattern.slice(0, -1) : pattern)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${isAnchored ? "$" : ""}`).test(path);
};

// Le robot lit les sections qui le nomment, sinon celles de `*` ; la règle la plus longue gagne, `Allow` à égalité.
const isAllowed = (text: string, robot: string, path: string): boolean => {
  const sections = parseSections(text);
  const named = sections.filter((section) => section.agents.includes(robot.toLowerCase()));
  const applicable = named.length > 0 ? named : sections.filter((section) => section.agents.includes("*"));
  const [winner] = applicable
    .flatMap((section) => section.rules)
    .filter((rule) => rule.pattern !== "" && matchesPath(rule.pattern, path))
    .sort((a, b) => b.pattern.length - a.pattern.length || Number(b.isAllowed) - Number(a.isAllowed));
  return winner?.isAllowed ?? true;
};

const PREVIEW_ROBOTS = [
  "Twitterbot",
  "facebookexternalhit",
  "Discordbot",
  "Slackbot-LinkExpanding",
  "TelegramBot",
  "WhatsApp",
  "LinkedInBot",
];

describe("le fichier robots.txt", () => {
  // Quand un robot lit `/robots.txt`, le système doit le servir en texte brut, gardé un jour comme `/ads.txt`
  it("serves the rules as plain text kept for a day", async () => {
    const response = robotsTxtResponse(PUBLIC_URL);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("public, max-age=86400");
    expect(await response.text()).toBe(
      [
        "User-agent: *",
        "Allow: /$",
        "Allow: /ads.txt",
        "Allow: /sitemap.xml",
        "Allow: /assets/",
        "Allow: /og-home.png",
        "Allow: /og-home-en.png",
        "Allow: /favicon.ico",
        "Allow: /icon-192.png",
        "Allow: /icon-512.png",
        "Allow: /icon-maskable-512.png",
        "Allow: /apple-touch-icon.png",
        "Disallow: /",
        "",
        "User-agent: Mediapartners-Google",
        "Allow: /",
        "",
        "User-agent: Twitterbot",
        "User-agent: facebookexternalhit",
        "User-agent: Discordbot",
        "User-agent: Slackbot-LinkExpanding",
        "User-agent: TelegramBot",
        "User-agent: WhatsApp",
        "User-agent: LinkedInBot",
        "Allow: /",
        "",
        `Sitemap: ${PUBLIC_URL}/sitemap.xml`,
        "",
      ].join("\n"),
    );
  });

  // Quand un moteur de recherche lit les règles, le système doit lui laisser la page d'accueil et lui fermer le reste
  it("lets a search engine index the home page only", async () => {
    const text = await robotsTxtResponse(PUBLIC_URL).text();

    expect(isAllowed(text, "Googlebot", "/")).toBe(true);
    expect(isAllowed(text, "Googlebot", "/fenysk")).toBe(false);
    expect(isAllowed(text, "Googlebot", "/fenysk/obs")).toBe(false);
    expect(isAllowed(text, "Googlebot", "/fenysk/preview.png")).toBe(false);
    expect(isAllowed(text, "Googlebot", "/confidentialite")).toBe(false);
    expect(isAllowed(text, "Bingbot", "/fenysk")).toBe(false);
  });

  // Quand le robot d'AdSense ou un robot d'aperçu lit les règles, le système doit lui laisser la page d'un canvas
  it("lets the AdSense robot and the link preview robots read a canvas page", async () => {
    const text = await robotsTxtResponse(PUBLIC_URL).text();

    for (const robot of ["Mediapartners-Google", ...PREVIEW_ROBOTS]) {
      expect(isAllowed(text, robot, "/fenysk")).toBe(true);
      expect(isAllowed(text, robot, "/fenysk/obs")).toBe(true);
      expect(isAllowed(text, robot, "/fenysk/preview.png")).toBe(true);
    }
  });

  // Quand Google vérifie les vendeurs, le système doit laisser `/ads.txt` à tous les robots
  it("lets every robot read ads.txt", async () => {
    const text = await robotsTxtResponse(PUBLIC_URL).text();

    for (const robot of ["Googlebot", "Bingbot", "Mediapartners-Google", ...PREVIEW_ROBOTS])
      expect(isAllowed(text, robot, "/ads.txt")).toBe(true);
  });

  // Quand Google affiche la page d'accueil, le système doit lui laisser ses fichiers : styles, scripts, polices, icônes, image, plan du site
  it("lets a search engine read what the home page needs to show", async () => {
    const text = await robotsTxtResponse(PUBLIC_URL).text();

    for (const path of [
      "/assets/index-a1b2c3.js",
      "/assets/home-d4e5f6.css",
      "/assets/nunito-latin-wght-normal.woff2",
    ])
      expect(isAllowed(text, "Googlebot", path)).toBe(true);
    expect(isAllowed(text, "Googlebot", "/og-home.png?v=1")).toBe(true);
    expect(isAllowed(text, "Googlebot", "/og-home-en.png?v=1")).toBe(true);
    expect(isAllowed(text, "Googlebot", "/sitemap.xml")).toBe(true);
    expect(isAllowed(text, "Bingbot", "/assets/index-a1b2c3.js")).toBe(true);
  });

  // Tout fichier du dossier `public` doit être lisible par un moteur de recherche : une icône ajoutée sans règle se verrait refusée
  it("lets a search engine read every file of the public folder", async () => {
    const text = await robotsTxtResponse(PUBLIC_URL).text();
    const files = readdirSync(new URL("../../../public", import.meta.url));

    expect(files).toContain("og-home.png");
    expect(files).toContain("og-home-en.png");
    for (const file of files) expect(isAllowed(text, "Googlebot", `/${file}`)).toBe(true);
  });

  // Si une page n'est pas l'accueil ni un de ses fichiers, alors le système doit la fermer aux moteurs de recherche
  it("keeps every other path closed to a search engine, close names included", async () => {
    const text = await robotsTxtResponse(PUBLIC_URL).text();

    for (const path of [
      "/assets",
      "/assets-private/x.js",
      "/auth/twitch",
      "/twitch/eventsub",
      "/_serverFn/abc",
      "/fenysk/manifest.webmanifest",
      "/fenysk/archives/ABCD",
      "/og-home.jpg",
      "/?utm_source=x",
    ])
      expect(isAllowed(text, "Googlebot", path)).toBe(false);
  });

  // Quand un moteur de recherche lit les règles, le système doit lui donner le plan du site à l'adresse publique du serveur
  it("announces the sitemap on the public address of the server, once", async () => {
    const local = await robotsTxtResponse("http://localhost:3150").text();
    const production = await robotsTxtResponse("https://liveplace.tv").text();

    expect(local.match(/^Sitemap:/gm)).toEqual(["Sitemap:"]);
    expect(local).toContain("Sitemap: http://localhost:3150/sitemap.xml\n");
    expect(production).toContain("Sitemap: https://liveplace.tv/sitemap.xml\n");
    expect(production).not.toContain("localhost");
  });
});
