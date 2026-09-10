# Scroll restoration par route

> **Règle :** `scrollRestoration` est global sur le routeur — pas d'opt-out par route → choisir `resetScroll`, `getScrollRestorationKey` ou gestion manuelle selon le besoin.

### ❌ Avant — opt-out sur la route
```tsx
// router.tsx
const router = createRouter({
  scrollRestoration: true,
})

// routes/favorite.tsx
export const Route = createFileRoute('/favorite')({
  scrollRestoration: false, // ❌ option inexistante sur createFileRoute
  component: FavoritePage,
})
```
Opt-out par route impossible · docs tierces parfois fausses · comportement imprévisible si on tente quand même.

**Le faux ami** — couper la restauration globalement :
```tsx
const router = createRouter({
  scrollRestoration: false, // ⚠️ désactive tout, y compris les autres pages
})
```

### ✅ Après — trois leviers selon le besoin
```tsx
// router.tsx — exclure certaines routes du cache de restauration (retour arrière)
const router = createRouter({
  scrollRestoration: true,
  getScrollRestorationKey: (location) => {
    const noRestore = ['/favorite']
    return noRestore.includes(location.pathname)
      ? location.pathname
      : location.state.__TSR_key!
  },
})

// Lien / navigation — ne pas remonter en haut à l'arrivée
<Link to="/favorite" resetScroll={false}>Favoris</Link>

navigate({ to: '/favorite', resetScroll: false })
redirect({ to: '/favorite', resetScroll: false })

// Liste virtualisée / scroll infini — gestion manuelle sur l'élément
function InfiniteList() {
  const scrollRestorationId = 'favorite-list'
  const scrollEntry = useElementScrollRestoration({ id: scrollRestorationId })

  return (
    <div
      data-scroll-restoration-id={scrollRestorationId}
      className="overflow-auto"
    >
      {/* initialOffset: scrollEntry?.scrollY si virtualizer */}
    </div>
  )
}
```
Comportement ciblé · reste du site inchangé · couvre arrivée, retour arrière et scroll custom.

### Les 3 leviers qui font tout
| Besoin | API | Rôle |
|---|---|---|
| Ne pas remonter en haut à l'arrivée | `resetScroll={false}` sur `Link` / `navigate` / `redirect` | Empêche reset ou restore pour **cette** navigation |
| Ne pas restaurer au retour arrière | `getScrollRestorationKey` dans `createRouter` | Exclut une route du cache historique |
| Scroll dans un conteneur (virtualisation, infini) | `useElementScrollRestoration` + `data-scroll-restoration-id` | Restaure le scroll de **l'élément**, pas seulement `window` |

### Pourquoi ça marche
- `scrollRestoration: true` active un cache sessionStorage (`tsr-scroll-restoration-v1_3`) et force `history.scrollRestoration = 'manual'` : le routeur gère tout, pas le navigateur.
- `resetScroll` agit **par navigation** : `false` = ni restore (historique existant) ni scroll-to-top (nouvelle entrée).
- `getScrollRestorationKey` contrôle **quelle clé** identifie la position en cache : une clé fixe par pathname empêche la restauration « historique » sur cette route.
- Le scroll de `window` ne peut pas être totalement désactivé pour une seule route tant que `scrollRestoration: true` (limitation connue).

### Gotchas
- `resetScroll={false}` ne désactive pas la restauration **globale** : il faut le mettre sur **chaque** lien / `navigate` concerné.
- Au refresh (F5), le routeur tente de restaurer la position alors que le contenu SSR/hydraté peut avoir une hauteur différente → sauts visuels sur listes infinies.
- `scrollToTopSelectors` ne concerne que le scroll-to-top à l'arrivée, pas la restauration au retour arrière.
- `scrollToTopSelectors` inclut toujours `window`, qui ne peut pas être retiré.
