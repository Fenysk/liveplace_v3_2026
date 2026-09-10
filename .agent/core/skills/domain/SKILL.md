---
name: domain
description: >-
  Recueil de patterns pour la couche domain (schemas Zod, types partagés,
  validation). Utiliser quand on modélise une entité ou un contrat d'entrée.
---

# Domain

Sommaire des patterns disponibles. Chaque ligne indique quand l'appliquer.
Lire le fichier correspondant dans `patterns/` pour le détail et l'exemple de code.

- **Zod schema + façade types** — `z.infer` à côté du schema ; UI via re-export type-only, pas via `schemas`. → [patterns/zod-schema-type-facade.md](patterns/zod-schema-type-facade.md)
- **Zod défaut dynamique** — date / UUID / random en `.default` : toujours une factory, jamais une valeur évaluée à l'import. → [patterns/zod-default-factory.md](patterns/zod-default-factory.md)
- **Type domaine partagé** — item API = props carte = élément de liste ; éviter shapes dupliqués. → [patterns/shared-domain-type-props.md](patterns/shared-domain-type-props.md)

<!-- Ajouter une ligne par nouveau pattern -->
