# LivePlace

Une Pixel War que le streamer lance pour sa communauté pendant ses temps morts.
Une URL par streamer, la même page dans le navigateur et dans une source Navigateur d'OBS.

## Où vivent les décisions

Le **quoi** est dans le cahier des charges, le **comment** dans le plan d'architecture V3 —
les deux dans le vault Obsidian (dossier LivePlace, à chercher toi-même), figés jusqu'au bilan du 4 octobre 2026.

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
cp .env.example .env
pnpm --filter @liveplace/gateway dev
```

Le premier lance Redis seul. Le `.env` se remplit à la main : le gateway ne lit que `REDIS_URL`
et `SESSION_SECRET`, et refuse de démarrer sans eux. Le dernier lance le gateway sur `:8080`
(`/ws` et `/healthz`).

Redis s'adresse en `127.0.0.1`, jamais `localhost` : sous Windows, `wslrelay` écoute aussi en
IPv6 sur le même port. Et `pnpm gate` exige ce Redis de dev, parce que les tests de
`redis-core` tournent contre un vrai Redis.

Twitch accepte `http://localhost:3000/auth/twitch/callback` comme redirect : l'OAuth marchera en
local, sans tunnel.

## L'état du dépôt

Au 18 septembre 2026, jour 6 du bloc 1.

| Morceau | Ce qu'il fait aujourd'hui |
|---|---|
| `packages/protocol` | Les frames client ↔ serveur, leurs schémas Zod, les codecs. |
| `packages/domain` | Les règles pures (jauge, palette, coordonnées, rôles) et les ports (`@liveplace/domain/ports`). |
| `packages/shared` | Le type `Result` et la lecture d'env fail-closed. |
| `packages/redis-core` | `place.lua` et le client typé : créer, lire, poser, s'abonner. Testé contre un vrai Redis. |
| `apps/gateway` | Le serveur WebSocket : `hello` → `welcome` + snapshot, `place` → `ack`, diffusion conflatée au tick, session par cookie. |
| `packages/durable`, `apps/web`, `apps/worker`, `tools/bench` | Vides. |

Rien n'est encore déployé, et il n'y a ni page web, ni connexion Twitch, ni modération, ni
worker. Le contenu de chaque morceau arrive à son jour, dans l'ordre de construction du
cahier des charges §4.
