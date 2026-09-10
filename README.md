# LivePlace

Une Pixel War que le streamer lance pour sa communauté pendant ses temps morts.
Une URL par streamer, la même page dans le navigateur et dans une source Navigateur d'OBS.

## Où vivent les décisions

Le **quoi** est dans le cahier des charges, le **comment** dans le plan d'architecture V3 —
les deux dans le vault Obsidian, figés jusqu'au bilan du 4 octobre 2026.

Ce dépôt ne redit ni l'un ni l'autre. Ce qu'il contient de normatif :

| Fichier | Ce qu'il fixe |
|---|---|
| `AGENTS.md` | Comment on travaille ici. À lire en entier avant de toucher au code. |
| `.agent/project/architecture.json` | Les couches et le sens des dépendances. Lu par le gate. |
| `.agent/project/lexique.json` | Un mot par concept. Lu par le gate. |
| `.agent/project/JOURNAL.md` | Les décisions prises en route. Append-only. |

## Terminé = gate vert

```
pnpm gate
```

Types, lint, intégrité du noyau, couches, lexique, duplication, intégrité des tests, tests.
Rien n'est annoncé fini, rien n'est commité, tant que cette commande est rouge. Et on ne la
fait jamais passer en l'affaiblissant : une règle qui gêne vraiment est une décision, elle
s'écrit dans le JOURNAL avant de toucher aux données du socle.

## Le poste de développement

```
docker compose -f docker-compose.dev.yml up -d
```

Puis `cp .env.example .env` et remplir. Twitch accepte `http://localhost:3000/auth/twitch/callback`
comme redirect : l'OAuth marche en local, sans tunnel.

## L'état du dépôt

Jour 2 du bloc 1. Le squelette et les rails sont posés, il n'y a pas encore une ligne de
métier. Le contenu de chaque package arrive à son jour, dans l'ordre de construction du
cahier des charges §4.
