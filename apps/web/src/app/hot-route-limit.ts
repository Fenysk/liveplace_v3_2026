// Audit de sécurité n°4 : un attaquant qui boucle sur `GET /{login}` ou `GET /{login}/background?v=N` épuise le plafond de lectures
// de Convex. Un plafond par adresse sur les seules routes qui lisent Convex, et non sur tout le web : une visite charge ~40 fichiers
// (JS, CSS, polices), servis sans passer ici, mais seulement 2 à 4 requêtes qui lisent Convex (page, manifest, fond d'image).
// JOURNAL 2026-11-21 : pourquoi ici et pas dans Traefik.
import { clientIpOf, ipKeyOf } from "@liveplace/shared";
import { createRateLimiter, type RateLimiter } from "../shared/rate-limiter";

// À RÉGLER ICI. Une rafale de 200 : une école de 30 élèves qui ouvrent la même fresque à la fois (30 × 4 = 120), ou un streamer
// avec OBS et plusieurs onglets, passent sans se voir. Remplissage de 2 par seconde (120 par minute) : 30 élèves qui rechargent
// chacun une fois par minute passent encore ; une boucle isolée est tenue à 2 requêtes par seconde.
export const HOT_ROUTE_BURST = 200;
export const HOT_ROUTE_REFILL_PER_SECOND = 2;
// Adresses suivies en même temps : ~100 octets chacune, 50 000 font ~5 Mo.
const HOT_ROUTE_MAX_ADDRESSES = 50_000;

// Les routes qui lisent Convex : la page d'un canvas et ses sœurs (`/obs`, `/archives/{code}`, `/background`,
// `/manifest.webmanifest`, `/preview.png`), les pages à un seul segment, et les fonctions serveur (`/_serverFn/…`).
// Ni `/auth/*`, ni `/twitch/*`, ni `/kofi/*` : des webhooks arrivent par rafales des mêmes adresses. Ni `/healthz`, que la surveillance
// interroge sans lire Convex.
const HOT_PATH =
  /^\/(?:_serverFn\/.+|(?!healthz$)[^/]+(?:\/(?:obs|background|manifest\.webmanifest|preview\.png|archives\/[^/]+))?)$/;

type HotRouteLimit = (request: Request) => Response | null;

export function createHotRouteLimit(limiter: RateLimiter): HotRouteLimit {
  let warnedWithoutAddress = false;
  return (request) => {
    if (!HOT_PATH.test(new URL(request.url).pathname)) return null;
    // Derrière Traefik, la requête porte toujours `X-Forwarded-For`. Sans, rien à plafonner (le développement local).
    const ip = clientIpOf(request.headers.get("x-forwarded-for") ?? undefined, undefined);
    if (!ip) {
      if (!warnedWithoutAddress && import.meta.env.PROD) {
        warnedWithoutAddress = true;
        console.warn(
          "hot-route-limit : requête sans adresse de client, le plafond par adresse ne s'applique pas",
        );
      }
      return null;
    }
    const verdict = limiter.take(ipKeyOf(ip));
    if (verdict.allowed) return null;
    return new Response("Too Many Requests", {
      status: 429,
      headers: {
        "retry-after": String(verdict.retryAfterSeconds),
        "cache-control": "no-store",
        "content-type": "text/plain; charset=utf-8",
        "x-content-type-options": "nosniff",
      },
    });
  };
}

export const limitHotRoutes = createHotRouteLimit(
  createRateLimiter({
    capacity: HOT_ROUTE_BURST,
    refillPerSecond: HOT_ROUTE_REFILL_PER_SECOND,
    now: Date.now,
    maxKeys: HOT_ROUTE_MAX_ADDRESSES,
  }),
);
