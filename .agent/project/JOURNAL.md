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

## 2026-10-08 — Écart §5.1 : une notification EventSub n'est appliquée qu'une fois, `twitch:message:<id>` en `SET NX EX 660`

**Contexte.** Twitch livre « au moins une fois » et demande de dédupliquer sur `Twitch-Eventsub-Message-Id` ; deux `channel.ban` au même identifiant donnaient deux actions en file, donc deux entrées de plus dans le flux et deux versions consommées (prouvé en local).
**Décision.** Après la signature et la fraîcheur, le web réserve l'identifiant (`reserveTwitchMessage`, 11 minutes : les 10 de fraîcheur + 1) ; déjà pris, il répond 204 sans rien appliquer. Si l'action échoue, il rend l'identifiant (`releaseTwitchMessage`) pour que la redélivrance passe. Seules les notifications sont retenues : la vérification et la révocation gardent leur comportement.
**Renoncement.** Réserver et mettre en file dans une même opération : l'action passe par Convex et helix, pas seulement Redis.

## 2026-10-08 — Écart §4.3 et §5.4 : un modérateur nommé ici ne se bannit pas, un banni ne modère plus

**Contexte.** Sur la bêta, un modérateur nommé sur LivePlace a pu être banni et restait modérateur : `moderate.lua` ne contrôlait que `mods`, et le gateway donnait le rôle sur ce seul ensemble. Il aurait pu retirer des pixels, bannir, se débannir.
**Décision.** `moderate.lua` refuse un `ban` contre un membre de `mods:liveplace`, de qui qu'il vienne (page, Twitch, script), et toute action d'un auteur banni ; `moderators.lua` refuse de nommer ici un banni. `isModerator` rend `false` pour un banni, modérateur Twitch compris (son rôle Twitch reste, le déban le rend), et le gateway relit le rôle sur son `banned` et son `unbanned`. Pour cacher Bannir, `moderatorOrigin` part à tout modérateur dans `inspected` (au streamer seul jusqu'ici, JOURNAL 2026-09-27) et la frame `reports` en gagne un : champs en plus, `PROTOCOL_VERSION` reste 17. Au démarrage, le gateway retire des modérateurs nommés ici ceux qui sont déjà bannis (l'état laissé par le bug), sans leur rendre le rôle au déban.
**Renoncement.** Pas de script à lancer à la main (un oubli au déploiement laisserait des modérateurs bannis) ; pas de rôle Twitch retiré à un banni (Twitch le rétablirait à chaque synchro) ; pas d'état « banni » dans `inspected` pour cacher Nommer modérateur : un banni n'a plus de pixel visible, et le serveur refuse.

## 2026-10-08 — Écart §8.1 et §9.3 : sur mobile, la pill Thème devient une bande, les pills du haut s'effacent en Dessin, le canvas se cadre dans la zone libre

**Contexte.** Sur un iPhone (393 px), la pill Compte passait par-dessus la pill Canvas, la catégorie du live se coupait deux fois, et la pill Thème, centrée sur deux lignes, laissait le canvas collé dessous et un vide au-dessus de la barre du bas.
**Décision.** Sur `COMPACT_SCREEN_QUERY` seulement, le PC ne change pas. La pill Canvas ne dépasse pas la place que la pill Compte publie (`--lp-top-right`) moins un espace ; dans le bouton live la catégorie cède la première (facteur de rétrécissement énorme, passage à la ligne rogné sous trois lettres), le nom en dernier. La pill Thème est une bande de la largeur de la rangée, « Thème » devant le thème à la taille `title` (jetons `--type-title-*`). En Dessin, `<html data-drafting>` (`useDraftingAttribute`) efface la rangée en fondu, puis par `visibility`, et monte la bande à sa place par `transform` ; le toast suit. L'arrivée, Recentrer, le 100 % et le zoom minimal se cadrent à 90 % dans la zone libre (`Insets` : bas de la rangée et de la bande en Vue, haut d'une barre du bas d'une ligne), relue à chaque mesure : la vue ne suit que si elle n'a pas bougé depuis l'arrivée, un viewport retrouvé jamais.
**Renoncement.** Monter la bande par `top` : le cadrage lit sa place de Vue, qui ne doit pas bouger. Suivre la hauteur réelle de la barre du bas : la feuille Dessin, un refus ou l'invitation d'un invité déplaceraient le canvas. Le plafond de 64 px de la catégorie reste aux autres endroits du bouton live. Recadrer à chaque redimensionnement : le PC ne l'a jamais fait.

