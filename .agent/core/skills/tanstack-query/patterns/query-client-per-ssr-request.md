# `QueryClient` par requête SSR

> **Règle :** créer le `QueryClient` **dans** `getRouter()`, le passer au contexte routeur, et brancher `setupRouterSsrQueryIntegration` → un client par requête HTTP.

### ❌ Avant — loaders seuls, pas de cache Query
```ts
export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
  });
  return router; // ❌ pas de QueryClient · pas d’intégration SSR Query
}
```
Pas de cache partagé liste↔détail · refetch à chaque navigation · pas d’hydratation Query.

**Le faux ami** — un `QueryClient` module-level « pour simplifier » :
```ts
const queryClient = new QueryClient(); // ⚠️ partagé entre requêtes SSR · fuite de cache entre utilisateurs
```

### ✅ Après — client local + intégration SSR
```ts
export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        retry: (failureCount, error) =>
          !isNotFound(error) && !isRedirect(error) && failureCount < 2,
      },
    },
  });

  const router = createTanStackRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0, // le routeur rejoue les loaders ; Query gère la fraîcheur
  });

  setupRouterSsrQueryIntegration({ router, queryClient });
  return router;
}
```
Cache isolé par requête · Provider monté par l’intégration · `notFound` / redirect non retriés.

### Les 3 changements qui font tout
| Quoi | Où | Rôle |
|---|---|---|
| `new QueryClient(...)` dans `getRouter` | `router.tsx` | pas de singleton SSR |
| `context: { queryClient }` | options routeur | loaders / root typés |
| `setupRouterSsrQueryIntegration` | après `createTanStackRouter` | dehydrate / stream + Provider |

### Pourquoi ça marche
- En SSR, chaque requête HTTP doit avoir son propre cache : un client global mélange les données entre utilisateurs.
- `defaultPreloadStaleTime: 0` laisse le **routeur** rappeler les loaders ; `staleTime` Query décide si le réseau est vraiment nécessaire.
- Sans `isNotFound` dans `retry`, un 404 est rejoué plusieurs fois avant le `notFoundComponent`.

### Gotchas
- Ne pas ajouter un second `QueryClientProvider` dans `__root.tsx` : l’intégration le monte déjà (`wrapQueryClient: true` par défaut).
- La root doit exposer le contexte : `createRootRouteWithContext<{ queryClient: QueryClient }>()`.
- Complète [ensure-query-data-suspense](ensure-query-data-suspense.md) pour le pattern loader ↔ composant.
