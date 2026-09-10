# Zod : défaut dynamique via factory

> **Règle :** un défaut qui doit être recalculé à chaque parse (date, UUID, random) passe par une fonction → `.default(() => …)`.

### ❌ Avant — valeur figée à l’import du module
```ts
export const TodoSchema = z.object({
  createdAt: z.date().default(new Date()), // ❌ évalué une seule fois au load
});
```
Tous les défauts partagent le même instant · timestamps faux en prod · bug silencieux.

**Le faux ami** — construire la date à la main dans le handler et laisser le schema tel quel :
```ts
createdAt: new Date(), // ⚠️ corrige le call site · le piège reste dans le schema pour le prochain parse / seed
```

### ✅ Après — factory re-exécutée à chaque défaut
```ts
export const TodoSchema = z.object({
  createdAt: z.date().default(() => new Date()), // ✅ nouveau Date à chaque fois
});
```
Défaut frais à chaque parse · schema = source de vérité · call site peut omettre le champ.

### Le 1 changement qui fait tout
| Quoi | Où | Rôle |
|---|---|---|
| `.default(() => new Date())` | champ Zod dynamique | factory rejouée quand l’input est `undefined` |

### Pourquoi ça marche
- En Zod, une valeur passée à `.default(x)` est capturée une fois ; une **fonction** est rappelée à chaque besoin de défaut.
- Même règle pour `crypto.randomUUID()`, `Math.random()`, compteurs — tout ce qui ne doit pas être une constante de module.

### Gotchas
- `.default(false)` / `.default("")` restent des valeurs (immutables) — pas besoin de factory.
- Ne pas confondre avec `.prefault()` : le défaut court-circuite avant le parse ; la factory doit produire le **type de sortie**.
- Si le call site pose toujours `createdAt: new Date()`, le défaut n’est jamais lu — le bug reste latent jusqu’au premier `parse` sans le champ.
