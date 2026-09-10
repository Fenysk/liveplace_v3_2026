# CRUD : Read avant Write

> **Règle :** valider toute la chaîne de lecture (domain → server → query → liste) avant d’ajouter create / update / delete → les mutations deviennent « écrire puis invalider la lecture ».

### ❌ Avant — formulaire et mutations en premier
```tsx
// 1. UI de création branchée tout de suite
function NewTodoCard() {
  const saveTodo = useServerFn(saveTodoFn); // ❌ saveTodoFn pas encore fiable
  const saveMutation = useMutation({
    mutationFn: (content) => saveTodo({ data: content }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["todos"] }), // ❌ clé ad-hoc
  });
  // …
}

// 2. liste encore vide / mock local — impossible de vérifier l’invalidation
```
Impossible de savoir si le bug est dans l’écriture, le cache ou l’UI · clés Query dupliquées · debug en parallèle sur 4 couches.

**Le faux ami** — tout coder côté server d’un coup puis brancher l’UI :
```ts
// todo.server.ts — fetch + save + update + delete d’un bloc
export const fetchAllTodos = …;
export const saveOneTodo = …;
export const updateOneTodo = …;
export const deleteOneTodo = …;
// ⚠️ sans écran liste + queryOptions, aucune preuve que la lecture fonctionne
```

### ✅ Après — lecture d’abord, écriture ensuite
```ts
// 1. domain/todo/schemas.ts — contrat
export const TodoSchema = z.object({ id: z.uuid(), content: z.string().min(1), … });

// 2. server/todo/todo.server.ts — fetchAllTodos seul
export const fetchAllTodos = async (): Promise<TodoList> => ({
  todos: todos.filter((todo) => !todo.deletedAt),
});

// 3. server/todo/todo.functions.ts + queries/todo.queries.ts
export const getTodosFn = createServerFn({ method: "GET" }).handler(() => fetchAllTodos());
export const todosQueryOptions = () =>
  queryOptions({ queryKey: ["todos", "list"], queryFn: () => getTodosFn() });

// 4. route liste : loader ensureQueryData + useSuspenseQuery
loader: ({ context }) => context.queryClient.ensureQueryData(todosQueryOptions()),

// 5. seulement ensuite — save + invalidate sur la même queryKey
onSuccess: () =>
  queryClient.invalidateQueries({ queryKey: todosQueryOptions().queryKey }),
```
Chaque couche testable isolément · une source de clés · mutations = rafraîchissement prévisible.

### Les 5 changements qui font tout
| Étape | Où | Rôle |
|---|---|---|
| Schemas + types | `domain/*/schemas.ts` | contrat partagé avant tout appel |
| `fetch*` (liste, puis détail) | `*.server.ts` | prouver l’accès données sans UI |
| `get*Fn` + `*QueryOptions` | `*.functions.ts` + `queries/` | chaîne lecture + cache |
| Route liste + `ensureQueryData` | `routes/` | valider domain → server → Query → écran |
| `save*` / `update*` / `delete*` + `useMutation` | server puis composants | écrire puis invalider la lecture existante |

### Pourquoi ça marche
- La lecture traverse toutes les couches : si la liste s’affiche, domain / server / Query / route sont alignés.
- Les mutations n’ont plus qu’à persister puis `invalidateQueries` sur la clé déjà utilisée par le loader — pas de second cache à inventer.
- Un bug d’écriture se diagnostique en une étape : la liste ne se met pas à jour, pas « rien ne marche ».

### Gotchas
- Ordre UI conseillé après la liste : détail → création → édition → suppression (pas tout en parallèle).
- Détail (`fetchOne` + `ensureQueryData`) avant les mutations si une route `$id` existe — sinon invalidation liste seule suffit souvent.
- Ne pas mélanger state local « succès » et cache Query : `mutation.status` + invalidation (voir `mutation-invalidate-query-options` dans tanstack-query).
- Soft delete : filtrer en lecture (`!deletedAt`) avant d’ajouter `deleteOne*` — voir `soft-delete-filter-reads` dans server-data.
