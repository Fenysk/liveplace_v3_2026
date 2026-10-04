import { describe, expect, it } from "vitest";
import {
  createNonce,
  policyFor,
  refuseMethod,
  type SecurityHeadersInput,
  securityHeaders,
} from "./security-headers";

const production: SecurityHeadersInput = {
  nonce: "abc123",
  publicUrl: "https://liveplace.tv",
  isProduction: true,
  policy: "strict",
};
const development: SecurityHeadersInput = {
  nonce: "abc123",
  publicUrl: "http://localhost:3000",
  isProduction: false,
  policy: "strict",
};

const policyOf = (input: SecurityHeadersInput): string =>
  securityHeaders(input)["Content-Security-Policy"] ?? "";

describe("securityHeaders (audit de sécurité §2)", () => {
  // Pose partout les en-têtes qui ne dépendent de rien
  it("sends the same base headers in every environment", () => {
    for (const input of [production, development])
      expect(securityHeaders(input)).toMatchObject({
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "strict-origin-when-cross-origin",
      });
  });

  // Force HTTPS un an, sans preload, seulement quand le site est servi en https
  it("forces HTTPS for a year only when the public URL is https", () => {
    expect(securityHeaders(production)["Strict-Transport-Security"]).toBe("max-age=31536000");
    expect(securityHeaders(development)).not.toHaveProperty("Strict-Transport-Security");
  });

  // En production, seuls les scripts du site et ceux qui portent le nonce de la requête s'exécutent
  it("runs only same-origin scripts and those carrying the request nonce", () => {
    const policy = policyOf(production);

    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("script-src 'self' 'nonce-abc123'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).not.toContain("unsafe");
  });

  // La page ouvre son WebSocket sur l'hôte public et montre les avatars Twitch
  it("lets the page open its socket on the public host and show Twitch avatars", () => {
    expect(policyOf(production)).toContain("connect-src 'self' wss://liveplace.tv");
    expect(policyOf(production)).toContain("img-src 'self' data: https://static-cdn.jtvnw.net");
    expect(policyOf({ ...production, publicUrl: "http://localhost:3000" })).toContain(
      "connect-src 'self' ws://localhost:3000",
    );
  });

  // Aucune CSP en dev : le serveur de Vite injecte ses propres scripts et styles
  it("sends no CSP in development", () => {
    expect(securityHeaders(development)).not.toHaveProperty("Content-Security-Policy");
  });
});

describe("securityHeaders, la CSP de Google sur /{login} (JOURNAL 2026-10-04)", () => {
  const adsense: SecurityHeadersInput = { ...production, policy: "adsense" };

  // Google ne prend en charge qu'une CSP stricte : un nonce et `strict-dynamic` pour les scripts, le reste ouvert
  it("lets scripts run through the nonce and strict-dynamic, and leaves the rest open", () => {
    const policy = policyOf(adsense);

    expect(policy).toContain("script-src 'nonce-abc123' 'strict-dynamic' https: 'unsafe-inline'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).not.toContain("default-src");
  });

  // Les autres en-têtes ne changent pas avec la politique, et le dev reste sans CSP
  it("keeps the other headers, and sends no CSP in development", () => {
    expect(securityHeaders(adsense)).toMatchObject({ "X-Frame-Options": "DENY" });
    expect(securityHeaders({ ...development, policy: "adsense" })).not.toHaveProperty(
      "Content-Security-Policy",
    );
  });
});

describe("policyFor", () => {
  // Seule la page de jeu charge Google : toute autre route, connue ou non, garde la stricte
  it("gives Google's policy to the canvas page alone", () => {
    expect(policyFor("/$login")).toBe("adsense");
    for (const routeId of ["/$login_/obs", "/", "/design", "/confidentialite", "/ads.txt", undefined])
      expect(policyFor(routeId)).toBe("strict");
  });
});

describe("createNonce", () => {
  // 16 octets neufs à chaque requête
  it("draws 16 fresh random bytes each time", () => {
    const first = createNonce();

    expect(Buffer.from(first, "base64")).toHaveLength(16);
    expect(createNonce()).not.toBe(first);
  });
});

describe("refuseMethod (audit de sécurité §4)", () => {
  // GET, HEAD et POST passent : les pages, les fonctions serveur et `/twitch/eventsub`
  it("lets GET, HEAD and POST through", () => {
    for (const method of ["GET", "HEAD", "POST"]) expect(refuseMethod(method, {})).toBeNull();
  });

  // Toute autre méthode reçoit un 405 qui nomme celles permises, avec les en-têtes de sécurité
  it("answers any other method with a 405 naming the allowed ones", () => {
    for (const method of ["TRACE", "PUT", "DELETE", "OPTIONS", "PATCH", "patch"]) {
      const refused = refuseMethod(method, { "X-Frame-Options": "DENY" });

      expect(refused?.status).toBe(405);
      expect(refused?.headers.get("Allow")).toBe("GET, HEAD, POST");
      expect(refused?.headers.get("X-Frame-Options")).toBe("DENY");
    }
  });
});
