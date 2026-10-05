// Écart §11.1 (JOURNAL 2026-10-04) : un emplacement de bêta, la même app, hors des moteurs de recherche.
// Jamais importé par le navigateur : voir `start.ts`.

export function betaHeaders(betaLabel: string | null): Record<string, string> {
  return betaLabel ? { "X-Robots-Tag": "noindex, nofollow" } : {};
}
