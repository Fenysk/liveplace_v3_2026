# Navigation = liste de liens

> **Règle :** un `<nav>` de 2 liens ou plus porte un `<ul>/<li>` → la liste est de la sémantique, pas de la décoration.

### ❌ Avant — des boutons-liens empilés, copiés-collés
```tsx
<nav className="flex flex-col gap-1 p-2">
  <Button asChild variant="ghost" className="justify-start font-semibold">
    <Link to="/dashboard" activeOptions={{ exact: true }} activeProps={{ className: "bg-muted" }}>
      Dashboard
    </Link>
  </Button>
  <Button asChild variant="ghost" className="justify-start">
    <Link to="/dashboard/settings" activeProps={{ className: "bg-muted" }}>Settings</Link>
  </Button>
  <Button asChild variant="ghost" className="justify-start">
    <Link to="/dashboard/pokemons" activeProps={{ className: "bg-muted" }}>Pokemons</Link>
  </Button>
</nav>
```
Le lecteur d'écran n'annonce plus « liste, 3 éléments » ni le rang de chaque lien · `activeProps` recopié à chaque entrée · ajouter un lien = dupliquer 6 lignes · les `Button` restent `inline-flex`, la zone cliquable s'arrête au texte.

**Le faux ami** — recoller un rôle de liste sur le `<nav>` :
```tsx
<nav role="list" className="flex flex-col gap-1">   {/* ⚠️ écrase le rôle navigation */}
```

### ✅ Après — données + `<ul>/<li>`
```tsx
const NAV_LINKS = [
  { to: "/dashboard", label: "Dashboard", exact: true },
  { to: "/dashboard/settings", label: "Settings", exact: false },
  { to: "/dashboard/pokemons", label: "Pokemons", exact: false },
] as const;

<nav className="p-2">
  <ul className="flex flex-col gap-1">
    {NAV_LINKS.map(({ to, label, exact }) => (
      <li key={to}>
        <Button asChild variant="ghost" className="w-full justify-start">
          <Link
            to={to}
            activeOptions={{ exact }}
            activeProps={{ className: "bg-muted font-semibold" }}
          >
            {label}
          </Link>
        </Button>
      </li>
    ))}
  </ul>
</nav>
```
Landmark `navigation` **et** liste annoncés · une entrée = une ligne de données · style actif défini une fois · zone cliquable pleine largeur.

### Les 4 changements qui font tout
| Élément | Ligne / classe | Rôle |
|---|---|---|
| `<nav>` sans `role` | balise | garde le landmark `navigation` (« où je suis ») |
| `<ul>/<li>` | dans le `<nav>` | ajoute « liste, N éléments » et le rang de chaque lien |
| `NAV_LINKS` + `as const` | tableau de données | `to` reste un littéral → typage des routes préservé |
| `w-full` sur le `Button` | classe | `buttonVariants` est `inline-flex` : sans ça le lien ne remplit pas le `<li>` |

### Pourquoi ça marche
- `<nav>` et `<ul>` portent deux informations distinctes : le premier dit **où** on est dans la page, le second dit **combien** il y a d'entrées et à quel rang on se trouve. Un `<nav>` de liens nus perd la seconde, et aucun attribut ARIA ne la rend sans écraser la première.
- `as const` fige `to` en littéral au lieu de `string` : `Link` conserve l'autocomplétion et la vérification des routes, qu'un `string[]` casserait.

### Gotchas
- `asChild` transfère les classes du `Button` au `Link` : le `<li>` est bloc mais le lien reste `inline-flex`, d'où le `w-full`. Symptôme typique : le survol ne s'allume que sous le texte.
- `activeOptions={{ exact: true }}` est obligatoire sur la route parente, sinon `/dashboard` reste marqué actif sur toutes ses enfants.
- Un `<nav>` à un seul lien ne justifie pas de `<ul>` : la sémantique de liste ne dit quelque chose qu'à partir de 2.
- Passer un design system sur une nav existante est le moment classique où le `<ul>/<li>` disparaît : le composant remplace la balise, pas seulement le style.
