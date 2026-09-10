# Meta `head` sur une route enfant

> **Règle :** dans une route enfant, n’émettre que les meta **spécifiques à la page** ; titre / description / image depuis `loaderData` → `head` allégé + SEO aligné sur la donnée chargée.

### ❌ Avant — meta documentaires + SEO depuis `params`
```tsx
export const Route = createFileRoute('/items/$itemId')({
  head: ({ params }) => {
    const title = `Item - ${params.itemId}` // slug brut, pas le vrai nom
    return {
      meta: [
        { charSet: 'utf-8' }, // déjà dans __root
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { title },
        { name: 'description', content: `Détails de ${params.itemId}` },
        { property: 'og:title', content: title },
        // pas d’og:image même si le loader la fournit
      ],
    }
  },
  loader: ({ params }): Promise<Item> => getItemFn({ data: params.itemId }),
  component: ItemPage,
})
```
Charset / viewport dupliqués · SEO sur le slug URL · image absente · ordre `head` avant `loader` fragile (voir `loader-before-head`).

**Le faux ami** — garder charset « pour être sûr » + image via spread :
```tsx
meta: [
  { charSet: 'utf-8' }, // ⚠️ toujours redondant avec __root
  { title },
  ...(image ? [{ property: 'og:image', content: image }] : []), // ⚠️ marche, mais bruyant à lire
]
```

### ✅ Après — meta de page + `loaderData` + `push` conditionnel
```tsx
export const Route = createFileRoute('/items/$itemId')({
  loader: ({ params }) => getItemFn({ data: params.itemId }),
  head: ({ params, loaderData }) => {
    const name = loaderData?.name ?? params.itemId
    const title = `Item - ${name}`
    const image = loaderData?.image

    const meta = [
      { title },
      { name: 'description', content: `Détails de ${name}` },
      { property: 'og:title', content: title },
      { name: 'twitter:card', content: image ? 'summary_large_image' : 'summary' },
    ]

    if (image) {
      meta.push(
        { property: 'og:image', content: image },
        { name: 'twitter:image', content: image },
      )
    }

    return { meta }
  },
  component: ItemPage,
})
```
Pas de doublon documentaire · titre lisible · image SEO quand dispo · `loader` avant `head` (inférence OK).

### Les 3 changements qui font tout
| Quoi | Où | Rôle |
|---|---|---|
| Retirer `charSet` / `viewport` | `head` de la route enfant | déjà déclarés dans `__root` ; la route ne gère que le contenu de page |
| `loaderData?.name ?? params…` | titre / description | SEO sur le libellé métier, fallback slug si pas encore chargé |
| `if (image) meta.push(…)` | meta optionnelles | ajoute og/twitter image sans spread conditionnel bruyant |

### Pourquoi ça marche
- `HeadContent` agrège root + routes actives : charset / viewport au root suffisent pour tout le document.
- `head` reçoit `loaderData` une fois le `loader` déclaré **avant** (voir [loader-before-head](loader-before-head.md)) : on peut baser le SEO sur l’entité résolue.
- Les tags absents (pas d’image) ne doivent pas apparaître : un `push` gardé derrière un `if` reste lisible et typé.

### Gotchas
- Dans `head`, `loaderData` est optionnel (`?`) — toujours un fallback (`params` / valeur neutre).
- Ne pas re-documenter l’ordre `loader` → `head` ici : c’est le sujet de `loader-before-head`.
- Adapter `twitter:card` (`summary` vs `summary_large_image`) selon la présence d’image évite une card « large » sans media.
