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

## 2026-10-07 — Un signalement de plage arrive en une seule ligne chez les modérateurs, réuni dans le web

**Contexte.** Signaler une plage d'heures signale chaque pose de l'auteur qu'elle touche, et la section Modération affichait une ligne par pose : un dessin arrivait en dizaines de lignes (demande de l'humain).
**Décision.** Le web réunit les poses en une ligne par (auteur, `reportedAt`) : `report.lua` fait `ZADD NX` avec un seul `nowMs` par appel, donc toutes les poses d'un signalement de plage ont la même heure, qu'un signalement suivant ne change pas. Rétablir envoie un `approvePlacement` par pose ; Retirer, un `clearPlacement` par pose, de la plus ancienne à la plus récente (la plage une seule fois, sur la première), pour que chacune entre dans `cleared:placements` et que la preuve d'un ban garde la couleur que le stream montrait. `PROTOCOL_VERSION` ne change pas. Lève le renoncement du 2026-09-29 (« Pas de signalement groupé », `archives/JOURNAL--bloc-1.md`).
**Renoncement.** Pas de protocole 15 ni de regroupement dans Redis (le web a déjà l'information) ; `reportCount` compte toujours les poses, il déclenche la relecture de la liste ; une pose signalée seule avant la plage garde sa propre ligne, le dessin peut arriver en deux lignes.

## 2026-10-07 — Écart §5.1 : le web compte le nouveau compte dans les points du canvas actif du streamer d'origine

**Contexte.** La courbe des nouveaux comptes venus de la page d'un canvas (cahier des charges du suivi d'activité, §3) a un point par minute, heure et jour ; la clé du jour de Paris par provenance ne donne qu'un nombre par jour, et par `ownerId` : une archive y lirait les comptes de son successeur.
**Décision.** `storeSignup` reçoit aussi `discoveredViaCanvasId` : à la première connexion, le callback lit `getActiveCanvasForOwner` du streamer d'origine (une lecture de plus, pour les seuls nouveaux comptes venus d'une page) et le web ajoute le compte aux trois points du canvas, comme au global. Le gateway ne lit donc jamais la clé du jour pour un canvas ; elle passe tout de même à 31 jours, comme le cahier des charges.
**Renoncement.** Pas de lecture de la clé du jour par le gateway (ni courbe ni audience par canvas exactes) ; un compte venu d'une page d'archive n'a pas de provenance, comme aujourd'hui (`/{login}` seul la porte).

## 2026-10-07 — Écart §5.1 : l'historique d'un canvas vit sous `activity:cv:<canvasId>:`, hors des clés du canvas

