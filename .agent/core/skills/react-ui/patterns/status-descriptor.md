# État UI → descripteur, pas JSX dupliqué

> **Règle :** un état à N valeurs ne donne pas N blocs JSX → une fonction qui retourne un descripteur typé, rendu une seule fois.

### ❌ Avant — un bloc conditionnel par statut
```tsx
{status === FormStatus.saving && (
  <Alert>
    <AlertTitle>Saving...</AlertTitle>
  </Alert>
)}
{status === FormStatus.success && (
  <Alert>
    <AlertTitle>Success</AlertTitle>
    <AlertDescription>Successfully saved {savedName}</AlertDescription>
  </Alert>
)}
{status === FormStatus.error && (
  <Alert variant="destructive">
    <AlertTitle>Error</AlertTitle>
    <AlertDescription>Failed to save. Try again.</AlertDescription>
  </Alert>
)}
```
Le squelette `<Alert>` recopié 3× · ajouter un statut = un 4e bloc · changer de composant d'alerte = 3 éditions · rien ne garantit que les cas restent exclusifs.

**Le faux ami** — la map de JSX :
```tsx
const ALERTS = {
  saving: <Alert><AlertTitle>Saving...</AlertTitle></Alert>,
  success: <Alert>...{savedName}...</Alert>,   // ⚠️ toutes les branches construites à chaque render
};                                              //    et la map ne peut pas sortir du composant
```

### ✅ Après — un descripteur, un seul rendu
```tsx
type StatusAlert = {
  title: string;
  description?: string;
  variant?: "destructive";
};

const getStatusAlert = (): StatusAlert | null => {
  switch (status) {
    case FormStatus.saving:
      return { title: "Saving..." };
    case FormStatus.success:
      return { title: "Success", description: `Successfully saved ${savedName}` };
    case FormStatus.error:
      return { title: "Error", description: "Failed to save. Try again.", variant: "destructive" };
    default:
      return null;
  }
};

const statusAlert = getStatusAlert();

{statusAlert && (
  <Alert variant={statusAlert.variant}>
    <AlertTitle>{statusAlert.title}</AlertTitle>
    {statusAlert.description && <AlertDescription>{statusAlert.description}</AlertDescription>}
  </Alert>
)}
```
Un seul `<Alert>` dans l'arbre · ajouter un statut = un `case` · le contenu se teste sans monter de composant · changer d'UI = un seul endroit.

### Les 3 pièces qui font tout
| Élément | Ligne | Rôle |
|---|---|---|
| `type StatusAlert` | déclaration | contrat de ce que l'UI sait afficher, indépendant du composant |
| `switch` → objet | `getStatusAlert()` | décide **quoi** afficher, une fois |
| `{statusAlert && ...}` | JSX | décide **comment** l'afficher, une fois |

### Pourquoi ça marche
- Séparer « quoi » (données) de « comment » (JSX) rend le nombre de blocs de rendu indépendant du nombre d'états : passer de 3 à 6 statuts n'ajoute aucune ligne de JSX.
- L'annotation de retour `StatusAlert | null` n'est pas décorative. Sans elle, TS infère une union de shapes hétérogènes (`{title} | {title, description} | ...`) et `statusAlert.description` ne compile pas sur la branche `saving`.

### Gotchas
- Champs **optionnels** (`description?`) plutôt que valeurs sentinelles (`description: ""`) : absent = branche non rendue, sans test de chaîne vide.
- `variant?: "destructive"` et non `"default" | "destructive"` : laisser `undefined` fait jouer les `defaultVariants` de `cva` au lieu de les court-circuiter.
- Le `switch` ne reste exhaustif que parce que le statut est une union fermée : ce pattern se pose sur l'objet `as const` du pattern `enum-vs-const-union`, pas sur un `string`.
- Une réécriture par IA transforme volontiers un `switch` existant en blocs JSX parallèles : c'est une régression, pas une modernisation.
