# Ordre `loader` avant `head`

> **Règle :** si `head` lit `loaderData`, déclarer `loader` **avant** `head` dans `createFileRoute` → ordre d’inférence TanStack.

### ❌ Avant — `head` avant `loader`
```tsx
export const Route = createFileRoute('/pokemons/$pokemonId')({
  head: ({ loaderData }) => {
    const image = loaderData?.image // ❌ Property 'image' does not exist on type 'never'
    return { meta: [{ property: 'og:image', content: image }] }
  },
  loader: async ({ params }) => {
    return await getPokemonFn({ data: params.pokemonId })
  },
  component: PokemonDetailPage,
})

function PokemonDetailPage() {
  const pokemon = Route.useLoaderData() // ❌ possibly 'undefined'
  return <h1>{pokemon.name}</h1>
}
```
`loaderData` → `never` · `useLoaderData()` → `| undefined` · SEO image / UI cassés au typage.

**Le faux ami** — forcer le type de retour du loader :
```tsx
loader: ({ params }): Promise<Pokemon> => // ⚠️ combat l’inférence createServerFn
  getPokemonFn({ data: params.pokemonId }),
// ne répare pas l’ordre head → loader ; peut aggraver le collapse en `never`
```

### ✅ Après — `loader` puis `head`, sans annotation forcée
```tsx
export const Route = createFileRoute('/pokemons/$pokemonId')({
  loader: async ({ params }) => {
    return await getPokemonFn({ data: params.pokemonId })
  },
  head: ({ params, loaderData }) => {
    const image = loaderData?.image // ✅ Pokemon | undefined
    return {
      meta: [
        { title: `Pokemon - ${params.pokemonId}` },
        ...(image ? [{ property: 'og:image', content: image }] : []),
      ],
    }
  },
  component: PokemonDetailPage,
})

function PokemonDetailPage() {
  const pokemon = Route.useLoaderData() // ✅ Pokemon
  return <h1>{pokemon.name}</h1>
}
```
Inférence OK · `loaderData` typé · pas besoin de `Promise<Pokemon>` ni de typer `params` à la main.

### Les 2 changements qui font tout
| Quoi | Où | Rôle |
|---|---|---|
| `loader` **avant** `head` | objet `createFileRoute({...})` | TS connaît le type de retour du loader quand `head` référence `loaderData` |
| `async` + `await` sans `: Promise<T>` | callback `loader` | laisse propager le type de `createServerFn` jusqu’à `useLoaderData` |

### Pourquoi ça marche
- L’inférence de `createFileRoute` est **sensible à l’ordre** des propriétés (règle ESLint `@tanstack/router/create-route-property-order`) : `beforeLoad` → `loader` → … → `head`.
- `head` reçoit `loaderData` seulement une fois le type du `loader` déjà fixé ; sinon TypeScript collapse en `never`.
- Annoter `: Promise<T>` sur un loader qui appelle `createServerFn` crée souvent un conflit avec le type réel de la server function.

### Gotchas
- Dans `head`, `loaderData` reste **optionnel** (`?`) : normal (pas encore chargé / erreur) — garder `loaderData?.…`.
- Ordre critique complet (extrait) : `beforeLoad` → `loader` → `head` / `scripts` / `headers` ; les autres props (`component`, `pendingComponent`…) sont moins sensibles.
- Typer `params` à la main est redondant : ils sont déjà inférés depuis le path `/…/$pokemonId`.
