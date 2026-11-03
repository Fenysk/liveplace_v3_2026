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

**Bloc 2**, du 4 au 31 octobre 2026 : [`archives/JOURNAL--bloc-2.md`](archives/JOURNAL--bloc-2.md).
Tout y est absorbé par le plan d'architecture du bloc 3, qui fait foi.

- Le protocole (§4) : versions 11 à 23, `staleList`, le classement, le suivi et la capacité du développeur, l'archive et `canvasStatus`, le thème, le live Twitch, `canvas_recovering`, l'image du fond, un jour passé, `movedAtVersion`, la taille dynamique et `origin`.
- Le noyau Redis (§5) : le champ `p` du flux, un modérateur nommé ici qui ne se bannit pas, le classement (`scoreboard`), la taille dynamique (`reframe`, `origin`), le rapprochement avant de couper, `restore.lua`, une notification EventSub appliquée une fois.
- Le gateway (§6) : dix poses par seconde, fermeture `1013` à 1 Mio de plus que la plus grosse frame, le retard de diffusion sans l'attente du tick, `staleList`, les mesures du suivi.
- Le worker (§7) : le snapshot complet en fichier, l'historique en chunks, la récupération d'un canvas perdu (+1 000 000), la pyramide des sauvegardes et le budget, la découverte par Redis, `DURABLE_SCOPE`, le bail.
- Convex (§8) : la production sur son propre déploiement, snapshots et chunks en fichiers, `storageUsage`, le thème, l'image du fond, supprimer une archive efface ses sauvegardes.
- Le web, le canvas et la jauge (§9.1 à §9.5) : les routes, le verdict d'un canvas introuvable, la vue qui s'anime, entrer en Dessin sans toucher la vue, le curseur, l'aperçu de croissance, le tube « 8/20 », le fond et son image.
- L'interface (§9.6 à §9.9, §9.11, §9.12) : la pill Dessin, le mobile, la colonne latérale et les charnières, les toasts et les fenêtres, les bulles d'aide et le tutoriel, les deux langues, « fresque », l'accessibilité.
- L'accueil et la carte d'aperçu (§9.10) : la page d'accueil et sa démo, « avec Twitch », la carte dessinée par Satori, le manifest, l'icône « LP ».
- Twitch et la session (§10) : le web vérifie aussi le cookie, le web archive, rouvre et supprime, le live d'un compte par EventSub, une bêta ne s'abonne jamais.
- Le suivi du développeur (§16) : l'activité sous `activity:`, l'audience par HyperLogLog, « streamé » et la coupure de 5 minutes, un jour passé, la capacité et ses 17 ressources, les protections comptées.
- Les archives (§17) : un canvas actif et cinq archives, pas de `reset`, le commun recopié, le lien d'une archive, l'ordre archiver, rouvrir, supprimer.
- Le déploiement, les tests et le gate (§11, §12, §14) : les emplacements de bêta, Redis à 2 Go, un Redis jetable par lancement de tests, un chantier par worktree et un hook, le gate qui ignore les worktrees, quinze noms et deux verbes au lexique.

---

## 2026-11-03 — Le badge Soutien dès la réception d'un don, le Classement lu en un aller-retour, Mon compte, la section Badges du développeur, la ligne de la fenêtre de soutien et la confidentialité

**Contexte.** Lot 3 du CDC des badges (§3 et §4). Le lot 2 avait renoncé à écrire le miroir à la réception du webhook (`record` ne disait pas quel compte) et lisait les badges de « ta place » par un `MULTI` par viewer connecté, toutes les 2,5 s : un coût qui grandit avec l'audience. Alexis a ajouté : Mon compte n'affiche aucune date, un badge expiré y reste identique.
**Décision.** `DonationOutcome` rend le compte relié (`user`, avec son `userId`) : le miroir a besoin du nom et de la photo, sans second appel à Convex. Un doublon d'un don relié rend le compte aussi : si Redis tombe après Convex, le renvoi de Ko-fi réécrit le miroir. Un seul écrivain, `writeSupportMirror` (`toSupportMirror` puis `setUser`), appelé à la connexion, à la réception d'un don relié et au lien manuel. `listScoreboardRanks` lit les rangs et les champs des badges (le `hmget` du miroir, les deux `sismember`) dans un seul pipeline : un aller-retour vers Redis, quel que soit le nombre de viewers ; `composeBadges` garde la règle. Mon compte lit son Soutien (titre, jamais de date) par une fonction serveur `POST` à l'ouverture de la fenêtre, depuis Convex : une donnée rare, aucune lecture par page, le protocole ne bouge pas. La section Badges de la fenêtre Développeur (icône `Award`, après Capacité, en français comme ses sœurs) passe aussi par deux fonctions serveur `POST` dont la session doit être `isDeveloper` : le nombre de titulaires (comptes dont le dernier don + 12 mois n'est pas passé, lu par un index `by_donatedAt` sur la fenêtre utile) et les dons non reliés (nom et e-mail Ko-fi, date, jamais le montant) ; « Relier » trouve le compte par son pseudo dans la même transaction Convex, pose le `userId`, efface l'e-mail et le nom Ko-fi, puis écrit le miroir. La fenêtre de soutien dit en une ligne atténuée quoi faire pour recevoir le badge ; la confidentialité dit ce qui est gardé d'un don.
**Renoncement.** Un champ `support` dans `you` du protocole : le gateway lirait le miroir à chaque connexion de page, pour une donnée que seul Mon compte montre. Une date dans Mon compte, ou un badge atténué quand il est expiré. Ne pas réécrire le miroir au doublon : un renvoi de Ko-fi après une panne de Redis laisserait le badge attendre la prochaine connexion. Le montant d'un don dans la section Badges.

