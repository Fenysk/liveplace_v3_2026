// Les en-têtes de sécurité de chaque réponse du web (audit de sécurité §2, JOURNAL 2026-09-29 et 2026-10-04).
// Jamais importé par le navigateur : voir `start.ts`.

import { randomBytes } from "node:crypto";

// `adsense` : celle de Google, pour la page de jeu seule. `strict` : celle du 2026-09-29, pour tout le reste.
export type CspPolicy = "strict" | "adsense";

export type SecurityHeadersInput = {
  nonce: string; // tiré à chaque requête : le routeur le pose sur chacun de ses scripts
  publicUrl: string; // en https, HTTPS forcé ; son hôte est celui du WebSocket
  isProduction: boolean;
  policy: CspPolicy;
};

// Une page n'arrive jamais sur `/{login}` par un `Link` : chaque page est servie avec sa propre CSP.
export const policyFor = (routeId: string | undefined): CspPolicy =>
  routeId === "/$login" ? "adsense" : "strict";

// Les avatars des profils (CDC 2026, Profils) : la seule image qui ne vient pas du site.
const TWITCH_AVATARS = "https://static-cdn.jtvnw.net";

// Pas de `preload` : il ne se défait pas. Pas d'`includeSubDomains` : les sous-domaines ne sont pas inventoriés.
const ONE_YEAR_OF_HTTPS = "max-age=31536000";

const strictPolicy = (nonce: string, publicUrl: URL): string => {
  const socketOrigin = `${publicUrl.protocol === "https:" ? "wss:" : "ws:"}//${publicUrl.host}`;
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    `img-src 'self' data: ${TWITCH_AVATARS}`,
    `connect-src 'self' ${socketOrigin}`,
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
};

// Celle que Google prend en charge : ses domaines changent, elle laisse le reste ouvert.
// `https:` et `'unsafe-inline'` ne servent qu'aux navigateurs qui ignorent `'strict-dynamic'`.
const adsensePolicy = (nonce: string): string =>
  [
    `script-src 'nonce-${nonce}' 'strict-dynamic' https: 'unsafe-inline'`,
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join("; ");

// Audit de sécurité §4 : ni TRACE, ni PUT, ni DELETE, ni OPTIONS. POST sert aux fonctions serveur et à `/twitch/eventsub`.
const ALLOWED_METHODS = ["GET", "HEAD", "POST"];

export function refuseMethod(method: string, headers: Record<string, string>): Response | null {
  if (ALLOWED_METHODS.includes(method.toUpperCase())) return null;
  const refusal = new Headers(headers);
  refusal.set("Allow", ALLOWED_METHODS.join(", "));
  return new Response(null, { status: 405, headers: refusal });
}

export function createNonce(): string {
  return randomBytes(16).toString("base64");
}

export function securityHeaders({
  nonce,
  publicUrl,
  isProduction,
  policy,
}: SecurityHeadersInput): Record<string, string> {
  const url = new URL(publicUrl);
  const headers: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  };
  if (url.protocol === "https:") headers["Strict-Transport-Security"] = ONE_YEAR_OF_HTTPS;
  // Pas de CSP en dev : le serveur de Vite injecte ses propres scripts et styles.
  if (isProduction)
    headers["Content-Security-Policy"] =
      policy === "adsense" ? adsensePolicy(nonce) : strictPolicy(nonce, url);
  return headers;
}
