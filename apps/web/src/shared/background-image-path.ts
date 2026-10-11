// L'adresse de l'image du fond d'une fresque (Écart §9.1, JOURNAL 2026-10-10) : l'instant de l'image la date, donc le cache d'un an
// du navigateur ne la garde jamais périmée. Le même domaine que la page : la CSP n'a rien de plus à autoriser.

export const backgroundImagePath = (login: string, at: number): string =>
  `/${encodeURIComponent(login)}/background?v=${at}`;
