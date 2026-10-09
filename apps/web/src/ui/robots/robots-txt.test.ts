import { describe, expect, it } from "vitest";
import { robotsTxtResponse } from "./robots-txt";

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
    const response = robotsTxtResponse();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("public, max-age=86400");
    expect(await response.text()).toBe(
      [
        "User-agent: *",
        "Allow: /$",
        "Allow: /ads.txt",
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
      ].join("\n"),
    );
  });

  // Quand un moteur de recherche lit les règles, le système doit lui laisser la page d'accueil et lui fermer le reste
  it("lets a search engine index the home page only", async () => {
    const text = await robotsTxtResponse().text();

    expect(isAllowed(text, "Googlebot", "/")).toBe(true);
    expect(isAllowed(text, "Googlebot", "/fenysk")).toBe(false);
    expect(isAllowed(text, "Googlebot", "/fenysk/obs")).toBe(false);
    expect(isAllowed(text, "Googlebot", "/confidentialite")).toBe(false);
    expect(isAllowed(text, "Bingbot", "/fenysk")).toBe(false);
  });

  // Quand le robot d'AdSense ou un robot d'aperçu lit les règles, le système doit lui laisser la page d'un canvas
  it("lets the AdSense robot and the link preview robots read a canvas page", async () => {
    const text = await robotsTxtResponse().text();

    for (const robot of ["Mediapartners-Google", ...PREVIEW_ROBOTS]) {
      expect(isAllowed(text, robot, "/fenysk")).toBe(true);
      expect(isAllowed(text, robot, "/fenysk/obs")).toBe(true);
    }
  });

  // Quand Google vérifie les vendeurs, le système doit laisser `/ads.txt` à tous les robots
  it("lets every robot read ads.txt", async () => {
    const text = await robotsTxtResponse().text();

    for (const robot of ["Googlebot", "Bingbot", "Mediapartners-Google", ...PREVIEW_ROBOTS])
      expect(isAllowed(text, robot, "/ads.txt")).toBe(true);
  });
});
