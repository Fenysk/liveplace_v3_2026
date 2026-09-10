# Type domaine partagé (liste + carte)

> **Règle :** un seul type domaine pour l’item API **et** les props de la carte → `type Item` + `List = { results: Item[] }` + `<Card {...item} />`.

### ❌ Avant — shapes dupliqués + props partielles
```tsx
// server
export type Item = { name: string; image: string | null }
export type ItemList = {
  results: Array<{ name: string }> // ❌ redit une partie de Item
}

// Card
type ItemCardProps = { name: string } // ❌ encore une copie partielle
const ItemCard = ({ name }: ItemCardProps) => { /* … */ }

// liste
<ItemCard name={item.name} /> // ❌ oublie image quand le domaine l’ajoute
```
Trois sources de vérité · champ oublié à chaque évolution · mapping manuel fragile.

**Le faux ami** — typer la carte depuis ses props et réimporter côté serveur :
```tsx
// Card.tsx
export type ItemCardProps = { name: string; image: string | null }
// server.ts
import type { ItemCardProps } from '@/components/ItemCard' // ⚠️ UI → domaine : dépendance inversée
```

### ✅ Après — type domaine unique + spread
```tsx
// server (ou module domain)
export type Item = {
  name: string
  image: string | null
}
export type ItemList = {
  results: Item[]
}

// Card
import type { Item } from '@/server/items'
const ItemCard = ({ name, image }: Item) => (
  <article>
    {image && <img src={image} alt={name} />}
    <h2>{name}</h2>
  </article>
)

// liste
{data.results.map((item) => (
  <li key={item.name}>
    <ItemCard {...item} />
  </li>
))}
```
Une shape · carte alignée sur l’API · nouvel attribut propagé sans toucher l’appelant.

### Les 3 changements qui font tout
| Quoi | Où | Rôle |
|---|---|---|
| `results: Item[]` | type liste | la liste ne redéfinit pas l’item |
| Props = `Item` | composant carte | même contrat que le loader / server fn |
| `{...item}` | appelant | tout champ domaine arrive sans listing manuel |

### Pourquoi ça marche
- Le type domaine vit **près de la source de données** ; l’UI l’importe — pas l’inverse.
- Spreader un item dont la carte attend exactement ce type évite les oublis (`image`, etc.).
- Évoluer `Item` (nouveau champ) force TypeScript à signaler les cartes / mappings incomplets.

### Gotchas
- Ne pas coller sur `Item` des props purement UI (`className`, `onSelect`) — étendre : `type ItemCardProps = Item & { className?: string }`.
- Si la carte n’utilise qu’un sous-ensemble, `Pick<Item, 'name' | 'image'>` reste dérivé du domaine (pas une 2ᵉ définition libre).
- Le spread suppose que la carte n’exige pas de props extras obligatoires sans défaut.
