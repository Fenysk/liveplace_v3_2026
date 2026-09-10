# Zod : schema + type, façade pour l’UI

> **Règle :** dériver `z.infer` à côté du schema ; l’UI importe via une façade type-only → `schemas` + `types` re-export.

### ❌ Avant — `z.infer` dans `types.ts` (ou UI → `schemas`)
```ts
// types.ts
import type { z } from "zod"
import type { ItemSchema } from "./schemas"
export type Item = z.infer<typeof ItemSchema> // ❌ types.ts couple à Zod

// Card.tsx
import type { Item } from "@/domain/item/schemas" // ❌ UI dépend du fichier validation
```
Façade polluée par Zod · intention « domaine » floue · tentation d’importer les schemas côté UI.

**Le faux ami** — déplacer `z.infer` dans `types.ts` « pour découpler » :
```ts
// types.ts
export type Item = z.infer<typeof ItemSchema> // ⚠️ types.ts dépend quand même de schemas (+ Zod) · aucun gain bundle si import type déjà OK
```

### ✅ Après — infer colocalisé + re-export
```ts
// schemas.ts
export const ItemSchema = z.object({ name: z.string().min(1) })
export type Item = z.infer<typeof ItemSchema>

// types.ts
export type { Item } from "./schemas"

// Card.tsx
import type { Item } from "@/domain/item/types"
```
Colocation Zod classique · `types.ts` ignorant de Zod · UI sans dépendance au fichier schemas.

### Les 2 changements qui font tout
| Quoi | Où | Rôle |
|---|---|---|
| `export type Item = z.infer<…>` | `schemas.ts` | une dérivation, près de la source de vérité |
| `export type { Item } from "./schemas"` | `types.ts` | entrée publique type-only pour l’UI |

### Pourquoi ça marche
- Schema et type restent une seule source ; la façade ne fait que rediriger les imports.
- `import type` efface tout au compile : organisation ≠ poids runtime.

### Gotchas
- Complète [shared-domain-type-props](shared-domain-type-props.md) (un type partagé) : ici c’est **où** vit le type quand la source est Zod.
- Ne pas réexporter les schemas runtime depuis `types.ts` — sinon la façade fuit la validation vers le client.
