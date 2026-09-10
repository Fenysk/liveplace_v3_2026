# Split server fn : logique vs transport

> **Règle :** `*.server.ts` = logique async (fetch, store, mapping) ; `*.functions.ts` = `createServerFn` + validators Zod qui délèguent → séparer métier et transport.

### ❌ Avant — tout dans un seul fichier server
```ts
// server/todo.ts
export const getTodoFn = createServerFn({ method: "GET" })
  .validator((id: string) => id) // ❌ pas de Zod schema partagé
  .handler(async ({ data: id }) => {
    const todo = todos.find((t) => t.id === id);
    if (!todo) throw notFound();
    return todo; // ❌ handler = logique + transport + types locaux
  });
```
Fichier monolithe · validators ad-hoc · difficile à tester / réutiliser hors Start.

**Le faux ami** — garder la logique dans le handler « parce que c’est plus court » :
```ts
.handler(async ({ data }) => {
  // 50 lignes de fetch + parse + map… // ⚠️ le validator Zod n’y change rien · le couplage reste
});
```

### ✅ Après — domain + server + functions
```ts
// domain/todo/schemas.ts
export const TodoIdSchema = z.uuid();

// server/todo/todo.server.ts
export const fetchOneTodo = async (todoId: TodoId): Promise<Todo> =>
  findActiveTodo(todoId);

// server/todo/todo.functions.ts
export const getTodoFn = createServerFn({ method: "GET" })
  .validator(TodoIdSchema)
  .handler(({ data }) => fetchOneTodo(data));
```
Métier testable · Zod comme contrat d’entrée · handlers fins.

### Les 3 changements qui font tout
| Quoi | Où | Rôle |
|---|---|---|
| Schemas + `z.infer` | `domain/*/schemas.ts` | contrat validation / types |
| `fetch*` / `save*` / `delete*` | `*.server.ts` | logique sans Start |
| `createServerFn` + `.validator` | `*.functions.ts` | transport HTTP RPC |

### Pourquoi ça marche
- Le handler ne fait que brancher l’entrée validée sur une fonction purement async.
- Les `queryFn` / `mutationFn` côté Query importent les `*Fn` ; le server reste ignorant de Query.
- Réappliquer le même squelette (Pokemon → Todo) sans recopier le boilerplate transport.

### Gotchas
- Ne pas réexporter les schemas runtime depuis `types.ts` (façade type-only — voir `zod-schema-type-facade` dans domain).
- Les imports UI passent par `@/server/.../*.functions` (ou queries), pas par `*.server.ts` directement si la logique doit rester server-only.
- `method: "GET"` pour les lectures, `"POST"` pour les écritures — même sur un update/delete soft.
