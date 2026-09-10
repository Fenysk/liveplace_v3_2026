---
name: tanstack-start
description: >-
  Recueil de patterns TanStack Start (server functions, split logique/transport).
  Utiliser quand on expose ou structure des createServerFn et la couche server
  Start.
---

# TanStack Start

Sommaire des patterns disponibles. Chaque ligne indique quand l'appliquer.
Lire le fichier correspondant dans `patterns/` pour le détail et l'exemple de code.

- **Split server fn : logique vs transport** — `*.server.ts` métier ; `*.functions.ts` = `createServerFn` + validators Zod. → [patterns/server-fn-logic-split.md](patterns/server-fn-logic-split.md)
- **Déployer Start sur Dokploy (NAS)** — Nitro + Dockerfile + volume + domaine Traefik **et** route Caddy nas-router. → [patterns/dokploy-nas-nitro-deploy.md](patterns/dokploy-nas-nitro-deploy.md)

<!-- Ajouter une ligne par nouveau pattern -->
