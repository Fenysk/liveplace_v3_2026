# JOURNAL

Append-only. On ajoute en haut, on ne réécrit jamais, on ne supprime jamais.

Une entrée existe pour **deux raisons seulement** : une décision a changé ce que le gate accepte
(architecture.json, lexique.json, un seuil, une règle désactivée), ou elle contredit un plan
(plan d'architecture, plan du jour). Tout le reste — ce qui a été fait, ce qui marche — se lit
dans le code et dans le gate. Un journal qui raconte le travail devient un doublon du dépôt,
et un doublon dérive.

Format : 5 lignes maximum. Si ça demande plus, la décision n'est pas mûre.
Un écart visible dans le code y porte le marqueur `Écart §x.y (JOURNAL AAAA-MM-JJ)`.

Un journal par bloc : à la fin du bloc, il part tel quel dans `archives/`, et le suivant garde une
ligne par thème de l'ancien. Une référence `(JOURNAL AAAA-MM-JJ)` du code se lit dans le journal
du bloc de sa date.

## Les blocs archivés

**Bloc 1**, du 10 au 30 septembre 2026 : [`archives/JOURNAL--bloc-1.md`](archives/JOURNAL--bloc-1.md).
Tout y est absorbé par le plan d'architecture du bloc 2, qui fait foi.

- Le socle et l'outillage (§3.4, §12.1, §14) : adoption du socle, lexique, alias, LF, tsconfig, Biome, `noCycles`, dépendances.
- Le protocole (§4) : versions 1 à 10, frames strictes, reprise refusée qui recharge la page.
- Le noyau Redis (§5) : la pile et les poses, la jauge et sa progression, la taille en direct, la rétention.
- La modération (§5.4, §5.7) : `clearUser`, `clearPlacement`, la preuve d'un ban, le signalement ; `clearArea` abandonné.
- Le gateway (§6) : diffusion adaptative, origine du WebSocket, `inspect` limité.
- Le web (§9) : `usecase/` et `infra/`, brouillon, image hors écran, design system, thème, en-têtes de sécurité.
- La vue OBS (§9.1, §9.5) : posée avant la première peinture, délai réglable, case vue par le stream, fond.
- Twitch et la session (§10) : retour après connexion, photo et e-mail, synchro des rôles et des bans, file `twitch:commands`.
- Convex et la production (§8, §11) : région EU, prod sur le déploiement de dev, `SESSION_SECRET`, variables par service.

---

## 2026-10-06 — Le classement déplié montre les pseudos : les cas de la pill dépliée sont réécrits

**Contexte.** À l'écran, Alexis veut voir les pseudos quand le classement n'est pas replié ; le premier jet n'avait que des avatars et une étiquette au survol, et la ligne de sa propre place touchait le bord de la pill.
**Décision.** Déplié, une ligne est l'avatar (anneau de podium), le pseudo tronqué et les pixels atténués, sur 184 px (la pill fait environ 200 px) ; le rang ne s'écrit que sous le pseudo de sa place hors du top. L'étiquette au survol ne vit plus que repliée. Les cas de `scoreboard-pill.test.ts` qui décrivaient l'ancien déplié (avatars seuls, pastille de rang, étiquette) sont réécrits sur cette règle, sans perdre une assertion.
**Renoncement.** Le mot « pixels » sur chaque ligne (la ligne est assez chargée, le nom accessible le dit) ; un rang écrit sur chacun des cinq premiers (l'ordre et les anneaux le disent).

## 2026-10-06 — Écart §4.3 : la frame `scoreboard` donne à chaque page le top 5 de son canvas et sa propre place

**Contexte.** Le classement s'affiche à toutes les pages d'un canvas, mais la place de chaque joueur lui est propre : une frame par pose et par page serait un coût par connexion.
**Décision.** Le gateway lit le top (un `ZREVRANGE` et cinq miroirs `user:`) au plus toutes les 2,5 s par canvas, et seulement si une pose ou un ban ou un déban a eu lieu depuis ; il envoie `{ t: "scoreboard", top, you? }`, où `you` porte le rang et les pixels de qui a posé sans être banni, un invité n'en a pas. Aucun `userId` ne franchit le fil : `you.rank` désigne la ligne du top. Rien en vue OBS. `PROTOCOL_VERSION` passe à 12 : les pages ouvertes se rechargent au déploiement. La branche `feat/canvas-archive` vise aussi 11 → 12 : la seconde fusionnée renumérote.
**Renoncement.** Une frame par pose ; une frame par page à chaque fenêtre (elle ne part que si le top ou la place a changé) ; l'identifiant des joueurs dans le top.

## 2026-10-06 — Écart §5.1 : le classement d'un canvas compte les pixels posés dans `scoreboard`, à part de `progress`

**Contexte.** `progress.counted` est plafonné par jour (bonus de jauge) et un autre chantier le recopie d'un canvas à l'autre : il ne dit ni qui a le plus posé ici, ni jusqu'où.
**Décision.** Deux clés sous `cv:<id>:`, sans EXPIRE : `scoreboard`, un ZSET `userId` → `pixels × 2^29 + (2^29 − 1 − version)` (chaque pixel accepté compte, la gomme jamais, aucun plafond ; à égalité, la plus petite version, donc le premier arrivé, reste devant), et `scoreboard:banned`, un hash où `moderate.lua` met le score d'un banni à l'écart, pour que les rangs se comptent sans lui, et le rend au déban (de LivePlace ou de Twitch : tout passe par `moderate.lua`). Un retrait sans ban n'ôte rien, comme `countedPixels`. Rien ne se recopie ni ne se reconstitue : le compteur part de zéro à la mise en ligne.
**Renoncement.** Réutiliser `progress` (plafond, recopie) ; un ZSET de tous les joueurs filtré à la lecture (le rang et le top devraient décompter les bannis) ; un score en pur `pixels` (l'égalité se jouerait à l'ordre alphabétique) ; l'heure en secondes (deux joueurs dans la même seconde).

## 2026-10-06 — Le lexique gagne `scoreboard`, le classement d'un canvas

**Contexte.** Le classement des joueurs d'un canvas n'avait pas de mot ; `board` est banni (c'est un `canvas`), et laisser `leaderboard` ou `ranking` s'installer en ferait trois.
**Décision.** `scoreboard` entre dans `lexique.json` comme nom canonique, un seul mot (jamais `leaderBoard`), avec `leaderboard` et `ranking` bannis ; l'interface dit « Classement ».
**Renoncement.** Pas de mot au lexique pour `rank` ni `pixels` : ce sont les champs d'une ligne du `scoreboard`, pas des concepts.

## 2026-10-06 — Écart §4.3 : la frame `staleList` dit à qui modère que la liste des bannis ou des modérateurs a bougé

**Contexte.** L'onglet Modération ne lisait ses listes qu'à son ouverture : `moderate.lua` et `moderators.lua` ne préviennent que la cible (`banned`, `unbanned`, `role`), donc un ban, un déban ou un modérateur venu de Twitch (file `twitch:commands`) ou d'un autre modérateur n'apparaissait qu'à la réouverture de la fenêtre.
**Décision.** Le gateway dérive de ces `ctl` déjà publiés (aucun script, aucun port ne change) une frame `staleList` (`bans` ou `moderators`) pour chaque socket qui modère ; le store la relaie, et la redit pour les deux listes à chaque reprise de la socket ; l'onglet relit la liste, une lecture à la fois. `PROTOCOL_VERSION` passe à 11 : les pages ouvertes se rechargent au déploiement.
**Renoncement.** Pas de nouveau `ctl` dans les scripts Lua (le cœur et le worker y touchent, et un test de script de plus) ; pas de liste poussée dans la frame (le gateway n'a pas à relire les bannis à chaque ban) ; pas de relecture par minuterie.

## 2026-10-06 — Écart §10.2 : le web vérifie aussi le cookie de session, pour que `/{login}` arrive avec la bonne pill dès le premier octet

**Contexte.** Le rôle `owner` n'arrive qu'au `hello` du gateway : le streamer voyait d'abord la pill Canvas, qui disparaissait ensuite. Le web ne faisait que signer `lp_session`, seul le gateway la vérifiait.
**Décision.** Le web implémente aussi le port `SessionVerifier` (même secret, même algorithme épinglé) ; le loader de la page du jeu rend `isOwnerSession`, comparé au propriétaire par `roleFor`. Affichage seulement : le gateway décide du vrai rôle (§10.3), et un cookie absent, expiré, falsifié ou une erreur donne le comportement d'avant. La vue OBS ne vérifie rien.
**Renoncement.** Ni paramètre d'URL (absent d'un lien tapé, falsifiable), ni souvenir `localStorage` (le HTML serveur garderait la pill de gauche). Pas de package partagé pour le vérificateur : deux copies de dix lignes (gateway, web), à extraire à la troisième.

## 2026-10-05 — Écart §10.1 : une bêta ne s'abonne jamais à EventSub, la prod reprend les abonnements partis ailleurs

**Contexte.** Twitch ne garde qu'un abonnement par type et par chaîne pour une application. Une chaîne synchronisée depuis une bêta y envoyait ses bans et ses modérateurs, et la prod, qui lit le 409 comme un succès, ne recevait plus rien.
**Décision.** Avec `BETA_LABEL`, le web ne demande rien à Twitch, comme sur le poste. En prod, la synchro supprime d'abord les abonnements de modération de la chaîne qui pointent vers une autre adresse, puis crée ceux qui manquent : une resynchro répare une chaîne prise par une bêta.
**Renoncement.** Pas de synchro Twitch de la modération sur les bêtas.

## 2026-10-05 — Une seule convention de branche, que le hook vérifie à chaque commit

**Contexte.** L'option « worktree » de l'app Claude crée ses propres branches (`worktree-…`) sans passer par `tools/worktree.sh` : deux façons de faire, et rien n'empêchait d'en dériver.
**Décision.** Le hook refuse aussi tout commit sur une branche qui ne s'appelle pas `feat/…`, `fix/…` ou `chore/…` (HEAD détachée exceptée, le temps d'un rebase). `tools/worktree.sh` est la seule façon de créer un worktree ; `.worktreeinclude` disparaît. Les entrées de `.claude/launch.json` se nomment `<serveur>-<place>`.
**Renoncement.** Pas de nom de branche libre, même pour un essai : un essai est un `chore/…`.

## 2026-10-05 — Le gate ignore `.claude/worktrees/`

**Contexte.** Lancé depuis le dossier principal, le gate parcourait aussi les worktrees : Biome y trouvait une seconde configuration racine et s'arrêtait, et architecture, lexique et duplication auraient lu chaque chantier comme une copie du code.
**Décision.** `.claude/worktrees/**` entre dans les `ignore` d'`architecture.json` et de `lexique.json`, dans `duplicationIgnore`, et `!.claude/worktrees` dans les `includes` de Biome. Ce ne sont pas des fichiers du dépôt, mais d'autres copies de travail, chacune avec son propre gate.
**Renoncement.** Aucune règle ne s'assouplit pour le code du dépôt : seul le chemin des copies sort du périmètre.

## 2026-10-05 — Écart §11.7 : un chantier par worktree, et trois places de serveurs en local

**Contexte.** Deux sessions dans le même dossier se volent la branche : quand l'une change de branche, l'autre voit ses fichiers changer. Et les ports 3000 et 8080 étaient écrits en dur.
**Décision.** Le dossier principal reste sur `main` ; chaque chantier vit dans `.claude/worktrees/<nom>` sur sa branche, créé et supprimé par `tools/worktree.sh` (`.env` recopié, `pnpm install`), qui ne supprime qu'une branche déjà sur `origin/main`. `GATEWAY_PORT` (gateway et proxy `/ws`) et `WEB_PORT` (Vite) valent 8080 et 3000 par défaut ; `.claude/launch.json` offre trois places (3000/8080, 3010/8090, 3020/8100), et `launch.json` passe ses variables avant le `.env`, qui ne les écrase pas.
**Renoncement.** Pas d'`autoPort` : il donne un port par serveur sans relier le web à son gateway. La connexion Twitch en local ne marche que sur la première place ; les vrais comptes se testent sur la bêta.

## 2026-10-04 — Un hook `pre-commit` versionné refuse tout commit direct sur `main`

**Contexte.** Le flux du 04/10 (une branche par fonctionnalité, `main` par fusion squash après validation) ne tenait que par la mémoire de l'agent : rien n'empêchait un commit direct, ni un autre outil de l'ignorer.
**Décision.** `tools/git-hooks/pre-commit` refuse un commit sur `main`, sauf la fin d'un `git merge --squash` (`SQUASH_MSG`) et un `git revert` (`REVERT_HEAD`). `pnpm install` le branche (`prepare` → `core.hooksPath`, et `core.longpaths` pour les worktrees sous Windows), et ne fait rien sans dépôt git, comme dans l'image Docker.
**Renoncement.** Pas de protection de branche côté GitHub : un push direct reste possible, et `--no-verify` reste le geste d'urgence de l'humain, jamais de l'agent.

## 2026-10-04 — L'écart §8 du 2026-09-22 est fermé : la prod lit son propre Convex

**Contexte.** Depuis le 22/09, la prod lisait le déploiement de dev (`watchful-spider-409`) ; une bêta en aurait fait trois environnements sur une seule base.
**Décision.** La prod lit `valiant-panther-436`, avec sa propre `SERVICE_KEY` (`PROD_CONVEX_URL` et `PROD_CONVEX_SERVICE_KEY` dans Dokploy) ; le poste et la bêta gardent le dev. Les données du dev y ont été copiées telles quelles, `canvasId` compris : Redis n'a pas bougé. Le §11.6 s'applique dorénavant à deux bases : `convex dev --once`, puis `convex deploy` avant l'image ; un schéma ajoute avant de retirer, parce que le poste et la bêta partagent le dev.
**Renoncement.** Pas de copie continue du dev vers la prod : un compte créé en prod n'existe pas sur la bêta tant qu'il ne s'y connecte pas.

## 2026-10-04 — Écart §11.1 et §11.2 : des emplacements de bêta, un Compose chacun, depuis le même fichier

**Contexte.** Tester une branche en ligne, depuis un téléphone, sans toucher `main` ni la prod : le §11 ne décrit qu'un environnement, et les noms des routeurs Traefik y étaient fixes.
**Décision.** `docker-compose.yml` sert aussi aux emplacements de bêta (environnement `beta` de Dokploy, un Compose par emplacement, son propre Redis, le Convex de dev). `ROUTER_PREFIX` y distingue les routeurs, labels en liste parce que Compose ne remplace pas une variable dans une clé. `BETA_LABEL`, vide en production, pose le bandeau (caché en vue OBS) et `X-Robots-Tag: noindex, nofollow`. Claude déploie une branche sur la bêta librement ; la prod ne reçoit que `main`, sur go explicite.
**Renoncement.** Pas de branche `beta`, pas de pull request ni de CI, pas de déploiement par branche automatique.
