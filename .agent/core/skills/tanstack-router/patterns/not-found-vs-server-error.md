# `notFound()` ≠ erreur serveur / parse invalide

> **Règle :** `notFound()` seulement si la ressource n’existe pas (404 HTTP) ; parse / 5xx / contrat cassé → `throw new Error(...)` → error UI.

### ❌ Avant — parse invalide traité comme 404
```ts
export const fetchOnePokemon = async (id: string): Promise<Pokemon> => {
  const response = await fetch(`${API}/${id}`);
  if (response.status === 404) throw notFound(); // ✅ vrai 404
  if (!response.ok) throw new Error(`Failed (${response.status})`);

  const parsed = PokemonSchema.safeParse(await response.json());
  if (!parsed.success) throw notFound(); // ❌ malformé ≠ absent
  return mapPokemon(parsed.data);
};
```
`notFoundComponent` sur un bug d’API · retry inutile · vrai 404 noyé.

**Le faux ami** — tout mapper en `notFound()` « pour une UI unique » :
```ts
if (!parsed.success) throw notFound(); // ⚠️ cache un contrat cassé derrière un empty/404
```

### ✅ Après — 404 strict, reste = Error
```ts
export const fetchOnePokemon = async (id: string): Promise<Pokemon> => {
  const response = await fetch(`${API}/${id}`);

  if (response.status === 404) throw notFound(); // ✅ ressource absente
  if (!response.ok)
    throw new Error(`Failed to fetch pokemon (${response.status})`);

  const parsed = PokemonSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error("Invalid pokemon API response");

  return mapPokemon(parsed.data);
};
```
404 = absence · Error = panne / contrat · `errorComponent` vs `notFoundComponent` alignés.

### Les 2 changements qui font tout
| Quoi | Où | Rôle |
|---|---|---|
| `throw notFound()` | statut HTTP 404 / id introuvable en store | sémantique « n’existe pas » |
| `throw new Error(...)` | `!ok`, `safeParse` fail, timeout | sémantique « a échoué » |

### Pourquoi ça marche
- TanStack Router / Start branchent `notFound()` vers `notFoundComponent` ; les autres erreurs vers `errorComponent`.
- Un JSON invalide signifie que **l’endpoint a répondu** mais le contrat a cassé — ce n’est pas une ressource manquante.

### Gotchas
- Complète [empty-list-vs-not-found](empty-list-vs-not-found.md) : liste vide = succès `[]` ; ici c’est **erreur vs 404** sur une ressource unique / parse.
- Soft-deleted traité comme absent → `notFound()` est OK si le produit le décide (item plus adressable).
- Logger le détail Zod / status **côté serveur** ; exposer un message générique au client si besoin.
