---
name: tanstack-router
description: >-
  Recueil de patterns TanStack Router (navigation, scroll, loaders, SSR)
  sous forme de cheat-sheet. Utiliser quand on configure le routeur, une route
  ou une navigation et qu'on veut appliquer le comportement documenté plutôt
  qu'une solution ad-hoc.
---

# TanStack Router

Sommaire des patterns disponibles. Chaque ligne indique quand l'appliquer.
Lire le fichier correspondant dans `patterns/` pour le détail et l'exemple de code.

- **Scroll restoration par route** — `scrollRestoration: true` est global ; besoin de ne pas remonter en haut, de ne pas restaurer au retour arrière, ou de gérer une page à scroll infini. → [patterns/scroll-restoration.md](patterns/scroll-restoration.md)
- **Ordre `loader` avant `head`** — `head` lit `loaderData` et TS dit `never` / `useLoaderData()` est `| undefined`. → [patterns/loader-before-head.md](patterns/loader-before-head.md)
- **Meta `head` sur route enfant** — éviter charset/viewport dupliqués ; SEO (titre, image) depuis `loaderData`. → [patterns/child-route-head-meta.md](patterns/child-route-head-meta.md)
- **Thème SSR sans flash ni mismatch** — valeur lue du navigateur (thème, media query, `localStorage`) à afficher dès le premier render. → [patterns/ssr-theme-hydration.md](patterns/ssr-theme-hydration.md)
- **Liste vide ≠ `notFound`** — collection vide vs ressource unique absente ; empty state via `length`, 404 via `notFound()`. → [patterns/empty-list-vs-not-found.md](patterns/empty-list-vs-not-found.md)
- **`notFound` ≠ erreur serveur** — 404 seulement si la ressource est absente ; parse / 5xx → `Error` + `errorComponent`. → [patterns/not-found-vs-server-error.md](patterns/not-found-vs-server-error.md)

<!-- Ajouter une ligne par nouveau pattern -->
