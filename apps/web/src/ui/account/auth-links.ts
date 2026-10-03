// Se connecter et se déconnecter depuis un canvas : écart §10.1 (JOURNAL 2026-09-22), on revient là d'où l'on part.

const returnTo = (login: string): string => encodeURIComponent(`/${login}`);

export const signInHref = (login: string): string => `/auth/twitch?returnTo=${returnTo(login)}`;

export const signOutHref = (login: string): string => `/auth/signout?returnTo=${returnTo(login)}`;

// §10.1 : la connexion qui demande aussi le droit de lire ses modérateurs et ses bans.
export const syncHref = (login: string): string => `${signInHref(login)}&sync=1`;
