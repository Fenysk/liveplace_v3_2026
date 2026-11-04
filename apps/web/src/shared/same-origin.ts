// `SameSite=Lax` tient les sites étrangers à l'écart, mais pas un autre sous-domaine du même site, une bêta par exemple : le
// navigateur envoie `Origin` sur tout `POST`, et seule notre page porte celle du site (JOURNAL 2026-11-02). Comme le WebSocket du
// gateway, qui compare la même origine. Un en-tête absent est refusé. `publicUrl` : l'adresse du site, car derrière Traefik la
// requête arrive en http et c'est elle qui dit l'origine.
export const isFromOurPage = (request: Request, publicUrl: string): boolean =>
  request.headers.get("origin") === new URL(publicUrl).origin;
