# Liste vide ≠ `notFound`

> **Règle :** une collection vide est un succès (`[]`) ; `notFound()` réservé à une ressource unique absente → empty state via `length`, 404 via `notFound`.

### ❌ Avant — `notFound()` sur collection vide
```ts
export const fetchAllItems = async (): Promise<Item[]> => {
  const items = await db.items.findMany()
  if (!items.length) throw notFound() // ❌ liste vide ≠ ressource absente
  return items
}

export const fetchOneItem = async (id: string): Promise<Item> => {
  const item = await db.items.findById(id)
  if (!item) throw notFound()
  return item
}
```
Page 404 sur une liste légitime · empty state impossible · CTA « créer le premier » bloqué.

**Le faux ami** — customiser `notFoundComponent` pour afficher « Aucun élément » :
```ts
// ⚠️ même sémantique 404 ; mélange absence de route/ressource et absence de données
notFoundComponent: () => <p>Aucun élément</p>,
```

### ✅ Après — `[]` pour la collection, `notFound()` pour l’item
```ts
export const fetchAllItems = async (): Promise<Item[]> => {
  return await db.items.findMany() // ✅ [] = succès
}

export const fetchOneItem = async (id: string): Promise<Item> => {
  const item = await db.items.findById(id)
  if (!item) throw notFound() // ✅ seule la ressource unique
  return item
}

// UI : empty state sur le résultat, pas sur le statut
function ItemList({ items }: { items: Item[] }) {
  if (!items.length) return <p>Aucun élément</p>
  return <ul>{items.map((i) => <li key={i.id}>{i.name}</li>)}</ul>
}
```
200 + liste vide · empty state clair · `notFound` reste un vrai 404.

### Les 2 changements qui font tout
| Quoi | Où | Rôle |
|---|---|---|
| Retourner `[]` (pas `throw`) | fetch / loader de **collection** | succès HTTP ; empty state = `length === 0` |
| Garder `throw notFound()` | fetch / loader de **ressource unique** | 404 seulement quand l’entité n’existe pas |

### Pourquoi ça marche
- `notFound()` signifie « cette ressource / route n’existe pas » (404), pas « zéro résultat ».
- Une collection est une ressource qui **existe** même sans éléments — comme `GET /items` → `200 []` en REST.
- Séparer statut d’erreur et empty state évite de brancher l’UX vide sur `errorComponent` / `notFoundComponent`.

### Gotchas
- Filtre / recherche sans match → toujours `[]`, jamais `notFound()` (le endpoint est valide).
- Exception rare : la **route elle-même** est invalide (mauvais param de parent, slug de section inexistant) → `notFound()` avant même le fetch liste.
- Ne pas confondre avec une vraie erreur réseau / 5xx : ça reste un `throw new Error(...)`, pas un empty state.