## 2026-10-08 — Écart §5.1 : un point d'avant le live compte 0 canvas streamé, comme un canvas seul

**Contexte.** L'entrée suivante (même jour) relisait un point global d'avant `be45208` par sa vue OBS seule, alors qu'un point de canvas du même moment vaut 0 : la courbe de tout LivePlace montrait 1 canvas streamé quand celle du canvas n'en montrait aucun.
**Décision.** Un point global à 3 ou 6 champs se lit avec 0 canvas streamé : sans live connu, pas de stream. Les autres chiffres de ces points ne changent pas.
**Renoncement.** La courbe globale d'avant `be45208` perd ses canvas streamés : on ne peut pas savoir après coup qui était en live.

## 2026-10-08 — Écart §5.1 : un seul indice, « streamé », vue OBS ouverte et streamer en live

**Contexte.** L'entrée précédente (même jour) a gardé deux notions, « streamé » (vue OBS ouverte) et « en live » (et streamer en live) ; Alexis n'en veut qu'une : une vue OBS ouverte hors live n'est pas un stream.
**Décision.** « Streamé » = au moins une vue OBS ouverte **et** le streamer en live (`listTwitchLives`). C'est le seul état suivi : à l'instant, dans la liste des canvas, chez les streamers actifs, et dans l'historique, où la coupure de moins de 5 minutes se comble sur cet état seul (`activity:seen` garde son heure). Les points écrivent cet état dans `streamed` et dans `live` ; à la lecture, un point à 7 champs donne `live`, un point d'avant (3 ou 6 champs, avant `be45208`) donne `streamed`, qui n'y était que la vue OBS. Le canvas garde ses vues OBS comme détail, sans courbe.
**Renoncement.** Pas de réécriture des points d'avant : on ne sait pas, après coup, qui était en live.

## 2026-10-08 — Écart §5.1 : une coupure de moins de 5 minutes se comble dans l'historique, sans jamais prolonger un stream

**Contexte.** Le suivi d'activité croise la vue OBS et le live Twitch (cahier des charges dédié, §2) ; une coupure de quelques minutes, côté LivePlace (redéploiement, reconnexion d'OBS) ou côté Twitch (stream qui retombe), ne doit pas couper un stream en deux, mais la fin d'un stream ne doit pas s'allonger.
**Décision.** À l'instant, l'état réel. Le gateway garde par canvas l'heure de la dernière vue OBS ouverte et celle du dernier live vu (lu par `listTwitchLives`, une lecture groupée par tic, seulement pour les canvas streamés), versées à la minute dans un HASH `activity:seen` relu au démarrage. Quand la vue ou le live revient moins de 5 minutes après, un script comble les minutes du trou dans les points (global et canvas). Les points gagnent `live` ; frames serveur : champs ajoutés, `PROTOCOL_VERSION` ne change pas.
**Renoncement.** Pas de tolérance à l'instant (on ne sait pas encore si le stream reviendra) ; pas de tolérance réglable ; pas d'abonnement Twitch de plus.

## 2026-10-07 — Écart §4 et §10.1 : le live Twitch d'un compte, suivi par EventSub, protocole 17

