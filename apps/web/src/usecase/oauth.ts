// L'aller-retour chez Twitch (§10.1) : le `state` attendu au retour, le canvas où revenir, et le but.

import type { TwitchPurpose } from "@liveplace/domain/ports";

export const OAUTH_COOKIE = "lp_oauth";
export const OAUTH_TTL_SECONDS = 10 * 60;

// §10.1 : `sync`, le streamer synchronise sa chaîne ; sinon, une simple connexion.
export type PendingSignIn = { state: string; returnPath: string | null; purpose: TwitchPurpose };

// Exactement `/<pseudo>` : un pseudo Twitch, en minuscules dans les URL.
const CANVAS_PATH = /^\/[a-z0-9_]{1,25}$/;

// §10.1 : on revient sur le canvas d'où l'on s'est connecté, jamais ailleurs.
// Toute autre forme est refusée : une URL complète ferait une redirection ouverte.
export function toReturnPath(candidate: string | null | undefined): string | null {
  const path = candidate?.toLowerCase();
  return path && CANVAS_PATH.test(path) ? path : null;
}

export function toOAuthCookieValue(pending: PendingSignIn): string {
  return `${pending.state}|${pending.returnPath ?? ""}|${pending.purpose}`;
}

// Le chemin se revalide au retour : un cookie trafiqué ne mène pas plus loin qu'un lien trafiqué.
export function parseOAuthCookie(value: string | undefined): PendingSignIn | null {
  const [state, returnPath, purpose] = value?.split("|") ?? [];
  if (!state) return null;
  return { state, returnPath: toReturnPath(returnPath), purpose: purpose === "sync" ? "sync" : "signIn" };
}
