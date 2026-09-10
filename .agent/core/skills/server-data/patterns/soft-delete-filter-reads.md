# Soft delete : filtrer aussi en lecture

> **Règle :** poser `deletedAt` ne suffit pas — toute lecture doit ignorer les soft-deleted → helper `findActive*` + filtre liste.

### ❌ Avant — `deletedAt` écrit, jamais lu
```ts
const todos: Todo[] = [];

export const fetchAllTodos = async () => ({ todos }); // ❌ inclut les supprimés

export const fetchOneTodo = async (id: string) => {
  const todo = todos.find((t) => t.id === id); // ❌ trouve aussi deletedAt != null
  if (!todo) throw notFound();
  return todo;
};

export const deleteOneTodo = async (id: string) => {
  const todo = todos.find((t) => t.id === id);
  if (!todo) throw notFound();
  todo.deletedAt = new Date(); // écriture seule
  return todo;
};
```
Item « supprimé » encore listé · re-éditable · soft delete cosmétique.

**Le faux ami** — hard delete (`splice` / `filter` destructif) « pour simplifier » :
```ts
todos.splice(index, 1); // ⚠️ abandonne deletedAt · plus d’historique / undo / audit
```

### ✅ Après — une règle d’activité partagée
```ts
const todos: Todo[] = [];

const findActiveTodo = (id: string): Todo => {
  const todo = todos.find((t) => t.id === id && !t.deletedAt);
  if (!todo) throw notFound();
  return todo;
};

export const fetchAllTodos = async () => ({
  todos: todos.filter((t) => !t.deletedAt),
});

export const fetchOneTodo = async (id: string) => findActiveTodo(id);

export const updateOneTodo = async (id: string, content: string) => {
  const todo = findActiveTodo(id); // ✅ 404 si déjà soft-deleted
  todo.content = content;
  return todo;
};

export const deleteOneTodo = async (id: string) => {
  const todo = findActiveTodo(id);
  todo.deletedAt = new Date();
  return todo;
};
```
Liste sans fantômes · update/delete sur actif seulement · `deletedAt` a un sens.

### Les 2 changements qui font tout
| Quoi | Où | Rôle |
|---|---|---|
| `!t.deletedAt` | `find` / `filter` de lecture | exclure les soft-deleted |
| Helper `findActive*` | get / update / delete | une seule règle ; 404 si déjà archivé |

### Pourquoi ça marche
- Soft delete = **deux états** (actif / archivé). Sans filtre en lecture, l’état archivé n’existe que dans le champ, pas dans le comportement.
- Centraliser le prédicat évite qu’un nouveau endpoint oublie le filtre.

### Gotchas
- Une UI « corbeille » doit avoir un chemin **explicite** qui lit les `deletedAt != null` — ne pas réutiliser `findActive*`.
- En SQL : `WHERE deleted_at IS NULL` (ou scope ORM) sur les queries métier, pas seulement au `DELETE`.
- Ne pas renvoyer la référence brute du store mutable au client sans copie / sérialisation contrôlée.
