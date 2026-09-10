---
name: tanstack-query
description: >-
  Recueil de patterns TanStack Query (cache, SSR, loaders, mutations)
  sous forme de cheat-sheet. Utiliser quand on branche Query sur TanStack
  Router / Start et qu'on veut appliquer le comportement documenté plutôt
  qu'une solution ad-hoc.
---

# TanStack Query

Sommaire des patterns disponibles. Chaque ligne indique quand l'appliquer.
Lire le fichier correspondant dans `patterns/` pour le détail et l'exemple de code.

- **`QueryClient` par requête SSR** — brancher Query sur le routeur Start/Router sans fuite de cache entre utilisateurs. → [patterns/query-client-per-ssr-request.md](patterns/query-client-per-ssr-request.md)
- **`ensureQueryData` + `useSuspenseQuery`** — précharger dans le `loader` et s’abonner dans le composant sans double fetch. → [patterns/ensure-query-data-suspense.md](patterns/ensure-query-data-suspense.md)
- **Mutation + invalidation via `queryOptions`** — après un `createServerFn` POST, rafraîchir le cache avec la même source de clés. → [patterns/mutation-invalidate-query-options.md](patterns/mutation-invalidate-query-options.md)

<!-- Ajouter une ligne par nouveau pattern -->