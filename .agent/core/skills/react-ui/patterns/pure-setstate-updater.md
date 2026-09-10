# Effets de bord hors de l'updater `setState`

> **Règle :** un updater `setState(fn)` doit rester pur — aucun log, fetch ni mutation dedans → effets dans le handler.

### ❌ Avant — side effect dans l'updater
```tsx
const handleLikeToggle = () => {
  setLiked((current) => {
    const next = !current;
    console.log(`liked=${next}`); // side effect
    return next;
  });
};
```
Strict Mode (dev) appelle `fn` **2×** · logs / effets doublés · UI correcte une seule fois · bruit en debug.

**Le faux ami** — désactiver le Strict Mode :
```tsx
// ⚠️ masque le symptôme : l'updater reste impur, fragile en concurrent / tests
<StrictMode>{/* retiré */}</StrictMode>
```

### ✅ Après — calculer, logger, puis setter
```tsx
const handleLikeToggle = () => {
  const next = !liked;
  console.log(`liked=${next}`);
  setLiked(next);
};
```
1 clic → 1 log · updater / assignation sans effet de bord · comportement identique en prod.

### Les 2 changements qui font tout
| Quoi | Où | Rôle |
|---|---|---|
| `const next = !liked` | handler | décide la valeur une seule fois |
| `console.log` / effets | hors de `setLiked` | ne subit pas le double-appel Strict Mode |

### Pourquoi ça marche
- En dev, React **rejoue** les updaters fonctionnels pour détecter les impuretées : même état d’entrée → même sortie attendue.
- Le handler d’événement n’est **pas** rejoué : un clic = une exécution.
- L’état appliqué reste unique ; seuls les effets dans `fn` sont dupliqués.

### Gotchas
- Besoin d’update basée sur l’état précédent **et** d’un effet → calcule `next` (ou lis via ref), log/effet **après**, puis `setLiked(next)` / updater pur sans side effect.
- `setLiked(!liked)` suffit pour un toggle simple ; préfère `setLiked(c => !c)` si des updates peuvent s’enchaîner avant le prochain render.
- Deux logs `liked` / `liked` (pas `liked` / `unliked`) = Strict Mode, pas un double clic.