**Contexte.** Le logo Twitch d'un profil doit dire si la personne est en live, et dans quelle catégorie, au plus près du réel et sans charge ; le plan ne prévoit aucun statut de live.
**Décision.** Chaque compte est abonné, avec le jeton de l'application (coût 0 pour qui a autorisé l'app), à `stream.online`, `stream.offline` et `channel.update`, à sa connexion, à la première visite de son canvas et, au démarrage du web, pour tous les comptes du miroir `user:` (un SCAN, un compte toutes les 400 ms) ; l'état de départ vient de `helix/streams`, la catégorie de `helix/channels`. Le web garde l'état dans Redis et le confie au gateway par la file `twitch:commands` ; protocole 17, après le 16 du thème : le `welcome` (le propriétaire de la page et soi), l'`inspected` (l'auteur), le streamer de chaque canvas de l'activité du développeur (une lecture groupée) et une frame de contrôle à chaque changement. Une visite de `/{login}` revérifie le propriétaire en arrière-plan si son état date de plus de 5 min : un live resté allumé s'éteint, et la bêta comme le poste, sans EventSub, suivent quand même. Le lexique gagne `twitchLive`, `tokens.css` les teintes du live.
**Renoncement.** Sonder `helix/streams` en boucle (1 à 2 min de retard, un processus de plus) ; ComfyJS, car le chat ne dit pas si un stream tourne ; une vue OBS connectée, qui ne prouve pas un live ; un statut pour qui n'a pas de compte LivePlace (1 par abonnement, plafond de 10 000).

## 2026-10-07 — Écart §8.1 : le nom du canvas devient son thème, `canvases.theme` dans Convex, copié dans `cv:<id>:meta`

