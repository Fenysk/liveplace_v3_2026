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
`/healthz`), le web sur `:3000`. Les deux derniers sont aussi dans `.claude/launch.json`, nommés
`<serveur>-<place>` : `gateway-1`, `web-1` et `web-prod-1` pour la place 1 (3000/8080), puis les
places 2 (3010/8090) et 3 (3020/8100), pour faire tourner trois worktrees à la fois.

En local, `PUBLIC_URL` vaut `http://localhost:3000` : le web y construit le redirect OAuth, et
le gateway n'accepte un WebSocket que de cette origine.

Redis s'adresse en `127.0.0.1`, jamais `localhost` : sous Windows, `wslrelay` écoute aussi en
IPv6 sur le même port. Et `pnpm gate` exige ce Redis de dev, parce que les tests de
`redis-core` tournent contre un vrai Redis.

Twitch accepte `http://localhost:3000/auth/twitch/callback` comme redirect : l'OAuth marche en
local, sans tunnel, sur la première place seulement.

## Les branches, les worktrees et la bêta

`main` est ce qui part en prod, et seulement sur un go explicite. Une fonctionnalité vit sur
`feat/…`, un correctif sur `fix/…`, toujours partis de `main`, et rejoint `main` par une fusion
squash : un commit d'une ligne.

Le dossier principal reste sur `main` : on n'y code pas. Chaque chantier a son worktree, un
second dossier sur sa branche, pour que deux sessions ne se volent jamais la branche :

```
sh tools/worktree.sh add feat/xxx      # .claude/worktrees/feat-xxx, avec le .env et pnpm install
sh tools/worktree.sh status            # ce qui est en cours, et ce qui est déjà sur main
sh tools/worktree.sh remove feat/xxx   # après la fusion : le worktree et la branche, ici et sur GitHub
```

C'est la seule façon de créer un worktree : pas l'option « worktree » de l'app Claude, dont les
branches s'appellent `worktree-…`. Le hook refuse tout commit sur une branche hors convention.

Avant de demander la fusion, la branche se met à jour : `git merge origin/main` dans son worktree
(jamais de rebase), puis le gate, le build de prod et la bêta. La version validée est donc celle
qui arrive sur `main`, et le squash ne rencontre aucun conflit. Le commit de merge reste sur la
branche : le squash l'écrase avec le reste.

Pour la tester en ligne, un emplacement de bêta (`beta` à `beta4.liveplace.tv`, environnement
`beta` de Dokploy, un Compose chacun) montre la branche qu'on y règle, avec un
bandeau, son propre Redis et le Convex de dev (JOURNAL 2026-10-04). Le poste et la bêta
partagent ce Convex : un changement de schéma ajoute avant de retirer.

Un hook `pre-commit` (`tools/git-hooks/`, branché par `pnpm install`) refuse tout commit direct
sur `main` (seuls passent la fin d'un `git merge --squash` et un `git revert`), et tout commit
sur une branche qui ne s'appelle pas `feat/…`, `fix/…` ou `chore/…`. Un commit isolé, même une
ligne du JOURNAL, passe donc lui aussi par une branche. Les petits correctifs s'accumulent sur
leurs branches et rejoignent `main` ensemble, sur une seule validation.

Les bêtas se déploient à la main, jamais à chaque push : Dokploy n'est pas exposé à internet,
et c'est ce qui le garde à l'abri.

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
