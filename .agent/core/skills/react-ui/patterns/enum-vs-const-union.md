# `enum` pour un état simple (idle/saving/success/error)

> **Règle :** pas de valeurs numériques ni d'itération runtime nécessaires → jamais d'`enum` TS.
> Solution : objet `as const` + union de littéraux dérivée.

### ❌ Avant — `enum` TypeScript
```tsx
enum FormStatus {
  idle = "idle",
  saving = "saving",
  success = "success",
  error = "error",
}

const [status, setStatus] = useState<FormStatus>(FormStatus.idle);
```
Génère un objet JS avec double mapping à l'exécution · alourdit le bundle pour rien · casse sous `isolatedModules` (Vite/esbuild/SWC compilent fichier par fichier) si on passe en `const enum`.

**Le faux ami** — passer en `const enum` pour éviter le JS généré :
```tsx
const enum FormStatus { idle = "idle" /* ... */ }
// ⚠️ interdit avec isolatedModules (Vite, esbuild, SWC) : le build casse
```

### ✅ Après — objet `as const` + type dérivé
```tsx
const FormStatus = {
  idle: "idle",
  saving: "saving",
  success: "success",
  error: "error",
} as const;

type FormStatus = (typeof FormStatus)[keyof typeof FormStatus];

const [status, setStatus] = useState<FormStatus>(FormStatus.idle);
```
Le type s'efface entièrement à la compilation · aucun JS superflu généré · s'intègre nativement à l'inférence TS · `FormStatus.saving` reste utilisable partout comme avant.

### Le changement qui fait tout
| Élément | Ligne | Rôle |
|---|---|---|
| `const FormStatus = {...} as const` | déclaration objet | valeurs runtime, figées et non réassignables |
| `type FormStatus = (typeof FormStatus)[keyof typeof FormStatus]` | déclaration type | union de littéraux dérivée de l'objet, même nom que la const |

### Pourquoi ça marche
- TS a deux espaces de noms séparés (types / valeurs) : `const FormStatus` et `type FormStatus` coexistent sans collision, donc `FormStatus.idle` marche à la fois comme valeur et pour typer.
- `as const` fige les valeurs en littéraux (`"idle"`, pas `string`), ce qui permet à `keyof typeof` de produire une union exacte plutôt que `string`.

### Gotchas
- Aucune valeur numérique auto-incrémentée possible avec ce pattern (si besoin réel de nombres, un `enum` reste défendable).
- Le nom identique const/type peut dérouter à la lecture si on n'a pas le réflexe TS namespace-séparé — vérifier avec l'auto-complétion en cas de doute.
