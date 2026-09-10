# `ensureQueryData` + `useSuspenseQuery`

> **Règle :** le `loader` remplit le cache via `ensureQueryData(queryOptions)` ; le composant s’abonne avec `useSuspenseQuery` → une seule source, pas de second fetch.

### ❌ Avant — loader qui appelle directement la server fn
```tsx
export const Route = createFileRoute("/dashboard/todos")({
  loader: () => getTodosFn(), // ❌ data dans loaderData seulement · pas de cache Query
  component: () => {
    const data = Route.useLoaderData();
    return <ul>{/* ... */}</ul>;
  },
});
```
Pas de partage liste↔détail · mutation ne peut pas invalider proprement · refetch routeur ≠ cache Query.

**Le faux ami** — `useQuery` dans le composant **sans** `ensureQueryData` :
```tsx
loader: () => {}, // ⚠️ waterfall client · flash loading · SSR moins utile
const { data } = useQuery(todosQueryOptions());
```

### ✅ Après — options partagées, loader + suspense
```ts
// queries/todo.queries.ts
export const todosQueryOptions = () =>
  queryOptions({
    queryKey: ["todos", "list"] as const,
    queryFn: () => getTodosFn(),
  });
```

```tsx
export const Route = createFileRoute("/dashboard/todos")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(todosQueryOptions()),
  component: TodosPage,
});

function TodosPage() {
  const { data } = useSuspenseQuery(todosQueryOptions());
  return <ul>{/* data.todos */}</ul>;
}
```
Cache prêt avant render · même `queryKey` partout · `loaderData` encore utilisable pour `head`.

### Les 2 changements qui font tout
| Quoi | Où | Rôle |
|---|---|---|
| `queryOptions({ queryKey, queryFn })` | `*.queries.ts` | source unique loader / UI / invalidate |
| `ensureQueryData` + `useSuspenseQuery` | route | préfill puis abonnement |

### Pourquoi ça marche
- `ensureQueryData` fetch seulement si absent/stale ; le composant lit le même cache.
- `useSuspenseQuery` s’aligne sur le streaming SSR ; le `pendingComponent` de route couvre l’attente.
- `ensureQueryData` **retourne** la data → `head({ loaderData })` reste typé pour le SEO.

### Gotchas
- Dans `errorComponent`, `useQueryErrorResetBoundary().reset()` (via `useEffect`) avant `router.invalidate()` — sinon le retry Query reste bloqué sur l’erreur.
- Liste vide = succès (`[]`) ; ne pas mapper en `notFound()` (voir skill tanstack-router).
- Garder `defaultPreloadStaleTime: 0` côté routeur pour ne pas court-circuiter les loaders.
