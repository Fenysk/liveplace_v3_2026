// L'aller-retour chez Twitch (§10.1) : le `state` attendu au retour, et le canvas où revenir.

export const OAUTH_COOKIE = "lp_oauth";
export const OAUTH_TTL_SECONDS = 10 * 60;

export type PendingSignIn = { state: string; returnPath: string | null };

// Exactement `/<pseudo>` : un pseudo Twitch, en minuscules dans les URL.
const CANVAS_PATH = /^\/[a-z0-9_]{1,25}$/;

// Écart §10.1 (JOURNAL 2026-09-22) : on revient sur le canvas d'où l'on s'est connecté, jamais ailleurs.
// Toute autre forme est refusée : une URL complète ferait une redirection ouverte.
export function toReturnPath(candidate: string | null | undefined): string | null {
  const path = candidate?.toLowerCase();
  return path && CANVAS_PATH.test(path) ? path : null;
}

export function toOAuthCookieValue(pending: PendingSignIn): string {
  return `${pending.state}|${pending.returnPath ?? ""}`;
}

// Le chemin se revalide au retour : un cookie trafiqué ne mène pas plus loin qu'un lien trafiqué.
export function parseOAuthCookie(value: string | undefined): PendingSignIn | null {
  const [state, returnPath] = value?.split("|") ?? [];
  if (!state) return null;
  return { state, returnPath: toReturnPath(returnPath) };
}