## 2026-11-03 — Les badges Soutien et Modérateur à côté du pseudo : protocole 25, catalogue dans `domain`, le Soutien porté par le miroir `user:<userId>`

**Contexte.** CDC des badges §1 à §3 : un seul signe distingue un viewer, une icône à côté du pseudo. Alexis a validé la maquette du 03/11 : Lucide, `Heart` plein en `--support` et `Shield` en `--ink`, 18 px sans fond, Modérateur puis Soutien, Classement de 196 à 248 px, infobulle en `popover`.
**Décision.** Protocole 25 : `badges` (ids courts, absent = aucun) dans `inspected`, chaque ligne du Classement et sa place `you`, `bans`, `moderators` et `reports`. Le catalogue vit dans `domain/badges.ts` : `moderator` et `support.<titre>`, un client ignore un id inconnu, un id ne se réutilise jamais. Le gateway compose à l'affichage sans lire Convex (D-02) : `supportTitle` et `supportEndsAt` du miroir `user:<userId>`, écrits par le web à la connexion avec `setUser` (un badge expiré ne part pas, aucune tâche planifiée) ; Modérateur depuis `cv:<id>:mods`, sauf un banni (le streamer n'y est jamais). Supprimer le compte efface le miroir, donc ces champs. `createCanvasCore` reçoit l'horloge (`now`, `Date.now` par défaut).
**Renoncement.** Écrire le miroir à la réception du webhook : `donations.record` rend `linked` sans dire quel compte, il faut une évolution de Convex, hors de ce lot (un badge reçu hors connexion attend la prochaine connexion). Un `style` pour placer l'infobulle : des variables posées par le CSSOM, comme la bulle d'aide.

## 2026-11-03 — Le webhook Ko-fi : `POST /kofi/webhook`, une table Convex `donations` clée par `message_id`, un don relié par l'e-mail Twitch seulement s'il est unique

**Contexte.** Le badge Soutien (CDC des badges §3) vient d'un don Ko-fi, sans intervention d'Alexis. Ko-fi poste un corps `application/x-www-form-urlencoded` dont le champ `data` porte le JSON, et renvoie le même `message_id` tant qu'il n'a pas son 200 ; ses envois de test partagent tous un `kofi_transaction_id`.
**Décision.** Route publique, sans session ni cookie, jeton `KOFI_VERIFICATION_TOKEN` comparé à temps constant (503 sans variable, 401 faux jeton, corps borné à 16 Ko). `Donation`, `Tip` et `Subscription` comptent, chaque paiement d'abonnement aussi ; le reste est ignoré, sans lire `shipping`. Table `donations` : `kofiMessageId` unique (indexé), `kofiTransactionId` sans unicité, montant en centimes tel quel (sans conversion de monnaie), monnaie, date, `userId` ; l'e-mail (minuscules) et le nom Ko-fi seulement tant que le don n'est pas relié ; jamais le message ni `discord_*`, `url`, `shop_items`, `shipping`, `tier_name`. Relié si exactement un compte porte l'e-mail (nouvel index `users.by_email`, e-mail écrit en minuscules à la connexion), à la réception et à chaque connexion ; zéro ou plusieurs comptes : il attend. `deleteByUserId` efface les dons reliés dans sa transaction. Domain : `supportTitle` (cumul à vie) et `supportEndsAt` (dernier don + 12 mois calendaires, UTC).
**Renoncement.** Une conversion de monnaie (la page Ko-fi est en euros). Garder le message du donateur. Une unicité sur `kofi_transaction_id` : les envois de test de Ko-fi en partagent un seul. `convex-test` : une dépendance de plus pour trois fonctions, un faux `db` de test suffit.

## 2026-11-03 — `GET /healthz` sur l'hôte public : 200 `ok` seulement si Redis, le gateway et le worker battent ; le gateway écrit un battement comme le worker

**Contexte.** Un service de surveillance hors du VPS interroge LivePlace chaque minute et prévient après 2 échecs. Depuis Internet, seule la page web répond : le `/healthz` du gateway est interne (Traefik ne route que `Path(/ws)`), et le web ne peut pas l'appeler par son nom, car `gateway` désigne aussi ceux des autres Compose sur `dokploy-network`.
**Décision.** Le web sert `GET /healthz` : 200 `ok` si Redis répond au `PING` et si `gateway:heartbeat` et `worker:heartbeat` existent, sinon 503 avec les noms des parties en échec (`redis`, `gateway`, `worker`) séparés par une virgule, rien d'autre. Chaque sonde a 2 s, `Cache-Control: no-store`, `X-Robots-Tag: noindex`. Le gateway écrit `gateway:heartbeat` (TTL 30 s) toutes les 10 s une fois son serveur ouvert ; les deux clés vivent dans `redis-core`, le worker y prend la sienne. Avec `DURABLE_SCOPE=off` le worker bat quand même : une bêta n'est pas en échec pour autant.
**Renoncement.** Un appel HTTP du web au gateway par son nom. La capacité du gateway (`capacity:minute`) : écrite à la minute close, donc 70 à 130 s de retard, et un trou égal à l'arrêt plus 70 s après chaque redémarrage, soit un faux 503 après chaque déploiement.

