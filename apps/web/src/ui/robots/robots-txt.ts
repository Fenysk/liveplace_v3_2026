// `/robots.txt` : rien n'est indexé sauf la page d'accueil et ce qu'il faut à Google pour l'afficher ; le robot d'AdSense et les
// robots d'aperçu de lien lisent tout. La réponse est séparée de la route pour se tester sans routeur.

// Ce que Google lit pour afficher la page d'accueil : le chemin le plus long gagne, ces `Allow` passent devant `Disallow: /`.
// Tout fichier de `apps/web/public` doit y être (le test le garde).
const OPEN_PATHS = [
  "/ads.txt",
  "/sitemap.xml",
  "/assets/", // styles, scripts et polices du build
  "/og-home.png",
  "/favicon.ico",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png",
];

const robotsTxtBody = (publicUrl: string): string =>
  [
    "User-agent: *",
    "Allow: /$",
    ...OPEN_PATHS.map((path) => `Allow: ${path}`),
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
    `Sitemap: ${publicUrl}/sitemap.xml`,
    "",
  ].join("\n");

export const robotsTxtResponse = (publicUrl: string): Response =>
  new Response(robotsTxtBody(publicUrl), {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=86400",
    },
  });
