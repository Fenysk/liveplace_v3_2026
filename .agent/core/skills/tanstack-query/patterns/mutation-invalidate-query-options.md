# Mutation + invalidation via `queryOptions`

> **Règle :** après un succès de mutation, invalider avec `queryOptions().queryKey` (et retourner la Promise) → le cache liste/détail se rafraîchit avant la fin de la mutation.

### ❌ Avant — état local manuel, pas d’invalidation
```tsx
const [status, setStatus] = useState<"idle" | "saving" | "success">("idle");
const saveTodo = useServerFn(saveTodoFn);

const handleSubmit = async (e) => {
  e.preventDefault();
  setStatus("saving");
  await saveTodo({ data: content });
  setStatus("success"); // ❌ la liste Query / loader reste stale
};
```
UI « succès » alors que la liste affiche encore l’ancien cache · double source de vérité.

**Le faux ami** — `queryClient.setQueryData` à la main sans stratégie claire :
```tsx
onSuccess: (todo) => {
  queryClient.setQueryData(["todos", "list"], (old) => /* merge ad-hoc */); // ⚠️ fragile dès que la shape évolue
};
```

### ✅ Après — `useMutation` + invalidate sur la clé partagée
```tsx
const queryClient = useQueryClient();
const saveTodo = useServerFn(saveTodoFn);

const saveTodoMutation = useMutation({
  mutationFn: (content: string) => saveTodo({ data: content }),
  onSuccess: () => {
    setContent("");
    return queryClient.invalidateQueries({
      queryKey: todosQueryOptions().queryKey,
    });
  },
});
```
Même clé que le loader · refetch cohérent · status dérivé de `mutation.status`.

### Les 2 changements qui font tout
| Quoi | Où | Rôle |
|---|---|---|
| `useMutation({ mutationFn, onSuccess })` | page formulaire | cycle de vie + états |
| `invalidateQueries({ queryKey: …queryOptions().queryKey })` | `onSuccess` | rafraîchir sans dupliquer les keys |

### Pourquoi ça marche
- `queryOptions` est la source unique : loader, suspense et invalidation partagent la même `queryKey`.
- Retourner la Promise d’`invalidateQueries` dans `onSuccess` attend le refetch avant de marquer la mutation terminée.
- Pour un détail + liste : invalider les deux keys (`list` et `detail`) en `Promise.all`.

### Gotchas
- Préfixer les keys (`["todos", "list"]`) permet d’invalider tout le domaine avec `{ queryKey: ["todos"] }` si besoin.
- Ne pas mélanger un state machine maison (`saving` / `success`) avec `useMutation` — `mutation.status` suffit.
- Soft-deleted : après delete, invalider **et** naviguer hors de la route détail (sinon `notFound` au prochain render).
