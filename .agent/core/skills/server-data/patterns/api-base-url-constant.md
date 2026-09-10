# Constante d’URL de base API

> **Règle :** stocker le **chemin de ressource sans query** ; composer path / query au call site → une base, N endpoints.

### ❌ Avant — URL « liste » réutilisée via `split('?')`
```ts
const API_URL = 'https://api.example.com/v2/items?limit=9'

const list = await fetch(API_URL)

const baseUrl = API_URL.split('?')[0] // ❌ base dérivée d’une URL de liste
const detail = await fetch(`${baseUrl}/${id}`)
```
Base impure · détail dépend du format de la query · `split` fragile si `?` ailleurs.

**Le faux ami** — factoriser seulement le host :
```ts
const HOST = 'https://api.example.com'
await fetch(`${HOST}/v2/items?limit=9`)
await fetch(`${HOST}/v2/items/${id}`)
// ⚠️ `/v2/items` encore dupliqué ; pas mieux qu’une vraie base ressource
```

### ✅ Après — base ressource + composition locale
```ts
const API_BASE = 'https://api.example.com/v2/items'

const list = await fetch(`${API_BASE}?limit=9`)
if (!list.ok) throw new Error(`Failed to fetch items (${list.status})`)

const detail = await fetch(`${API_BASE}/${id}`)
if (detail.status === 404) throw notFound()
if (!detail.ok) throw new Error(`Failed to fetch item (${detail.status})`)
```
Une constante claire · query / id au call site · `response.ok` cohérent sur liste et détail.

### Les 2 changements qui font tout
| Quoi | Où | Rôle |
|---|---|---|
| `API_BASE` sans `?…` | constante module | chemin de ressource réutilisable |
| `` `${API_BASE}?limit=` `` / `` `${API_BASE}/${id}` `` | chaque handler | paramètres de requête locaux, pas dans la base |

### Pourquoi ça marche
- La query (`limit`, filtres) est un détail d’**un** appel ; la base décrit la collection / ressource.
- Composer depuis une base stable évite les hacks (`split('?')`, regex) dès qu’un 2ᵉ endpoint apparaît.
- Vérifier `response.ok` (et 404 → `notFound`) au même endroit que le `fetch` rend les erreurs HTTP visibles — `fetch` ne throw pas sur 4xx/5xx.

### Gotchas
- Trailing slash : choisir `…/items` **ou** `…/items/` et s’y tenir (`${BASE}/${id}` vs `${BASE}${id}`).
- Si plusieurs ressources (`/items`, `/users`), une base **par ressource** (ou un `API_ORIGIN` + paths) — pas une mega-URL fourre-tout.
- `response.ok` sur la liste évite de parser du JSON d’erreur comme une payload métier.