**Contexte.** Le nom facultatif d'un canvas ne servait qu'au titre de ses archives ; le streamer en fait le thème du jeu, montré à tous en haut de la page (demande de l'humain). Un seul champ, un seul mot, partout.
**Décision.** `canvases.name` devient `canvases.theme` (mutations `archiveActive` et `setTheme`, port `setActiveCanvasTheme`, `THEME_MAX_LENGTH`, `toTheme`). Étendre puis contracter, pour que le code déjà déployé (bêtas, autres worktrees, la production entre `convex deploy` et le redéploiement du web) ne casse pas : le schéma garde `name` optionnel, `rename` garde sa signature d'avant (`name` facultatif) et règle le thème, `archiveActive` accepte aussi `name`, pris comme thème quand `theme` est absent, et la migration `canvases:moveNameToTheme` (idempotente, lancée après le push) recopie `name` dans `theme` quand `theme` est vide, sans retirer `name` : l'ancien code continue d'afficher ses titres. Aucun nouveau code ne lit `name`. Convex fait foi ; `cv:<id>:meta` en garde la copie du gateway (`theme`), écrite après Convex à l'enregistrement, à l'archivage (le thème du dialogue va sur l'archive, le canvas neuf n'en a pas) et à la réouverture, en best effort journalisé : si Redis échoue, le thème est enregistré mais la copie garde l'ancien jusqu'au prochain enregistrement, archivage ou réouverture. `/{login}` lit le thème dans l'appel qui rend déjà le canvas actif : la pill est rendue par le serveur, sans aller-retour de plus.
**Renoncement.** Pas de frame client `setTheme` (le gateway n'a pas le droit d'aller dans Convex, et c'est Convex qui tranche) ; pas de renommage en un seul push (les documents d'avant ne valideraient plus) ni de migration à la lecture ; pas de thème par archive indépendant du canvas (une archive rouverte retrouve celui qu'elle avait) ; pas de retrait de `name` dans ce push.
**Contraction.** Le retrait de `name` (schéma), de la mutation `rename` et de l'alias de `archiveActive` se fait plus tard, dans une branche `chore/` à part, une fois tout le code déployé sur le nouveau.

## 2026-10-07 — Écart §4.3 : le thème du canvas part dans le `welcome` et dans la frame `theme`, protocole 16

**Contexte.** Tous les viewers voient le thème, et le voient changer sans recharger, comme le délai OBS ou le fond (demande de l'humain).
**Décision.** `welcome.params.theme` (facultatif, borné à `THEME_MAX_LENGTH`) et la frame serveur `theme` (sans `theme` : plus de thème), relayée par le gateway depuis le `ctl` `theme` du canal `live`, que le web publie à l'enregistrement. Aucune frame client. `PROTOCOL_VERSION` passe à 16, après le 15 de la capacité : les pages ouvertes se rechargent au déploiement ; dans les tests des protocoles 11 à 15, « 15 accepté » devient « 15 refusé » et « = 15 » devient « ≥ 15 ».
**Renoncement.** Pas de frame réservée aux pages du jeu (la vue OBS reçoit le thème et ne l'affiche pas, comme le reste des réglages) ; pas de `theme` dans `canvasStatus` (un canvas qui change de statut ne change pas de thème).

## 2026-10-07 — Lexique : `theme` et `appearance`

**Contexte.** Le nom du canvas devient son thème, et le mot « thème » désignait déjà le choix clair, sombre ou auto du navigateur.
**Décision.** `theme` : un texte du streamer sur un canvas, montré à tous en haut du jeu, titre de son archive ; jamais clair/sombre. `appearance` : clair, sombre ou auto, le choix d'un joueur retenu dans son navigateur (`data-appearance`) ; jamais le `theme`. Banni : `skin` pour `theme` (aucun identifiant ne le porte).
**Renoncement.** Pas de `scheme` banni pour `appearance` (`ws-client.ts` le déclare, pour le `wss:`) ; la clé `localStorage` `liveplace:theme` garde sa valeur, la changer ferait perdre son choix à chaque joueur.

## 2026-10-07 — Écart §6 : la capacité compte le retard de diffusion, sans l'attente voulue du tick

**Contexte.** Le délai de diffusion mesuré (de `occurredAt` à l'envoi de la frame) a un plancher d'environ 100 ms, l'attente du tick (D-13) : au repos, la ligne affiche déjà 49 % et passerait à l'orange sans vraie charge.
**Décision.** Le retard d'une pose = l'envoi de sa frame − `occurredAt` − l'attente voulue : de son arrivée dans le tampon du canvas jusqu'à l'heure prévue du tick qui l'envoie (le tick précédent + l'intervalle), tick sauté par la diffusion adaptative compris. Restent comptés l'aller-retour Redis et le pub/sub, le retard du tick sur son heure, et la construction de la frame. Plafond : 100 ms (la cible de 250 ms du §12.3, moins le tick et le réseau). L'identifiant `gatewayDelay` ne change pas : pas de protocole.
**Renoncement.** Retrancher l'intervalle entier du tick (une pose arrivée juste avant lui serait comptée à zéro, un vrai retard masqué).

## 2026-10-07 — Écart §11.3 : Redis a 2 Go en production, réglés par `REDIS_MAXMEMORY`

**Contexte.** L'analyse de scalabilité du 07/10 montre que la mémoire de Redis est le premier plafond : un canvas très joué pèse des dizaines de Mo, et un streamer garde jusqu'à cinq archives. Le §11.3 fixe 512 Mo, « à réajuster selon la RAM du VPS, en gardant Redis sous la moitié du total ».
**Décision.** `--maxmemory ${REDIS_MAXMEMORY:-512mb}` dans le compose ; la Compose de production porte `REDIS_MAXMEMORY=2gb` (8 Go sur le VPS, de la marge pour la copie de l'AOF et les quatre Redis des bêtas, qui gardent 512 Mo). La section Capacité lit le plafond sur Redis : il suit seul.
**Renoncement.** 4 Go, la moitié du VPS : les bêtas et le fork de réécriture de l'AOF partagent la même machine. Un `CONFIG SET` à chaud : le compose reprendrait 512 Mo au déploiement suivant.

## 2026-10-07 — Écart §4.3 : la section Capacité de la fenêtre Développeur, ses teintes en tokens, ses processeurs en cœurs

**Contexte.** La maquette validée veut un grand pourcentage vert, orange ou rouge, des barres de taux, et un processeur dit « 9 % de 4 cœurs » ; `tokens.css` n'a ni vert ni orange d'état, ni grande taille de texte, et la frame ne dit pas les cœurs.
**Décision.** `tokens.css` gagne `--success` (le vert de la jauge), `--warning`, `.lp-type-display`, `.lp-success` et `.lp-warning`. La barre d'une ressource est un `<meter>` natif, jamais un `style` que la CSP de production bloque dans le HTML du serveur. Les processeurs de Redis (un cœur) et de la machine (ses cœurs, lus avec la mesure) se disent en cœurs, `unit: "cores"`. `TimeCharts` accepte une échelle fixe de 0 à 100 % et un trou par courbe, `HistoryBlock` sert l'activité et la capacité.
**Renoncement.** Une largeur de barre posée par `style` ; le processeur en pourcentage de 100 %, qui ne dirait pas les cœurs ; un second bloc d'historique recopié pour la capacité.

## 2026-10-07 — Écart §4.2 et §4.3 : le développeur suit la capacité par le WebSocket, protocole 15

**Contexte.** Comme l'activité, la capacité (cahier des charges dédié, 07/10) vit en direct, et seul le gateway la rassemble.
**Décision.** Deux frames client, `watchCapacity` (`isWatching`) et `listCapacityHistory` (`period`, `requestId`) ; deux frames serveur, `capacity` (toutes les 2 s tant que le développeur regarde) et `capacityHistory`. Ignorées hors de `DEVELOPER_USER_ID`. `PROTOCOL_VERSION` passe à 15.
**Renoncement.** La capacité dans la frame `activity` : deux sections, et chacune ne part que si on la regarde.

## 2026-10-07 — Écart §5.1 et §6 : le gateway mesure la capacité toutes les 10 s et en garde les pics sous `capacity:`

**Contexte.** La section Capacité veut chaque ressource au plus près des vraies données : Redis, le gateway, la machine, et ce que le web dépose.
**Décision.** Toutes les 10 s, le gateway lit `INFO` de Redis (mémoire et `maxmemory`, processeur, refus `OOM`), la machine par le module `os` de Node (celle de l'hôte, même depuis un conteneur), son occupation (ELU), les octets de ses sockets, le délai de diffusion (de `occurredAt` à l'envoi de la frame) et les mesures du web dans Redis. Chaque minute, il garde les pics sous `capacity:` (minute 7 jours, heure 366 jours, jour sans limite). Les plafonds fixes vivent dans `domain`, le plan Convex compris.
**Renoncement.** Prometheus, Grafana et un exporteur : trois conteneurs et une interface de plus, pour un seul lecteur. `MEMORY USAGE` par clé : il faudrait un `SCAN`.

## 2026-10-07 — Écart §2 et §9 : le web lit l'usage de Convex et mesure sa propre occupation, par une tâche de fond

**Contexte.** Les quotas Convex se comptent pour l'équipe, et seule l'API de déploiement les donne (`GET /api/v1/get_current_usage`, en bêta, `Authorization: Convex <clé de déploiement>`). Le gateway ne parle jamais à Convex (§2), et le worker n'est pas en production.
**Décision.** Le plugin de démarrage du web lance deux minuteries : toutes les 15 min, l'usage de chaque déploiement de `CONVEX_USAGE_DEPLOYMENTS` (facultative, des paires « URL clé ») ; toutes les 10 s, son occupation (ELU). Il les écrit dans Redis sous `capacity:`. Sans la variable, Convex est « non mesuré » ; en production, « sans nouvelles ».
**Renoncement.** Le worker (pas en production) ; le gateway vers Convex (§2). Une clé de déploiement peut aussi déployer : celle de la production ne va qu'au web de la production.

## 2026-10-07 — Lexique : `capacity`, `ceiling` et `saturation`

**Contexte.** La section Capacité apporte trois concepts sans mot ; `quota` est déjà banni (synonyme de `gauge`), comme `metrics` et `telemetry`.
**Décision.** `capacity` : les ressources de LivePlace face à leur plafond, et leur historique. `ceiling` : le plafond d'une ressource, comme celui de la jauge (`gaugeMaxCeiling`) ; un quota Convex est un `ceiling`. `saturation` : le plus haut taux, et la ressource qui le porte (banni : `pressure`).
**Renoncement.** Pas de mot pour le taux (`ratio`, un nombre) ni pour la ressource (un champ de `capacity`).

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
