import { describe, expect, it } from "vitest";
import { createRateLimiter } from "../shared/rate-limiter";
import { createHotRouteLimit } from "./hot-route-limit";

function limitWith(capacity: number) {
  return createHotRouteLimit(
    createRateLimiter({ capacity, refillPerSecond: 0.001, now: () => 0, maxKeys: 100 }),
  );
}

function request(path: string, forwardedFor?: string): Request {
  const headers = new Headers();
  if (forwardedFor) headers.set("x-forwarded-for", forwardedFor);
  return new Request(`https://liveplace.test${path}`, { headers });
}

describe("createHotRouteLimit", () => {
  // Une boucle sur la page d'une fresque est refusée en 429 avec un délai, puis une autre adresse passe encore.
  it("refuses a loop on a fresco page with a 429, and still serves another address", () => {
    const limit = limitWith(3);
    for (let i = 0; i < 3; i++) expect(limit(request("/fenysk", "203.0.113.7"))).toBeNull();
    const refused = limit(request("/fenysk", "203.0.113.7"));
    expect(refused?.status).toBe(429);
    expect(Number(refused?.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
    expect(limit(request("/fenysk", "203.0.113.8"))).toBeNull();
  });

  // Les fichiers de l'interface, les webhooks et la surveillance ne comptent jamais.
  it("never counts assets, webhooks or the health check", () => {
    const limit = limitWith(1);
    for (const path of [
      "/assets/app.js",
      "/auth/callback",
      "/twitch/eventsub",
      "/kofi/webhook",
      "/healthz",
      "/",
    ]) {
      for (let i = 0; i < 5; i++) expect(limit(request(path, "203.0.113.7"))).toBeNull();
    }
  });

  // Toutes les routes qui lisent Convex partagent le même seau par adresse.
  it("counts the pages, the background, the manifest and the server functions together", () => {
    const limit = limitWith(4);
    for (const path of ["/fenysk", "/fenysk/obs", "/fenysk/background", "/fenysk/manifest.webmanifest"]) {
      expect(limit(request(path, "203.0.113.7"))).toBeNull();
    }
    expect(limit(request("/_serverFn/abc", "203.0.113.7"))?.status).toBe(429);
  });

  // Une valeur gauche forgée dans X-Forwarded-For ne donne pas un seau neuf : seule l'entrée posée par Traefik, à droite, compte.
  it("ignores forged left entries of X-Forwarded-For", () => {
    const limit = limitWith(2);
    expect(limit(request("/fenysk", "1.1.1.1, 203.0.113.7"))).toBeNull();
    expect(limit(request("/fenysk", "2.2.2.2, 203.0.113.7"))).toBeNull();
    expect(limit(request("/fenysk", "3.3.3.3, 203.0.113.7"))?.status).toBe(429);
  });

  // Sans adresse de client (développement local, hors Traefik), rien n'est plafonné.
  it("does not limit a request without a client address", () => {
    const limit = limitWith(1);
    for (let i = 0; i < 5; i++) expect(limit(request("/fenysk"))).toBeNull();
  });
});