**Contexte.** La section Ce canvas (cahier des charges du suivi d'activité, §3) veut l'historique, les joueurs actifs et l'audience d'un seul canvas.
**Décision.** Par canvas, la même pyramide que l'historique global (minute 2 jours, heure 366 jours, jour sans limite), écrite seulement pour une minute où il s'y passe quelque chose ; un HyperLogLog des joueurs actifs par jour de Paris, 31 jours ; les nouveaux comptes par provenance passent de 48 h à 31 jours. Préfixe `activity:cv:<canvasId>:` et non `cv:<canvasId>:` : ce sont des nombres d'observation, que le worker ne sauvegarde pas et qu'une restauration n'attend pas. Le gateway verse à la minute, jamais à chaque pose.
**Renoncement.** Supprimer une archive ne supprime pas son historique (des nombres, quelques Ko) ; pas de comptes actifs ni de streamers actifs par canvas (le pic des personnes et les vues OBS les approchent).

## 2026-10-07 — Écart §4.3 : les frames `activity` et `activityHistory` disent aussi le canvas de la socket

**Contexte.** La section Ce canvas montre le canvas de la page ; le gateway sait déjà sur quel canvas est chaque socket.
**Décision.** `activity` gagne `here` (le canvas de la socket : chiffres de l'instant, audience, comptes connectés) et `activityHistory` gagne `canvasPoints` (les points de ce canvas, même période). Aucune frame client ne change, `PROTOCOL_VERSION` non plus : les pages d'avant ignorent les champs en plus (`z.object`).
**Renoncement.** Pas de `canvasId` demandé par le client : le développeur ne regarde que le canvas où il est, et une frame client stricte en plus aurait demandé une version.

## 2026-10-07 — Écart §5.1 : l'audience compte les comptes, joueurs et streamers distincts par HyperLogLog, sans garder qui

**Contexte.** L'audience du suivi d'activité (cahier des charges dédié, §3) veut des comptes, joueurs et streamers distincts sur le jour et sur 30 jours, alors que l'historique ne garde aucun identifiant (§4 du même document).
**Décision.** Un HyperLogLog par jour de Paris et par chiffre sous `activity:` (`PFADD`, `PFCOUNT` sur plusieurs clés pour les 30 jours), gardé 31 jours ; le gateway y verse les ensembles tenus en mémoire à chaque minute, et toutes les 2 s tant que le développeur regarde (sans quoi les distincts retarderaient d'une minute sur les visites), jamais à chaque pose ni à chaque connexion. Les points de l'historique gagnent `visits`, `phoneVisits` et `visitMinutes` (sommes) ; un point d'avant lit 0. Les frames serveur `activity` et `activityHistory` gagnent des champs : les pages d'avant les ignorent (`z.object`), `PROTOCOL_VERSION` ne change pas.
**Renoncement.** Pas de `SET` d'identifiants, même expirant (on pourrait y relire qui) ; pas de distincts par heure ni par minute (une clé de plus par heure, pour des courbes que le pic des personnes approche déjà).

## 2026-10-07 — Lexique : `visit`

**Contexte.** L'audience compte des pages du jeu ouvertes ; aucun mot du lexique ne les nomme, et `session` est réservé au cookie.
**Décision.** `visit` : une page du jeu ouverte, hors vue OBS ; un rechargement en fait une nouvelle, une reprise de la même page (`hello` avec `lastVersion`) non. Bannis : `pageview`, `hit`.
**Renoncement.** Pas de mot pour le temps passé : `visitMinutes` le dit.

## 2026-10-06 — Écart §10.3 et §11.5 : le développeur est nommé dans `domain`, et le gateway lit `BETA_LABEL`

**Contexte.** Seul `fenysk` voit le suivi d'activité, dans chaque environnement ; en production seulement, ses onglets ne comptent pas (cahier des charges du suivi d'activité, §1).
**Décision.** `DEVELOPER_USER_ID` (son `twitchId`) vit dans `packages/domain`, hors de `roleFor` : le web montre le bouton, le gateway décide d'envoyer (§10.3). Le gateway lit aussi `BETA_LABEL`, facultative et vide par défaut, que le compose lui passe : la production, c'est `PUBLIC_URL` en https et `BETA_LABEL` vide. Là, ses connexions et ses pixels sortent des chiffres et de l'historique, pas de la liste des connectés.
**Renoncement.** Pas de variable d'environnement pour le nommer (une ligne de plus dans cinq Compose, et un oubli le rendrait invisible) ; pas de nouveau rôle de canvas.

## 2026-10-06 — Écart §5.1 : l'activité garde des nombres dans Redis, sous `activity:`

**Contexte.** L'historique et la température doivent survivre à un redémarrage du gateway, et chaque environnement a les siens. Le Convex de dev est partagé par le poste et toutes les bêtas, et trois branches y poussent déjà.
**Décision.** Des clés `activity:` : l'historique en trois niveaux (minute 7 jours, heure 366 jours, jour sans limite ; le pic des personnes et des canvas streamés, la somme des pixels et des nouveaux comptes), les pixels de chaque canvas par minute (61 minutes), les nouveaux comptes du jour de Paris par provenance (48 h). Le gateway écrit à chaque minute et élague ; le web compte un nouveau compte au callback OAuth, quand `ensureCanvasForOwner` rend le candidat (première connexion). La liste des connexions reste en mémoire : §6.4 tient.
**Renoncement.** Pas de Convex (un push de plus sur un déploiement partagé, une écriture par minute) ; aucun nom ni identifiant dans l'historique.

## 2026-10-06 — Écart §4.2 et §4.3 : le développeur suit l'activité par le WebSocket, protocole 13

**Contexte.** La section Activité vit en direct ; le seul canal live est le WebSocket (§8.3), et seul le gateway connaît les connexions.
**Décision.** Deux frames client : `watchActivity` (`isWatching`) et `listActivityHistory` (`period` : `day`, `month` ou `all`, avec un `requestId`). Deux frames serveur : `activity` (les chiffres de l'instant et les canvas, toutes les 2 s tant que le développeur regarde) et `activityHistory`. Le gateway ignore ces deux frames venues d'une session qui n'est pas `DEVELOPER_USER_ID`. `PROTOCOL_VERSION` passe à 13 : la branche qui fusionne après une autre en 13 renumérote.
**Renoncement.** Ni fonction serveur du web interrogée en boucle (un second canal live, AP-14), ni route HTTP du gateway (Traefik ne lui envoie que `/ws`).

## 2026-10-06 — Lexique : `developer`, `activity`, `heat` et `signup`

**Contexte.** Le suivi d'activité apporte quatre concepts sans mot au lexique ; `admin` y est déjà banni au profit de `owner`.
**Décision.** `developer` : le compte qui voit le suivi, jamais un rôle de canvas (bannis : `superuser`, `staff`). `activity` : les chiffres du suivi et leur historique (bannis : `stats`, `metrics`, `analytics`, `telemetry`). `heat` : les pixels posés sur un canvas dans la dernière heure (banni : `temperature`). `signup` : un nouveau compte, compté à sa première connexion (banni : `registration`).
**Renoncement.** Pas de `presence` : « connecté » (`connected`) est déjà le mot du seuil de signalement.

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

## 2026-10-06 — Écart §15 : un canvas actif et cinq archives, sans `reset`, et ce qui est commun se recopie d'un canvas à l'autre

**Contexte.** Le cahier des charges « Plusieurs canvas » (06/10) fait archiver le canvas actif pour repartir sur un canvas vide, et rouvrir une archive. Le §15 prévoyait un `reset` (un `kind` de plus), et seule la résolution de `/{login}` devait changer.
**Décision.** Pas de `reset` : archiver fige le canvas (`archivedAt`, dans `meta` et dans Convex) et en crée un vide ; rouvrir échange une archive et le canvas actif. Les scripts qui écrivent refusent un canvas archivé. Bannis (origines et preuves), modérateurs, noms Twitch, synchro Twitch, délai et fond OBS sont recopiés du canvas qui sort vers celui qui entre, et remplacent les siens ; une action Twitch tombée sur un canvas archivé suit `successorId`. Le lien d'une archive porte un code de 10 caractères tiré par le web. Protocole 14 : le `welcome` dit l'archive, une frame annonce le changement de canvas actif.
**Renoncement.** Bannis et modérateurs rangés sous le streamer, sans copie : leurs clés sortiraient de `cv:<canvasId>:` (§5.1, le passage en cluster), le worker devrait sauvegarder une seconde unité, et la prod migrer ; à reprendre plus tard. Le `canvasId` dans le lien : tous ceux qui ont joué sur le canvas l'ont vu passer.

## 2026-10-06 — Écart §10.3 : le web archive, rouvre et supprime un canvas, après avoir vérifié le cookie du streamer

**Contexte.** Le canvas actif se lit dans Convex, où le gateway ne va jamais (§8.2) ; jusqu'ici, le web affichait et le gateway décidait (§10.3).
**Décision.** Ces trois actions sont des fonctions serveur `POST` du web : il vérifie `lp_session` avec le vérificateur de l'Écart §10.2, le streamer est celui de la session, puis il écrit dans Convex et dans Redis et prévient les pages par le canal `live` du canvas.
**Renoncement.** Ni Convex ouvert au gateway, ni relais entre le gateway et le web : une clé de plus à garder, ou une pièce de plus qui peut tomber.

## 2026-10-06 — Le lexique réserve « archive » au canvas archivé, et bannit `reset`

**Contexte.** Dans le plan, « archive » nommait aussi l'historique des poses que le worker range dans Convex : deux concepts pour un mot.
**Décision.** `lexique.json` gagne le nom `archive` (un canvas figé, en lecture seule, que son streamer peut rouvrir), les verbes `archive` (`reset` banni, comme dans le cahier des charges) et `reopen`. L'historique des poses garde `chunk` et « drainer » (§7.1), jamais `archive`, et les définitions d'`event`, `version` et `chunk` le disent.
**Renoncement.** Pas de mot à part pour le code (`freeze`…) : le code parle comme le cahier des charges.

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
