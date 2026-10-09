// `/robots.txt` : rien n'est indexé sauf la page d'accueil ; le robot d'AdSense et les robots d'aperçu de lien lisent tout.
// La réponse est séparée de la route pour se tester sans routeur.

const ROBOTS_TXT_BODY = [
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
].join("\n");

export const robotsTxtResponse = (): Response =>
  new Response(ROBOTS_TXT_BODY, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=86400",
    },
  });
