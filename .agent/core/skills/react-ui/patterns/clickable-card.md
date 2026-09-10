# Carte cliquable + action imbriquée

> **Règle :** jamais de `<button>` dans un `<a>`/`<Link>` → HTML invalide.
> Solution : *stretched link* — un overlay `::after` fait le lien, au lieu de tout wrapper.

### ❌ Avant — le `Link` wrappe toute la carte
```tsx
<Link to="/products/$productId" params={{ productId: name }}>
  <article className="p-4 rounded-xl border">
    <div className="flex justify-between items-center">
      <p>PRODUCT</p>
      <button type="button" onClick={() => setLiked(v => !v)}>
        <Heart fill={liked ? "red" : "none"} />
      </button>
    </div>
    <h2>{name}</h2>
    <span>{likes} {likes > 1 ? "likes" : "like"}</span>
  </article>
</Link>
```
Button imbriqué dans un lien = HTML invalide · clic sur ❤️ = **navigue aussi** · clavier imprévisible · lecteur d'écran lit **toute** la carte.

**Le faux ami** — neutraliser le clic dans le bouton :
```tsx
onClick={(e) => {
  e.preventDefault();
  e.stopPropagation();   // ⚠️ masque le symptôme, le HTML reste invalide
  setLiked(v => !v);
}}
```

### ✅ Après — stretched link
```tsx
<article className="relative p-4 rounded-xl border">
  <div className="flex justify-between items-center">
    <p>PRODUCT</p>
    <button
      type="button"
      className="relative z-10"                    // ← au-dessus de l'overlay
      onClick={() => setLiked(v => !v)}
    >
      <Heart fill={liked ? "red" : "none"} />
    </button>
  </div>

  <h2>
    <Link
      to="/products/$productId"
      params={{ productId: name }}
      className="after:absolute after:inset-0"     // ← overlay = toute la carte
    >
      {name}
    </Link>
  </h2>

  <span>{likes} {likes > 1 ? "likes" : "like"}</span>
</article>
```
HTML valide · zéro hack · lecteur d'écran lit **le nom seul** · bouton focusable à part.

### Les 3 classes qui font tout
| Élément | Classe | Rôle |
|---|---|---|
| carte (`article`) | `relative` | ancre l'overlay |
| lien (`Link`, sur le titre) | `after:absolute after:inset-0` | étend le clic à toute la carte |
| action (`button`) | `relative z-10` | passe au-dessus de l'overlay |

### Pourquoi ça marche
- Le `Link` reste `static` → son `::after` absolu se cale sur l'ancêtre `relative` (la carte) → `inset-0` la couvre entière.
- Le bouton en `z-10` est empilé au-dessus de l'overlay : clic dessus capté en premier, **jamais** de propagation. Clic ailleurs → overlay → navigation.
- Tailwind v3+ injecte `content: ''` tout seul (pas besoin de `after:content-['']`).

### Gotchas
- Tout autre interactif dans la carte → `relative z-10`.
- Texte sous l'overlay non sélectionnable à la souris → `relative z-10` si besoin.
- `z-10` sans `relative`/`absolute` ne fait **rien** : le z-index n'agit que sur un élément positionné (ton `<span>` d'origine le portait pour rien).