## 2026-11-02 — `/confidentialite` passe en deux colonnes au PC, avec un sommaire collant qui suit la section lue (variante A, décision d'Alexis)

**Contexte.** Le texte complet de la politique ajoutera des sections, et la page n'était qu'une pill de 280 px sans réglages. Alexis a choisi la variante A de la maquette du 02/11 : deux colonnes au PC, le sommaire à gauche, le texte sur 720 px à droite.
**Décision.** La page prend l'en-tête de l'accueil (`lp-home-page`, `HomeSettings`). Dès 1100 px de bloc (`@container lp-home`) : sommaire collant de 240 px, carte de 784 px ; dessous, une colonne de 600 px sans sommaire. La page et le sommaire lisent une seule liste (`privacySections`), et la section courante se mesure par `IntersectionObserver` (une ligne au quart haut de la fenêtre, un repère en bas de page pour la dernière section), sans écouteur de défilement. Le sommaire reste dans `ui/privacy`, hors du design system, tant qu'une seconde page ne le demande pas.
**Renoncement.** N'afficher le sommaire qu'à partir de deux sections : la page changerait de forme le jour où le texte arrive. Un écouteur `scroll` : une mesure de géométrie à chaque image.

## 2026-11-02 — La confirmation dit toujours « ta fresque, tes archives et ta vue OBS », pour tout compte (décision d'Alexis)

**Contexte.** Au lot 2, la ligne ne s'affichait que sur sa propre fresque (`isOwner`). Or chaque compte reçoit une fresque à sa première connexion (`ensureCanvasForOwner`), et `deleteAccount` l'efface toujours : un viewer sur la fresque d'un autre n'apprenait pas que la sienne partait.
**Décision.** `DeleteAccountWindow` n'a plus de prop `isOwner` : la ligne est rendue pour tous, où que la fenêtre s'ouvre. Dans `/design`, les deux scènes de la confirmation (streamer, viewer) ne différaient que par ce drapeau : elles n'en font plus qu'une ; celles de Mon compte gardent leurs deux rôles, que sépare la barre latérale.
**Renoncement.** Garder le drapeau et ne l'afficher qu'aux comptes qui ont dessiné sur leur fresque : un compte la reçoit sans y poser rien, la suppression l'efface quand même.

## 2026-11-02 — La politique dit une troisième chose : le compte sort aussi des sauvegardes, en 24 heures au plus

**Contexte.** La section « Supprimer ton compte » n'avait que deux phrases (une règle d'Alexis). Le lot 3 réécrit les fichiers de Convex et la durée devient une promesse : elle doit être celle que le code tient, `dump.rdb` et AOF de Redis compris.
**Décision.** Une phrase de plus, 24 heures. Ce que le code tient, une fois la suppression faite : l'AOF est réécrit aussitôt (`BGREWRITEAOF`, repris chaque minute s'il était occupé), `dump.rdb` en 1 heure au plus (`save 3600 1`), les fichiers de Convex par une passe du worker ouverte dans les 5 minutes, reprise toutes les 5 minutes si Convex coupe, et un fichier sans ligne qui nommait encore le compte en 2 heures au plus (1 h de grâce, un passage par heure). 24 heures laissent la place à un redéploiement du worker ou à une panne de Convex d'une journée.
**Renoncement.** « 1 heure » : vrai seulement tant que le worker tourne et que Convex répond. Rien sur les sauvegardes d'un hébergeur : il n'y en a aucune (Contabo, Dokploy, Convex vérifiés le 01/11).

## 2026-11-02 — Ce que Twitch nomme d'un compte supprimé ne se redépose pas : la garde du live s'applique aux actions, aux noms et à l'abonnement de modération

**Contexte.** Un `ban`, `unban`, `moderator` livré par Twitch après la purge, ou une liste complète de la synchro d'un streamer, redéposait le compte dans `twitch:commands` et son nom dans `twitch:users` ; une synchro qui coupe une suppression recréait les abonnements de modération que l'effacement venait de retirer.
**Décision.** `queueTwitchCommands` et `setTwitchUsers` lisent `isDeletedAccount` dans le même script que l'écriture (comme `setTwitchLiveState`) : une action sur un seul compte supprimé n'est pas écrite, une liste complète perd son identifiant et reste écrite (une liste vide dit que personne ne reste). `createTwitchWrites` prend le secret des sessions, que le web a déjà. La synchro s'abonne comme le suivi du live : pas pour un compte supprimé, et retrait de ce qu'elle vient de créer si l'effacement a passé pendant l'appel.
**Renoncement.** Filtrer côté TypeScript avant d'écrire : un effacement passerait entre la lecture et l'écriture. Garder le compte supprimé dans les listes de la synchro : Twitch le redonnerait à chaque synchro, pour 31 jours, avec son nom. Les clés d'une fresque déjà supprimée (`setTwitchSync` après la purge) restent hors de ce lot.

