# Conteneur arrondi + enfants avec fond

> **Règle :** un parent `rounded-*` + `border` dont les enfants ont un background opaque doit clipper → `overflow-hidden`.

### ❌ Avant — radius sans clip
```tsx
<main className="flex h-full min-h-0 rounded-xl border bg-background">
  <aside className="w-64 shrink-0 bg-sidebar">…</aside>
  <section className="flex-1 overflow-auto">…</section>
</main>
```
Coins « tronqués » / fond enfant qui déborde sur la courbe · border visuellement cassé.

**Le faux ami** — arrondir seulement l’enfant de bord :
```tsx
<aside className="w-64 shrink-0 rounded-l-xl bg-sidebar">…</aside>
{/* ⚠️ ne couvre pas tous les coins · fragile si layout / enfants changent */}
```

### ✅ Après — radius + overflow sur le parent
```tsx
<main className="flex h-full min-h-0 overflow-hidden rounded-xl border bg-background">
  <aside className="w-64 shrink-0 bg-sidebar">…</aside>
  <section className="flex-1 overflow-auto">…</section>
</main>
```
Courbe respectée · tous les coins clipés · une seule classe, fiable.

### Le 1 changement qui fait tout
| Quoi | Classe / ligne | Rôle |
|---|---|---|
| parent arrondi | `overflow-hidden` | clippe les backgrounds enfants dans le `border-radius` |

### Pourquoi ça marche
- `border-radius` arrondit la **boîte** du parent ; sans clip, les enfants peignent un rectangle plein qui masque la courbe.
- `overflow-hidden` force le clipping au contour arrondi — tous les coins, sans répéter le radius sur chaque enfant.

### Gotchas
- Peut couper focus rings / popovers / menus qui dépassent hors du conteneur — ancrer le scroll sur un enfant (`overflow-auto`), pas sur le parent clipé si besoin de portails.
- Inutile si aucun enfant n’a de fond opaque qui touche les coins.
