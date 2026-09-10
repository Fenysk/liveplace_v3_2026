# Shell plein viewport sous le header

> **Règle :** ne jamais compter sur `h-full` / `flex-1` pour remplir l’écran si le parent n’a qu’une hauteur de contenu → grille isolée `auto` + `1fr` avec `min-h-dvh`.

### ❌ Avant — flex + `min-h-screen` + enfant qui « devrait » grandir
```tsx
<body className="flex min-h-screen flex-col">
  <Header />
  <div className="flex-1 bg-gray-100">{children}</div>
  <Devtools />
  <Scripts />
</body>

// plus bas dans l’arbre
<main className="flex h-full">…</main>
```
Zone contenu reste à ~hauteur du texte · `h-full` ne résout rien · fond / sidebar ne descendent pas jusqu’en bas.

**Le faux ami** — coller la grille sur le `body` avec Devtools/Scripts dedans :
```tsx
<body className="grid min-h-dvh grid-rows-[auto_1fr]">
  <Header />
  <div className="bg-gray-100">{children}</div>
  <Devtools />   {/* ⚠️ 3ᵉ / 4ᵉ enfants → lignes implicites, casse le 1fr */}
  <Scripts />
</body>
```

### ✅ Après — grille à 2 enfants seulement
```tsx
<body>
  <div className="grid min-h-dvh grid-rows-[auto_1fr]">
    <Header />
    <div className="bg-gray-100">{children}</div>
  </div>
  <Devtools />
  <Scripts />
</body>

<main className="flex h-full">…</main>
```
Viewport rempli sous le header · hauteur définie pour les enfants · `h-full` redevient fiable · scripts/devtools hors calcul.

### Les 3 changements qui font tout
| Quoi | Classe / structure | Rôle |
|---|---|---|
| wrapper shell | `grid min-h-dvh grid-rows-[auto_1fr]` | hauteur viewport + ligne restante |
| ligne 1 | Header (seul) | taille naturelle (`auto`) |
| ligne 2 | zone contenu (seule) | prend tout le reste (`1fr`) |

### Pourquoi ça marche
- `min-h-dvh` donne une **hauteur plancher** au conteneur ; `1fr` distribue l’espace libre — contrairement à `min-height` + `flex-1`, qui peut rester calé sur le contenu.
- Seuls **2 enfants** dans la grille → la ligne `1fr` n’est pas concurrencée par Devtools/Scripts.
- Une fois la cellule `1fr` dimensionnée, `h-full` sur le `<main>` a enfin un parent à hauteur définie.

### Gotchas
- Tout sibling in-flow dans la grille (devtools, scripts, toasts) → lignes implicites → **re-casse** le layout : les garder **hors** du wrapper.
- `h-full` sur un descendant reste inutile si un ancêtre intermédiaire n’a pas de hauteur (padding ok, conteneur sans hauteur non).
- Préférer `dvh` à `vh` (barre d’adresse mobile) ; `min-h-0` sur une ligne `1fr` si le contenu interne doit scroller sans faire déborder la page.
