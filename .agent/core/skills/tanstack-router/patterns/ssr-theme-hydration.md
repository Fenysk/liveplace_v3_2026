# Thème SSR sans flash ni mismatch

> **Règle :** le premier render doit être déterministe, jamais lire `window` / `localStorage` dedans → état React figé au défaut + script bloquant pour le DOM.

### ❌ Avant — le render interroge le navigateur
```tsx
function resolveIsDark(theme: "dark" | "light" | "system") {
  if (theme === "system") {
    if (typeof window === "undefined") return false;              // ← serveur
    return window.matchMedia("(prefers-color-scheme: dark)").matches;  // ← client
  }
  return theme === "dark";
}

export function ThemeProvider({ defaultTheme = "system", ... }) { /* ← arme le piège */ }

export function ModeToggle() {
  const { theme, setTheme } = useTheme();
  const isDark = resolveIsDark(theme);        // évalué pendant le render

  return <Button aria-pressed={isDark} ... />;
}
```
`typeof window === "undefined" ? A : B` pendant le render **est** la définition d'un mismatch · latent tant qu'un appelant passe `defaultTheme="light"`, actif dès qu'on retire la prop · un bug qui dort passe tous les tests.

**Le faux ami** — le drapeau `mounted` :
```tsx
const [mounted, setMounted] = useState(false);
useEffect(() => { setMounted(true); }, []);

useEffect(() => {
  if (!mounted) return;   // ⚠️ ne garde que les effets
  applyTheme(theme);      //    le render, lui, appelle toujours matchMedia
}, [theme, mounted]);
```

### ✅ Après — script bloquant pour le DOM, état déterministe pour React
```tsx
type Theme = "light" | "dark";

const getBlockingScript = (storageKey: string, defaultTheme: Theme) =>
  `(function(){try{var t=localStorage.getItem(${JSON.stringify(storageKey)});` +
  `if(t!=='light'&&t!=='dark'){t=${JSON.stringify(defaultTheme)}}` +
  `var e=document.documentElement;e.classList.add(t);e.style.colorScheme=t}catch(e){}})();`;

export function ThemeProvider({ children, defaultTheme = "light", storageKey = "theme" }) {
  const [theme, setThemeState] = useState<Theme>(defaultTheme);   // identique serveur/client

  useEffect(() => {                                                // resync APRÈS hydratation
    const stored = localStorage.getItem(storageKey);
    if (isTheme(stored)) setThemeState(stored);
  }, [storageKey]);

  return (
    <ThemeProviderContext value={{ theme, setTheme }}>
      <ScriptOnce>{getBlockingScript(storageKey, defaultTheme)}</ScriptOnce>
      {children}
    </ThemeProviderContext>
  );
}
```
Zéro flash · zéro warning · un seul `useEffect` au lieu de trois · le render redevient pur.

### Les 4 pièces qui font tout
| Élément | Emplacement | Rôle |
|---|---|---|
| `<ScriptOnce>` inline | dans le provider | pose `.dark` sur `<html>` avant le premier paint, hors du cycle React |
| `useState(defaultTheme)` | init du state | valeur déterministe : serveur et client rendent la même chose |
| `useEffect` de resync | après hydratation | lit `localStorage` une fois l'arbre réconcilié |
| `suppressHydrationWarning` | `<html>` dans `__root.tsx` | autorise la classe posée par le script |

### Pourquoi ça marche
- React hydrate en comparant l'arbre serveur au **premier** render client. La règle n'est donc pas « éviter `window` » mais « le premier render doit être reproductible ». Tout `typeof window` qui change le résultat viole ça par construction.
- Le DOM a le droit d'être en avance sur React : React ne réconcilie que ce qu'il a rendu, et `<html>` n'a pas de `className` dans le JSX. Le script peut le muter sans que React le rattrape.
- Le no-flash vient du script bloquant, l'état vient de React. Séparer les deux responsabilités supprime le besoin de les synchroniser, donc les `useEffect` en cascade.

### Gotchas
- `suppressHydrationWarning` ne couvre que l'élément qui le porte (ses attributs, son texte direct), **pas** ses descendants. Il ne sauvera jamais un `aria-pressed` plus bas dans l'arbre.
- `aria-pressed` reste faux pendant un tick après hydratation (state = défaut jusqu'à l'effet). Acceptable : l'icône est pilotée par CSS `dark:`, donc juste immédiatement.
- Un mode `system` que l'UI n'atteint jamais est du code mort qui traîne un `matchMedia` : ici, supprimer battait corriger (3 `useEffect` → 1, et le piège disparaît avec).
- Le script doit être inline et sans `defer` : un script externe s'exécute après le premier paint, donc le flash revient.
