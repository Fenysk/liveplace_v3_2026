# LivePlace

Une Pixel War que le streamer lance pour sa communauté pendant ses temps morts.
Une URL par streamer, la même page dans le navigateur et dans une source Navigateur d'OBS.

## Où vivent les décisions

Le **quoi** est dans le cahier des charges 2026, le **comment** dans le plan d'architecture V3,
version du bloc 2 — les deux dans le vault Obsidian (dossier LivePlace, à chercher toi-même).
Le plan ne se réécrit qu'au bilan d'un bloc : entre deux bilans, une décision prise en route
s'écrit dans le JOURNAL.

Ce dépôt ne redit ni l'un ni l'autre. Ce qu'il contient de normatif :

| Fichier | Ce qu'il fixe |
|---|---|
| `AGENTS.md` | Comment on travaille ici. À lire en entier avant de toucher au code. |
| `.agent/project/architecture.json` | Les couches et le sens des dépendances. Lu par le gate. |
| `.agent/project/lexique.json` | Un mot par concept. Lu par le gate. |
| `.agent/project/JOURNAL.md` | Les décisions prises en route. Append-only, un par bloc : les anciens sont dans `archives/`. |

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
pnpm --filter @liveplace/web dev
```

Le premier lance Redis seul. Le `.env` se remplit à la main : chaque app lit sa part et refuse
de démarrer s'il lui en manque une, en la nommant. Le gateway écoute sur `:8080` (`/ws` et
`/healthz`), le web sur `:3000`. Les deux derniers sont aussi dans `.claude/launch.json`.

En local, `PUBLIC_URL` vaut `http://localhost:3000` : le web y construit le redirect OAuth, et
le gateway n'accepte un WebSocket que de cette origine.

Redis s'adresse en `127.0.0.1`, jamais `localhost` : sous Windows, `wslrelay` écoute aussi en
IPv6 sur le même port. Et `pnpm gate` exige ce Redis de dev, parce que les tests de
`redis-core` tournent contre un vrai Redis.

Twitch accepte `http://localhost:3000/auth/twitch/callback` comme redirect : l'OAuth marche en
local, sans tunnel.

## L'état du dépôt

Au 30 septembre 2026, fin du bloc 1 : LivePlace est en ligne sur `liveplace.tv`, protocole 10.

| Morceau | Ce qu'il fait |
|---|---|
| `packages/protocol` | Les frames client ↔ serveur, leurs schémas Zod, les codecs. |
| `packages/domain` | Les règles pures (jauge, palette, formats, coordonnées, rôles, délai OBS) et les ports (`@liveplace/domain/ports`). |
| `packages/shared` | Le type `Result` et la lecture d'env fail-closed. |
| `packages/redis-core` | Les scripts Lua (pose, modération, signalement, taille, jauge) et le client typé. Testé contre un vrai Redis. |
| `packages/durable` | Convex : les comptes et leurs canvas. |
| `apps/gateway` | Le serveur WebSocket : arrivée, reprise, diffusion au tick, modération, et les actions venues de Twitch. |
| `apps/web` | La page canvas, la vue OBS, la connexion Twitch, la synchro de la modération Twitch, le design system (`/design`). |
| `apps/worker`, `tools/bench` | Vides : le worker ouvre le bloc 2 ; le bench s'efface après chaque test de charge. |
