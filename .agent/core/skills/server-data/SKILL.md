---
name: server-data
description: >-
  Recueil de patterns pour la couche server (persistance, soft delete, URLs API).
  Utiliser quand on écrit ou révise la logique d'accès aux données côté serveur.
---

# Server data

Sommaire des patterns disponibles. Chaque ligne indique quand l'appliquer.
Lire le fichier correspondant dans `patterns/` pour le détail et l'exemple de code.

- **Soft delete en lecture** — `deletedAt` posé : filtrer aussi listes et get/update (helper `findActive*`). → [patterns/soft-delete-filter-reads.md](patterns/soft-delete-filter-reads.md)
- **Constante d'URL de base API** — base sans query ; path / query composés au call site (pas de `split('?')`). → [patterns/api-base-url-constant.md](patterns/api-base-url-constant.md)

<!-- Ajouter une ligne par nouveau pattern -->