## 2026-11-02 — Les fresques supprimées avec leur compte sont inscrites dans `activity:gone`, et le suivi d'activité n'écrit plus rien pour elles

**Contexte.** `purgeOwnedCanvases` efface les compteurs `activity:cv:<canvasId>:*`, mais le gateway garde la minute en cours, la file des minutes closes et les heures de stream en mémoire : il les recréait à la minute suivante, et rien ne les efface plus (le jour n'expire jamais). Aucune identité dedans, mais une fresque disparue qui revit.
**Décision.** La purge inscrit les identifiants de ses fresques dans `activity:gone` (un SET, expiré 2 jours après la dernière inscription : le gateway ne garde rien plus de cinq minutes). Les écritures du suivi qui nomment un canvas (`storeActivityMinute`, `storeActivityGap`, `storeSeen`, `storeSignup`) lisent cet ensemble d'abord et passent le canvas.
**Renoncement.** Exiger `cv:<canvasId>:meta` pour écrire : une lecture par canvas et par minute, et des dizaines de tests du suivi qui écrivent pour des canvas qui n'existent pas dans Redis. Faire oublier la fresque au gateway au statut `discarded` : une minute déjà close attendrait encore dans sa file.

## 2026-11-02 — Un fichier sans ligne qui le désigne part au bout d'une heure, par un passage horaire du worker

**Contexte.** Un fichier envoyé sans ligne (échec entre l'envoi et l'enregistrement, réécriture coupée) n'est compté nulle part (§7.3) et aucun ménage ne l'atteint : il garde, sans fin, ce qu'il contenait, un compte supprimé compris. Une adresse d'envoi de Convex vit une heure.
**Décision.** `orphans:purge`, une mutation par lots de 100 fichiers : elle lit `_storage` du plus ancien au plus récent à partir d'une borne, ne touche à aucun fichier de moins d'une heure (l'adresse d'envoi a expiré, l'enregistrement est fait ou raté), et retire celui qu'aucune ligne (`snapshots`, `chunks`, l'image d'un canvas) ne désigne. Le worker la rappelle une fois par heure et retient la borne : un fichier désigné ne devient jamais orphelin, un passage ne relit que les fichiers arrivés depuis. Le premier passage lit tout le dépôt une fois : 300 lectures d'index pour 100 fichiers.
**Renoncement.** Un cron Convex : il tournerait aussi sur un déploiement sans worker, mais ne se teste pas avec les cycles et demande son propre déploiement. Une table des envois en cours : une écriture de plus à chaque fichier, pour un cas rare.

## 2026-11-02 — Les empreintes de session des comptes supprimés sont gardées 31 jours dans Convex, et le web les remet dans Redis quand il les perd

**Contexte.** `deleted:account:<empreinte>` (lot 1) ne vit que dans Redis : après une perte totale, la session de 30 jours d'un compte supprimé redevient valide, et le gateway recrée des traces à sa pose suivante.
**Décision.** Table additive `deletedAccounts` (l'empreinte HMAC et l'instant, jamais l'identifiant), écrite par la routine dès l'effacement inscrit, retirée au bout de 31 jours : la vie d'un jeton et un jour, plus que la plus longue sauvegarde complète (7 jours, palier `daily`). Le web, seul à avoir `SESSION_SECRET` avec le gateway, relit la liste quand sa sentinelle `deleted:accounts:synced` manque dans Redis (au démarrage, après une perte) et repose chaque clé avec le temps qui lui reste. Aucun secret de plus, nulle part.
**Renoncement.** Relire la liste chaque minute : 43 000 appels Convex par mois pour un cas qui n'arrive pas. La poser dans la même transaction que la ligne du compte : l'empreinte existe déjà dans Redis dès l'inscription, et une reprise la réécrit.

## 2026-11-02 — Une restauration ne remet jamais un compte supprimé : la réécriture suffit, et pendant qu'elle dure la restauration applique la même règle

**Contexte.** `restore.lua` et la récupération recréent `user:` et toutes les traces d'un snapshot, même si Redis a tout perdu, `deleted:account:<empreinte>` comprise. L'audit prévoyait une liste d'empreintes HMAC, réappliquée après chaque restauration : le worker n'a pas `SESSION_SECRET`, et un secret de plus demanderait à Alexis de le poser en prod et en bêta.
**Décision.** Aucune liste dans le worker. Une fois la passe finie, aucun fichier ne nomme le compte (A, B, D) : il n'y a plus rien à restaurer. Tant qu'elle dure, la récupération lit les demandes de `erasures` (l'identifiant en clair, seulement le temps du travail, gardé dans Convex qu'un Redis perdu n'atteint pas) et applique la règle du lot au snapshot qu'elle remet, avant d'écrire quoi que ce soit.
**Renoncement.** Une empreinte HMAC dans le worker, comparée à chaque restauration : un secret de plus, et rien à comparer une fois les fichiers propres. Un hachage simple de l'identifiant Twitch : un nombre, retrouvé par force brute.

## 2026-11-02 — Le worker réécrit les fichiers d'un compte supprimé, sur une demande gardée dans Convex, dans son tour de boucle

**Contexte.** Rien ne relie un compte aux fichiers qui le nomment, et un chunk garde ses auteurs sans limite de durée. La course : un snapshot lu dans Redis avant la purge et enregistré après la réécriture nommerait encore le compte. Redis peut tout perdre : une demande qui n'y serait gardée partirait avec lui.
**Décision.** `deleteAccount` inscrit la demande dans la table `erasures` de Convex (l'identifiant en clair, le temps du travail) APRÈS la purge de Redis. Le worker ouvre une passe à son tour de boucle : il lit les lignes de tous les scopes, ne télécharge que les fichiers dont le filtre dit « peut-être » (un fichier sans filtre est lu une fois et reçoit le sien), réécrit chaque fichier qui nomme un compte demandé (le nouveau fichier et la ligne avant le départ de l'ancien), puis solde la demande. Une passe sert tous les comptes demandés. Les cycles du worker se suivent dans une seule boucle : aucune sauvegarde n'est à moitié faite quand la passe s'ouvre, et toute lecture de Redis d'après est postérieure à la purge.
**Renoncement.** Réécrire dans la routine du web : brotli de plusieurs Mo dans le processus qui sert les pages, et une course à fermer entre deux processus. La demande dans `deletions:pending` : un FLUSHALL l'emporte. Borner la réécriture par l'heure de la demande : une horloge en avance d'une seconde laisserait le compte dans un fichier ; un compte qui se reconnecte pendant la passe y perd, au pire, l'auteur de ses premiers pixels dans les sauvegardes, jamais dans le jeu.

## 2026-11-02 — Une sauvegarde nomme un compte supprimé comme Redis le nommait : une règle pure dans `domain`, prouvée égale à celle de Redis

**Contexte.** Les fichiers de Convex (snapshots complets, chunks) nomment le compte partout où Redis le nommait. Le lot 1 l'efface de Redis par des scripts Lua : une seconde règle écrite à côté dériverait de la première.
**Décision.** `deleteAccountFromSnapshot` et `deleteAccountFromChunk` (domain) appliquent à un fichier la règle de chaque donnée de `account-purge.ts` : `deleted` là où Redis garde `deleted`, retiré là où Redis retire. Un test fait tourner les deux sur un même monde, avec le vrai Redis, et exige le même snapshot et le même flux. Chaque ligne d'un fichier gardera un filtre de Bloom des comptes qu'il nomme (`createAccountsFilter`) : une suppression ne lira que les fichiers qui peuvent nommer le compte.
**Renoncement.** Rejouer les scripts Lua sur le fichier restauré dans un espace de travail de Redis : une règle unique par construction, mais jusqu'à 65 000 piles écrites par fichier dans le Redis qui sert le jeu. Une empreinte HMAC par fichier : le worker n'a pas `SESSION_SECRET`. Lire tous les fichiers à chaque suppression : l'historique pèse jusqu'à 700 Mo, le plan Free sort 1 Go de fichiers par mois.

## 2026-11-02 — Une connexion dont le jeton n'a plus le droit de lire l'e-mail efface l'e-mail gardé

**Contexte.** Contrat Twitch VI.F : retirer un droit (la réduction de portée) oblige à effacer ce qu'il avait permis de garder. `upsertFromTwitch` n'écrivait l'e-mail que s'il était présent (« l'e-mail à chaque connexion », §8.1) : sans lui, celui d'avant restait.
**Décision.** Sur un compte connu, la ligne prend l'e-mail du jeton, ou aucun : `toUserPatch` le met à `undefined`, et `db.patch` retire un champ à `undefined`. Un compte sans e-mail vérifié chez Twitch le perd de même. Le web n'envoie déjà l'e-mail que s'il existe.
**Renoncement.** Garder en base le droit accordé à la dernière connexion : un champ de plus à tenir à jour, pour déduire ce que le jeton dit déjà.

## 2026-11-02 — L'image du fond se garde un jour, sans `immutable`

**Contexte.** `public, max-age=1 an, immutable` : la copie d'une image supprimée avec le compte restait un an dans les navigateurs, sans même être revérifiée.
**Décision.** `public, max-age=86400`. L'adresse porte l'instant de l'image (`?v=<at>`) : changer d'image change d'adresse, le délai ne retarde donc jamais un changement. L'adresse d'une image supprimée répond 404 sans cache, et une copie sort seule en 24 h au plus.
**Renoncement.** `no-store` : chaque ouverture d'une fresque relirait dans Convex une image de 2 Mo au plus, pour tous. Une heure : les rechargements d'une journée de stream y repasseraient sans bénéfice pour la vie privée.

## 2026-11-02 — Les journaux n'écrivent aucun compte : un test lit le code, au lieu d'une consigne

**Contexte.** Le gateway journalisait la commande Twitch entière (comptes compris), le web des identifiants de suivi et l'adresse d'une photo, qui porte souvent le pseudo. Un journal Docker garde 3 fichiers de 10 Mo jusqu'au déploiement suivant : ce qui y entre nomme une personne que l'effacement ne retrouve pas.
**Décision.** Un message dit ce qui a échoué (le genre de la commande, « une photo »), jamais pour qui. Un test lit chaque `console.*` du dépôt, texte des chaînes exclu, et refuse dans ses arguments `userId`, `login`, `displayName`, `email`, `url`, `command` (sauf `command.kind`)… Il ne voit pas ce que contient une erreur reçue d'une bibliothèque : un message d'erreur ne cite pas les valeurs qu'il refuse.
**Renoncement.** Un filtre à l'exécution qui caviarde les journaux : il masquerait la faute au lieu de la faire corriger. Le journal système du VPS (journald) reste hors de ce lot.

## 2026-11-02 — « Compte supprimé » passe de la page qui supprime à l'accueil par un mot du stockage de l'onglet, et cette page reste en place jusque-là

**Contexte.** Après l'effacement la page rentre à l'accueil, déconnectée, avec un toast, et l'adresse reste `/`. Pendant l'attente le gateway ferme la socket (4001) : la page redevient celle d'un invité, la fresque d'un streamer qui se supprime devient « introuvable », et la fenêtre de Mon compte disparaît avec l'identité.
**Décision.** `sessionStorage` : la page laisse `liveplace:account-deleted`, l'accueil le lit une fois et le retire. La confirmation et son état vivent dans la page, pas dans ses pills : tant que l'effacement tourne, ni « introuvable » ni « connexion perdue », et la fenêtre reste verrouillée. Juste avant de partir l'appareil oublie toutes ses clés `liveplace:*`, brouillons compris. « Ta fresque, tes archives et ta vue OBS » ne se dit que sur sa propre fresque : le streamer et le viewer de la maquette.
**Renoncement.** Un paramètre d'adresse (`/?deleted=1`) : l'adresse resterait sale et se copierait. Un cookie posé par le serveur : un cookie de plus à envoyer et à effacer, pour un mot que la page lit seule. Laisser la page se reconnecter en invité et dire « connexion perdue » : le toast parasite que la confirmation exclut.

## 2026-11-02 — Le bouton efface par `POST /auth/delete-account` : l'origine est contrôlée, et la page attend la routine 10 s au plus

**Contexte.** Le bouton de Mon compte appelle le serveur avec la session. `SameSite=Lax` tient les sites étrangers à l'écart, mais pas un autre sous-domaine du même site (une bêta) : un effacement n'a pas de retour, un contrôle de plus se justifie. Une routine sur un grand compte peut durer plus longtemps qu'une personne n'attend.
**Décision.** Le `POST` exige un `Origin` égal à l'origine de `PUBLIC_URL`, comme le WebSocket du gateway ; sans `Origin`, il refuse (403). Dès que l'effacement est inscrit dans `deletions:pending` il est acquis : la réponse part quand la routine finit, ou après 10 s, en succès dans les deux cas, et efface `lp_session` dans la même réponse (`lp_locale` reste). Avant l'inscription, une erreur se dit (502) et rien n'est perdu.
**Renoncement.** Un jeton anti-CSRF : un état serveur de plus, pour un risque que l'`Origin` ferme déjà. Attendre la routine sans borne : une page figée sur « effacement… » dont la personne ne sait plus si elle peut fermer l'onglet.

## 2026-11-02 — Le suivi du live ne recrée rien pour un compte supprimé : une garde dans le même script que l'écriture

**Contexte.** `track` (connexion, première visite), `trackKnownAccounts` (400 ms par compte au démarrage) et les événements de Twitch en route écrivaient `twitch:live:<userId>`, l'action `twitchLive` du gateway et des abonnements de live, parfois après la purge. Le lot 1 l'avait vu.
**Décision.** Un compte est « supprimé » tant que `deletions:pending` le nomme, ou que son empreinte du lot 1 est posée et que son miroir `user:` n'est pas revenu (se reconnecter pose un miroir neuf : l'empreinte, gardée 31 jours, ne condamne pas le compte neuf). Un script Lua écrit l'état et l'action ensemble et refuse les deux pour un compte supprimé (`setTwitchLiveState` rend faux). `track` ne s'abonne pas pour lui, et retire ce que Twitch vient de créer si l'effacement a passé pendant l'appel.
**Renoncement.** Exiger le miroir `user:` pour tout suivi : une bêta ou un poste, où le miroir manque pour un streamer jamais connecté, ne montrerait plus aucun live. Comparer des horloges (début du suivi contre heure de la suppression) : deux lectures, un trou possible entre elles.

## 2026-11-02 — L'accès retiré dans Twitch : un abonnement pour toute l'application, un 204 aussitôt, les abonnements du compte retirés en dernier

**Contexte.** `user.authorization.revoke` (version 1) a pour condition le `client_id`, jamais une chaîne, et ne se livre que par webhook. Twitch veut un 2xx en quelques secondes. Ses abonnements de live et de modération nomment le compte supprimé, quel que soit le déclencheur.
**Décision.** `subscribeToAccessRevoked` se crée au démarrage du web puis toutes les 6 h, avec la règle des autres abonnements (https public, jamais une bêta ni le poste). La notification, signature vérifiée d'abord et doublon écarté par `Twitch-Eventsub-Message-Id`, inscrit l'effacement dans `deletions:pending` puis répond ; la routine et la reprise finissent. `deleteSubscriptions` est la dernière étape avant `finish` : une panne de Twitch ne retarde aucun effacement chez nous, la reprise refait cette étape seule.
**Renoncement.** Attendre la fin de l'effacement avant de répondre à Twitch : un compte avec beaucoup de traces dépasserait le délai et Twitch couperait l'abonnement. Retirer les abonnements en premier : une panne de Twitch bloquerait tout l'effacement.

## 2026-11-02 — Jamais deux exécutions de `deleteAccount` à la fois pour un compte

**Contexte.** Un double clic, ou la reprise de la minute qui tombe pendant une exécution, lançaient deux fois la routine. Le flux `events` d'une fresque se réécrit dans une clé de travail : la seconde exécution la vide sous la première, qui échange alors une copie incomplète contre le flux. Deux demandes en même temps tiraient aussi chacune leur `runId`, donc deux preuves.
**Décision.** Une exécution par compte et par processus : la seconde demande, ou la reprise, rejoint celle en cours. Le `runId` qui fait foi est celui que Redis a gardé. Un seul web tourne par Redis.
**Renoncement.** Un verrou Redis : il protégerait deux web sur un même Redis, qui n'existent pas, et ajouterait un délai d'expiration à régler.

## 2026-11-01 — Protocole 24 : l'auteur d'un compte supprimé se dit `isDeleted`, et la modération n'y vise que la pose

**Contexte.** Les pixels d'un compte supprimé restent sous l'auteur `deleted` (CDC §8, Inspection). L'inspection lui donnait l'identifiant `deleted` en guise de pseudo, sans photo, et un ancien client lisait un compte à ouvrir. Le CDC dit « Compte supprimé » sans photo ni lien, et pour qui modère une seule cible : cette pose.
**Décision.** Version 24 : `isDeleted` (facultatif) dans l'entrée de `inspected` et dans chaque signalement de `reports`, avec `login` et `displayName` vides. La pill dit « Compte supprimé » sans lien ; elle propose Signaler, et pour qui modère « Effacer ce dessin », sans plage, sans « Effacer tous ses dessins », sans Bannir. Le serveur tient la règle aussi : `moderate.lua` refuse `clearUser`, `ban`, `unban` et une plage sur `deleted`, `report.lua` refuse une plage sur sa pose (`forbidden`).
**Renoncement.** Un champ `author: "deleted"` en union avec le profil : tous les lecteurs de l'entrée changeraient de forme. Laisser le web décider seul de cacher les actions : le gateway décide, le web affiche (§10.3).

## 2026-11-01 — Écart §8.1 : la preuve d'un effacement vit dans Convex, écrite avec la ligne du compte ; la reprise passe par le démarrage du web et la reconnexion

**Contexte.** RGPD art. 5.2 : prouver l'effacement, sans nom, sans e-mail, sans identifiant. Redis se vide (panne, `FLUSHALL`), Convex dure. Le web peut s'arrêter en plein effacement (crash, redéploiement) : l'identifiant ne reste alors que dans `deletions:pending`, le temps de l'effacement, et l'effacement doit reprendre seul.
**Décision.** Table additive `accountDeletions` : `runId` (tiré au hasard au début de l'effacement et gardé dans l'effacement en cours), `deletedAt`, le déclencheur, et ce qui est parti (`hasEmail`, `ownedCanvases`). La mutation qui supprime la ligne `users` l'écrit dans la même transaction, par `runId` : une reprise ne la double pas. Index additif `by_discoveredVia` pour vider `discoveredViaUserId` par lots. Le web relance, au démarrage puis chaque minute, tout effacement resté en cours et la réécriture de l'AOF restée à faire (`resumePendingDeletions`, qui ne rejette jamais) ; une reconnexion du même compte termine d'abord son effacement, sans quoi il effacerait le compte neuf.
**Renoncement.** La preuve dans Redis : elle partirait avec lui. Écrire la preuve après l'effacement de la ligne : un arrêt entre les deux perdrait la preuve d'un effacement fait. Vider `discoveredViaUserId` sans index : un parcours de toute la table `users`, borné par les limites d'une transaction Convex.

## 2026-11-01 — Écart §10.2 : la session d'un compte supprimé est refusée par une empreinte HMAC gardée 31 jours

**Contexte.** `lp_session` est un JWT de 30 jours sans état, vérifié sans réseau par le web et le gateway, et le gateway accepte une pose sur sa seule foi : sans mesure, un compte supprimé garderait sa session et recréerait des traces à la pose suivante. Se reconnecter après la suppression doit pourtant créer un compte neuf.
**Décision.** `HMAC-SHA256(SESSION_SECRET, "liveplace:deleted-account:v1:" + userId)`, un secret qui existe déjà et un libellé à lui : aucune variable d'environnement de plus. Redis garde `deleted:account:<empreinte>` → l'instant de la suppression, 31 jours (30 de jeton et un de marge). Les deux vérificateurs rendent un invité quand l'`iat` du jeton précède la seconde de la suppression ; un jeton émis à cette seconde ou après est celui d'une reconnexion. Le début et la fin de l'effacement annoncent le compte sur `accounts:deleted` : le gateway ferme ses connexions et celles des pages de ses fresques (code 4001), et oublie ce qu'il savait de lui (`owners`, `canvasOwners`).
**Renoncement.** Garder l'identifiant, même en liste courte : il nomme la personne. Passer aux sessions à état dans Convex : une lecture réseau à chaque vérification du gateway, contre le choix D-09. Changer `SESSION_SECRET` : cela déconnecterait tout le monde.

## 2026-11-01 — Écart §5.1 et §8 : le flux `events` d'un compte supprimé est réécrit, jamais rogné

**Contexte.** Chaque pose et chaque modération du flux nomment `authorId` et `moderation.target`, sur 20 000 entrées sans limite de temps ; l'effacement d'un compte ne doit en laisser aucune. Le gateway ne lit ni l'un ni l'autre (le fil de la page ne les porte jamais) ; seul le worker les range dans les chunks.
**Décision.** `purgeTraces` recopie le flux de chaque fresque qui nomme le compte dans une clé de travail, par tranches de 500, en remplaçant la valeur `"<userId>"` par `"deleted"` dans l'événement, puis recopie ce qui est arrivé depuis et prend sa place d'un seul `RENAME` (script Lua). Versions, cases, champ `p` et ordre ne bougent pas : le resync, le `recent` de la vue OBS et l'historique du worker lisent le même flux.
**Renoncement.** `XDEL` des entrées du compte : le trou ferait refuser le rattrapage (`listEvents` exige toutes les versions) et le worker noterait des versions perdues, donc des poses d'autrui effacées de l'historique.

## 2026-11-01 — Les signalements d'un compte supprimé partent, ceux qu'il a reçus restent sous « deleted »

**Contexte.** `reports:<auteur>:<pose>` nomme l'auteur dans sa clé et les signaleurs dans ses membres ; `reported`, `offstream` et `approved` nomment la pose (`<auteur>:<pose>`). Le CDC veut que ses signalements partent sans rien rendre au stream de ce qui est déjà caché.
**Décision.** Signaleur : il sort de chaque `reports:`. Un ensemble qui se vide perd sa pose de `reported`, sauf si elle est cachée du stream (`offstream`) : elle garde alors un signaleur anonyme `deleted`, car `reportCount` est strictement positif sur le fil et la pose reste à trancher. Auteur : `reports:deleted:<pose>` reçoit les membres, et `reported`, `offstream` et `approved` renomment la pose (`deleted:<pose>`) ; une pose que `cleared:placements` couvre part. Les poses cachées restent cachées, rien n'est rendu au stream.
**Renoncement.** Tout supprimer avec l'auteur : une pose cachée par le public reviendrait sur le stream au moment où son auteur s'en va, ce que le CDC interdit. Réduire `reportCount` à son minimum de 0 : la frame `reports` serait refusée par son schéma.

## 2026-11-01 — `deleteAccount` parcourt les fresques au lieu de tenir un index par compte

**Contexte.** Aucun index ne relie un `userId` à ses fresques, et ses traces tiennent dans une trentaine de familles de clés (piles, bannis, modérateurs, signalements, noms, classement, flux), y compris sur les fresques où il n'a jamais posé : `copyShared` recopie bannis et modérateurs vers chaque fresque neuve, un ancien modérateur ne laisse que ses actions dans le flux.
**Décision.** Un parcours à chaque suppression : `SCAN cv:*:meta` pour les fresques, un `SCAN` des clés de signalements, un seul balayage `cv:*:hist:*` côté Redis pour les piles des fresques où le compte a une progression, une jauge ou des cases, puis un script atomique par fresque. Les auteurs de ses cases deviennent `deleted` (une valeur sans identité, `DELETED_AUTHOR`), sauf les entrées qu'une pierre tombale couvre, qui partent : sans elles, effacer les pierres tombales les ferait réapparaître sous un dessin retiré. Chaque script est idempotent, et la reprise après une coupure relance le même parcours.
**Renoncement.** Un index `userId` → fresques : un `SADD` de plus par pose dans `place.lua`, un rattrapage de toutes les fresques existantes, et il ne dirait rien des bannis qui n'ont jamais posé ni des anciens modérateurs. Un index incomplet est pire qu'un parcours : la règle est qu'aucune clé ni valeur ne nomme le compte.

## 2026-11-01 — Lexique : `delete` et `deleted` ne disent plus que la suppression d'un compte

**Contexte.** Le CDC nomme la routine `deleteAccount` (§8, lexique du CDC) et le pseudo-auteur des pixels d'un compte supprimé en dépend. Le lexique bannit `delete` comme verbe de `clear` et `deleted` comme nom de `cleared` : le gate refuse `deleteAccount`, `DELETED_AUTHOR` et `isDeleted`.
**Décision.** `delete` quitte les verbes bannis de `clear` et devient un verbe du lexique, pour un compte entier ; `deleted` quitte les noms bannis de `cleared` et devient `deletedAccount` (un compte supprimé, dont les pixels restent sous l'auteur `deleted`, sans identité). `remove`, `erase`, `hidden` et `tombstone` restent bannis : un pixel retiré par la modération reste `cleared`.
**Renoncement.** Nommer autrement (`purgeAccount`, `erasedAuthor`) : le CDC et son lexique disent `deleteAccount`, et deux mots pour une même action font deux implémentations à terme. Le lexique garde la limite écrite dans sa définition ; rien d'autre n'est desserré.
