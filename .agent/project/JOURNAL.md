# JOURNAL

Append-only. On ajoute en haut, on ne réécrit jamais, on ne supprime jamais.

Une entrée existe pour **deux raisons seulement** : une décision a changé ce que le gate accepte
(architecture.json, lexique.json, un seuil, une règle désactivée), ou elle contredit un plan
(plan d'architecture, plan du jour). Tout le reste — ce qui a été fait, ce qui marche — se lit
dans le code et dans le gate. Un journal qui raconte le travail devient un doublon du dépôt,
et un doublon dérive.

Format : 5 lignes maximum. Si ça demande plus, la décision n'est pas mûre.
Un écart visible dans le code y porte le marqueur `Écart §x.y (JOURNAL AAAA-MM-JJ)`.

---

## 2026-09-29 — Écart §5.4 : la preuve d'un ban qui suit un retrait

**Contexte.** Après Retirer, la fenêtre propose de bannir l'auteur (demande de l'humain). La preuve d'un ban, ce sont ses pixels visibles au moment du ban : ceux qu'on vient de retirer n'y seraient plus.
**Décision.** Le dépilage garde chaque pixel qu'il ôte à la cible dans `cleared:recent:<userId>` (`cellKey` → `colorIndex`), une heure à partir du dernier retrait. `ban` les ajoute à sa preuve, sous ses pixels visibles, puis efface la clé.
**Renoncement.** Pas de preuve envoyée par la page : c'est le serveur qui sait ce qui a été retiré.

## 2026-09-28 — Écart §4.2, §4.3 et §9.5 : protocole 6, la case telle que le stream la voit

**Contexte.** Une pose signalée quitte la vue OBS, pas la page (A3). La vue OBS ne connaît ni les piles ni les poses : le serveur doit lui dire quoi montrer.
**Décision.** Une case (`EventCell`, `BroadcastCell`) peut porter `obs` : sa couleur, sa couleur d'avant et sa date vues par le stream, seulement quand une pose cachée est en jeu. Genres `hide` et `unhide` : immédiats dans la vue OBS, ignorés par la page. `place` porte `placementId` ; `inspected`, `placementId` et `canReport` ; `pixels`, l'heure et la pose. Frames `report` → `reported`, `listReports` → `reports`, `reportCount` pour qui modère. À son arrivée, la vue OBS reçoit un snapshot corrigé par les cases des poses cachées.
**Renoncement.** Pas `obsColorIndex` seul (plan du jour, B) : un pixel posé sur une pose cachée pendant le délai referait paraître la pose au rechargement de la source, dont le `recent` revient à `previousColorIndex`.

## 2026-09-28 — Écart §5.4 : `clearPlacement`, `approvePlacement` et `report.lua`

**Contexte.** Plan du jour, B : retirer une pose ou une plage, Rétablir, signaler. Les quatre scripts lisent les piles et les pierres tombales de la même façon.
**Décision.** `moderate.lua` apprend `clearPlacement` (une pose, et une plage d'heures si demandée, en tranches comme `clearUser`, sans vider `cells:`) et `approvePlacement` (en une fois). `report.lua` compte un signalement ; au seuil reçu du gateway, la pose entre dans `offstream` et un `hide` part. `pile.lua`, collé devant chaque script par `client.ts`, lit une entrée, les pierres tombales et la couleur vue par le stream.
**Renoncement.** Un banni ne signale pas. Un modérateur, si : tout compte connecté signale (A0).

## 2026-09-28 — Écart §5.1 et §5.3 : la pose entre dans la pile, et ses clés ont une rétention

**Contexte.** Un brouillon validé peut partir en plusieurs envois (A1). Le plan du jour (B) prévoyait `pose-of` et `pose:<id>` : une entrée et une clé de plus à chaque pose, sans rétention possible (CDC §6). `hidden` est banni du lexique (synonyme de `cleared`).
**Décision.** L'entrée de pile gagne un cinquième champ, `placementId` (tiré par la page, il commence par une lettre) ; une entrée plus ancienne a pour pose sa version. Une pose se nomme `<userId>:<placementId>`. Clés : `cleared:placements`, `cleared:ranges`, `approved` (vivent avec le canvas, comme `cleared`), `reports:<pose>` et `reported` (jusqu'à la décision d'un modérateur, ou élagués par `listReports` quand la pose n'a plus de pixel visible), `offstream` (jusqu'au retrait ou à Rétablir).
**Renoncement.** Pas d'index pose → cases : ses cases se retrouvent par la tête des cases visibles de l'auteur (au plus width × height lectures), au signalement, au Rétablir et à l'arrivée d'une vue OBS seulement.

## 2026-09-27 — Écart CDC 2026 §2 et §4.2 : le streamer nomme un modérateur depuis la pill Inspection

**Contexte.** Le CDC 2026 met « délégation à des modérateurs » hors du MVP. L'humain veut pouvoir nommer quelqu'un qui n'est pas modérateur sur sa chaîne Twitch (A4). La pill Inspection connaît l'identifiant de l'auteur, le streamer l'y reçoit.
**Décision.** Une frame `setModerator` (`userId`, `isModerator`), pour le seul `owner`, change l'origine LivePlace (`moderators.lua`) et répond par `moderators`. L'entrée d'inspection gagne, pour le seul `owner`, `moderatorOrigin` quand l'auteur est modérateur : la pill propose Nommer, Retirer (s'il est nommé ici) ou rien (s'il ne vient que de Twitch).
**Renoncement.** Pas de recherche par pseudo : il faudrait appeler Twitch pour qui n'a jamais posé ici (bloc 2). Un modérateur venu de Twitch ne se retire que sur Twitch.

## 2026-09-27 — Écart §9 et §11.5 : `/twitch/eventsub`, une route publique gardée par la seule signature de Twitch

**Contexte.** Pour rester à jour sans garder de jeton (A2), Twitch prévient d'un ban ou d'un modérateur par un POST sur une adresse publique. N'importe qui peut poster sur cette adresse.
**Décision.** Le web sert `POST /twitch/eventsub`. L'adaptateur Twitch vérifie le HMAC-SHA256 (`id + horodatage + corps`, comparaison à temps constant) avec `TWITCH_EVENTSUB_SECRET`, refuse plus de 10 minutes d'écart (`403`, rien d'écrit), puis lit le snake_case. Le usecase répond au `challenge` ; il dépose les bans définitifs, les débans et les modérateurs dans `twitch:commands` ; il note une révocation dans `meta`. La variable est obligatoire, de 10 à 100 caractères (bornes de Twitch).
**Renoncement.** Pas de liste des `message_id` déjà vus : chaque action est idempotente côté gateway, un message rejoué ne double rien.

## 2026-09-27 — Écart §10.1 : deux droits de plus, pour le seul streamer qui synchronise sa chaîne

**Contexte.** La synchro Twitch (A1) lit les modérateurs et les bans d'une chaîne (`moderation:read`), puis s'abonne à ses bans (`channel:moderate`, EventSub). Le §10.1 ne demande aucun droit, et l'écran de Twitch affiche chacun.
**Décision.** `authorizeUrl` reçoit un but : `signIn` demande l'e-mail seul (JOURNAL du même jour), `sync` y ajoute ces deux droits. `getChannelFromCode` lit l'utilisateur, ses modérateurs et ses bans, 100 par page, avec le token qui vient d'arriver. Le token ne sort pas de l'adaptateur et n'est pas gardé.
**Renoncement.** Pas ces droits à chaque connexion : tous les viewers verraient l'écran de modération. Pas de token gardé pour relire la chaîne plus tard : EventSub prévient, avec le jeton de l'application.

## 2026-09-27 — Écart §2 : les actions venues de Twitch passent par une file que le gateway applique

**Contexte.** Le plan de la synchro faisait appliquer les bans Twitch par le web. Or le §2 le lui interdit (« le web ne parle jamais aux pixels ») et `clearUser` retire des pixels. Et dans le serveur empaqueté par Nitro, `redis-core` ne trouverait pas ses `.lua` (JOURNAL 2026-09-19).
**Décision.** Le web dépose chaque action (`ban`, `unban`, modérateur) dans le stream `twitch:commands`. Le gateway la lit par un groupe de consommateurs, sur sa propre connexion, et l'applique avec l'origine Twitch, au nom du streamer. Une action lue mais pas acquittée avant un arrêt repasse au démarrage. Une action qui échoue est journalisée puis acquittée : la synchro suivante la rattrape. Le web écrit lui-même `twitch:users`, qui n'est qu'un nom.
**Renoncement.** Pas de Lua dans le web, ni d'import du Lua comme texte. Pas de PUB/SUB : un message publié pendant un redéploiement du gateway serait perdu.

## 2026-09-27 — Écart §4.2 et §4.3 : `listModerators`, et les bannis marqués par leur origine et leur compte

**Contexte.** La section Modération doit montrer les modérateurs, d'où ils viennent, et qui n'a pas encore de compte LivePlace (A4, A5). Aucune frame ne liste les modérateurs, et `bans` ne dit ni l'origine ni le compte.
**Décision.** `listModerators` → `moderators`, pour `owner` et `moderator`, comme `listBans`. Un modérateur porte `isFromTwitch`, `isNamedHere` et `hasAccount` ; un banni, `isFromTwitch` et `hasAccount`, et son nom Twitch quand il n'a pas de miroir. Le test « lists the banned users » attend donc ces deux marques.
**Renoncement.** Pas de modérateurs joints au `welcome` : la liste vieillirait pendant la session, comme celle des bannis (JOURNAL 2026-09-25).

## 2026-09-27 — Écart §10.3 et §4.3 : le rôle se relit en direct, et `PROTOCOL_VERSION` passe à 5

**Contexte.** Le §10.3 fixe le rôle au `hello`, pour toute la connexion. Avec la synchro Twitch, un modérateur est nommé ou retiré pendant qu'il a la page ouverte : retiré, il garderait Retirer et Bannir jusqu'à sa reconnexion.
**Décision.** Sur le `ctl` `role` de `moderators.lua`, le gateway relit `isModerator` pour les seules sockets de cette personne, met leur rôle à jour et leur envoie la frame `role`. Chaque commande lit ce rôle à jour. Une nouvelle frame : `PROTOCOL_VERSION` passe à 5.
**Renoncement.** Pas de relecture de `mods` à chaque commande : une lecture Redis de plus par action, pour un changement rare, et la page ne l'apprendrait toujours pas.

## 2026-09-27 — Écart §5.1 : les modérateurs gardent leur origine, et les noms Twitch de ceux qui n'ont pas de compte

**Contexte.** La synchro Twitch (A4, A5) nomme modérateurs ceux de la chaîne, le streamer peut en nommer d'autres ici, et un retrait sur Twitch ne doit pas retirer celui qu'il a nommé. Le §5.1 n'a que `cv:<id>:mods`, vide jusqu'ici.
**Décision.** `mods` reste le seul SET lu (`isModerator`, `moderate.lua`) : l'union de `cv:<id>:mods:twitch` et `cv:<id>:mods:liveplace`, tenue par `moderators.lua`, sans version, qui publie un `ctl` `role`. Le streamer n'en est jamais membre. Le HASH `cv:<id>:twitch:users` (`userId → {login, displayName}`) nomme qui n'a pas de miroir `user:`.
**Renoncement.** Pas de miroir `user:` écrit pour qui n'a pas de compte : son existence dit qu'on a un compte, `hasAccount` en dépend.

## 2026-09-27 — Écart §5.1 et §5.4 : un ban garde son origine, et un déban Twitch ne lève qu'un ban venu de Twitch

**Contexte.** La synchro Twitch (plan du jour « Synchro Twitch », A3) bannit ici qui l'est sur Twitch. Mais un déban Twitch ne doit jamais lever un ban posé sur LivePlace, et `cv:<id>:bans` ne dit pas d'où vient un ban.
**Décision.** `moderate.lua` reçoit une origine (`liveplace` par défaut, ou `twitch`). Un `ban` Twitch n'entre dans le SET `cv:<id>:bans:twitch` que s'il ajoute vraiment le ban. Un `unban` Twitch hors de ce SET ne fait rien : ni version, ni événement. Tout `unban` l'en retire.
**Renoncement.** Pas d'origine dans `bans` lui-même (un HASH à la place du SET) : `place.lua` et `isBanned` le lisent tels quels, et resteraient à réécrire pour rien.

## 2026-09-27 — Écart §10.1 et §8.1 : le droit `user:read:email`, et l'e-mail et le lien de découverte dans Convex seulement

**Contexte.** L'humain veut l'e-mail de chaque compte, et savoir par quel streamer chacun a découvert LivePlace. Le §10.1 ne demande aucun droit à Twitch, et `users` (§8.1) ne garde que l'identité publique.
**Décision.** L'OAuth demande `user:read:email`. `users` gagne `email` (réécrit à chaque connexion quand Twitch en donne un) et `discoveredViaUserId` (le streamer de la page d'où part la première connexion, jamais soi-même, jamais réécrit), tous deux optionnels. L'e-mail ne va qu'à Convex : ni dans la session, ni dans le miroir `user:`, ni dans une frame. Aucun envoi avant un consentement (bloc 2).
**Renoncement.** Pas de reconnexion forcée : l'e-mail arrive à la prochaine connexion de chacun, 30 jours au plus. Pas de lien pour les comptes d'avant : l'adresse de leur première connexion est perdue.

## 2026-09-27 — Écart §4.3 : l'identifiant de l'auteur inspecté ne part qu'à qui modère, et `inspect` est plafonné

**Contexte.** L'audit de sécurité du 26/09 (§1) : sans compte, un script lisait l'identité Twitch complète de chaque auteur, sur tout le canvas et sans limite. Le CDC 2026 veut pourtant qu'un invité inspecte.
**Décision.** `userId` devient optionnel dans `InspectEntry` : il ne part qu'aux rôles `owner` et `moderator`, qui s'en servent pour Retirer et Bannir. Au plus 10 `inspect` par seconde et par connexion ; au-delà, un `rate_limited` qui porte le `requestId` refusé, sans fermer. Le test « for a guest too » attend donc un auteur sans identifiant. `PROTOCOL_VERSION` passe à 4.
**Renoncement.** Pas d'identifiant propre à LivePlace : Redis, la session et les bans sont rangés par l'identifiant Twitch. Pas de plafond par IP : derrière Cloudflare, il faudrait lire l'en-tête du proxy (au bilan).

## 2026-09-26 — Écart D-13 : un gros canvas est diffusé moins souvent, et sa frame n'est sérialisée qu'une fois

**Contexte.** Au test de charge du 26/09 (vault, `Test_de_charge--Bloc_1`), le CPU du gateway lâche sur le VPS vers 1 000 viewers d'un stream. Une micro-mesure montre qu'un message coûte presque autant à 6 cases qu'à 20 : c'est le nombre de messages qui pèse.
**Décision.** Le tick reste à `BROADCAST_HZ`, mais un canvas n'est vidé qu'un tick sur N, avec N = ⌈clients / 500⌉, au plus 3 : 10 Hz jusqu'à 500 clients, 5 Hz jusqu'à 1 000, 3,3 Hz au-delà (50 à 100 ms de latence en plus). La frame `cells` est construite une fois par tick, et `ws-server` n'en fait le JSON qu'une fois.
**Renoncement.** Pas de `BROADCAST_HZ` baissé pour tous : les petits canvas, peu coûteux, perdraient leur réactivité. Pas de compression : elle coûte le CPU qui manque.

## 2026-09-25 — Une pose non confirmée attend la reprise : un test du J10 change d'attente

**Contexte.** Sans reconnexion, une coupure échouait les lots en attente (« closed ») et rendait leurs couleurs : c'est ce que vérifie le test du J10 « resolves as closed when the connection drops ». Le CDC 2026 (Envoi) veut que le `requestId` empêche toute double pose au renvoi, et le plan du J10 remettait ce renvoi à la reconnexion.
**Décision.** Une coupure laisse les lots en attente, couleurs comprises. Au `welcome` suivant, ceux partis il y a moins de 100 s repartent avec leur `requestId` (l'`ack` reste gardé 120 s par `place.lua`), les autres échouent en « closed ». Le test du J10 attend désormais le renvoi, avec une assertion de plus.
**Renoncement.** Pas de « closed » à la coupure suivi d'une nouvelle validation : un lot posé dont l'`ack` s'est perdu serait posé deux fois, et coûterait deux charges.

## 2026-09-25 — Écart §4.5 : une reprise refusée pour `protocol_version` recharge la page

**Contexte.** Avec la reconnexion, une page survit aux redéploiements. Si l'un d'eux change `PROTOCOL_VERSION`, la page reprend avec l'ancien code et le gateway la refuse : une source OBS resterait figée jusqu'à ce que quelqu'un la rafraîchisse, en plein stream.
**Décision.** Une page qui a déjà reçu un `welcome` et qui se voit refuser une reprise pour `protocol_version` se recharge une fois, pour prendre le nouveau code. Au tout premier `hello`, pas de rechargement : la page est déjà la dernière, recharger bouclerait.
**Renoncement.** Pas de négociation de version (§4.1) ni de vieux protocole gardé côté gateway.

## 2026-09-25 — Écart §9.1 : la vue OBS se pose avant la première peinture

**Contexte.** Le §9.1 accepte « une image ou deux d'interface » avant la bascule en vue OBS : le rendu serveur ne voit pas `window.obsstudio`. Sur le stream, c'est l'interface du jeu (fond gris, pills) qui passe à chaque chargement de la source.
**Décision.** Un script émis par `ScriptOnce` en tête du `<head>`, comme celui du thème (JOURNAL 2026-09-24), pose `data-view="obs"` sur `<html>` quand `window.obsstudio` existe ou que l'adresse finit par `/obs`. Le CSS cache alors l'interface et rend le fond transparent dès la première image.
**Renoncement.** Pas de lecture du User-Agent côté serveur : non documentée, donc fragile (§9.1).

## 2026-09-25 — Écart CDC v3 §1, plan §9.5 et §15 : le délai OBS se règle, à chaud

**Contexte.** Le CDC v3 §1 fixe le délai tampon « sans aucune interface pour le modifier », et le plan remet le changement à chaud à plus tard (§15). L'humain veut le régler dans la section Vue OBS, de 0 à 10 min, 10 s par défaut, et que les sources ouvertes le prennent aussitôt.
**Décision.** Neuf crans dans `domain` (`OBS_DELAY_STEPS_MS`), `OBS_DELAY_MS` à 10 s. `setObsDelay` (client, `owner` seul, un cran seulement) écrit `meta` et publie un `ctl` en un `MULTI` : pas de version, ce n'est pas un pixel. La frame `obsDelay` le porte à toutes les sockets du canvas. La page calcule l'heure d'affichage au moment de vider sa file, avec le délai du moment. `PROTOCOL_VERSION` passe à 3. Les canvas existants passent à 10 s au déploiement.
**Renoncement.** Pas de valeur libre (un champ, un curseur continu) : un cran absurde passerait. Pas de délai rangé dans Convex : `meta` est déjà lu au `welcome`, et le worker n'existe pas.

## 2026-09-25 — Écart §5.4, §4.2 et §4.4 : `clearArea` n'existe plus

**Contexte.** Le §5.4 prévoit de retirer un rectangle (`clearArea`), que le protocole accepte déjà. L'humain l'a abandonné : on ne modère pas une zone, on modère ce que quelqu'un a posé.
**Décision.** `clearArea` sort de la frame `moderate` et du champ `moderation` de l'`Event`. Ce qui le remplacera, plus tard, est le retrait d'une pose (un brouillon validé, `clearPlacement`) : le dépilage est écrit à part dans `moderate.lua` pour lui servir.
**Renoncement.** Pas de `clearArea` gardé « au cas où » dans le contrat : une frame que rien ne traite est une promesse que le gateway ne tient pas.

## 2026-09-25 — Écart §4.2, §4.3 et §5.6 : cinq frames pour la modération, et `PROTOCOL_VERSION` à 2

**Contexte.** La confirmation montre les pixels qu'on va retirer, le banni voit les siens, et l'onglet Modération liste les bannis. Le web ne sait pas qui a posé quelle case, et aucune frame du §4 ne le dit.
**Décision.** `listPixels` → `pixels` (un banni : sa preuve ; sinon ses cases visibles, couleurs de `state`), ouverte au rôle `owner` ou `moderator` et à soi-même. `listBans` → `bans` (miroir `user:` et nombre de pixels), `owner` et `moderator`. `unbanned` prévient le débanni. `listPixels` et `listBans` rejoignent le port `CanvasCore`. Le retrait de `cursor` et de `clearArea` change une frame : `PROTOCOL_VERSION` passe à 2 (§4.1).
**Renoncement.** Pas de liste des bannis jointe au `welcome` : elle vieillirait pendant la session. Pas de version gardée à 1 : sans reconnexion (J12), aucun ancien client ne survit à un déploiement.

## 2026-09-25 — Écart §5.6 et §10.2 : `isBanned` sur le port, et `banned` après le `welcome`

**Contexte.** Le §10.2 met un banni en lecture seule, mais le `welcome` n'a aucun champ pour le dire : un banni rechargeant la page verrait Dessiner, et tous ses pixels seraient refusés.
**Décision.** `isBanned(canvasId, userId)` rejoint le port, sur le modèle d'`isModerator`. Le gateway envoie la frame `banned` juste après le `welcome` et le snapshot d'un banni, et en direct à ses seules sockets sur le `ctl` publié par `ban`.
**Renoncement.** Pas de champ `banned` dans `you` : la frame existe déjà, et un seul chemin sert l'arrivée comme le direct.

## 2026-09-25 — Écart §5.1 et §5.4 : la preuve d'un bannissement, `cv:<id>:ban:<userId>`

**Contexte.** L'humain veut montrer au banni, et au streamer dans l'onglet Modération, les pixels qui lui ont valu le ban. `clearUser`, enchaîné juste après `ban`, les retire des piles : sans copie, la preuve n'existe plus.
**Décision.** `ban` recopie les pixels visibles de la cible (`cellKey` → `colorIndex`) dans le HASH `cv:<id>:ban:<userId>`, dans le même script, avant de publier. Seulement si `SADD` l'ajoute vraiment : un second `ban` ne vide pas la preuve. Rétention : `unban` la supprime.
**Renoncement.** Pas de copie de `state` entière par ban (64 Ko chacun). Pas de preuve lue dans le stream : il est trimmé à 20 000 entrées.

## 2026-09-25 — Écart §5.4 : pas de champ `r` tant que le worker n'existe pas

**Contexte.** Le §5.4 range les entrées retirées dans un champ `r` du stream, pour que le worker les archive. Le worker est sorti du bloc 1 sans remplacement (calendrier du 23/09).
**Décision.** `moderate.lua` n'écrit pas `r`. Le champ `moderation` de l'`Event` (§4.4) est écrit : il ne pèse rien. `r` arrivera avec le worker.
**Renoncement.** Pas d'archive sans lecteur : des centaines de Ko par tranche de 4096 cases, dans un Redis plafonné à 512 Mo.

## 2026-09-25 — Écart §5.4 et §4.2 : `clearUser` vide un ensemble de travail, sans curseur

**Contexte.** Le §5.4 parcourt `cells:<cible>` par tranches, avec un curseur. Ce set change entre deux tranches (le script en retire, `place.lua` y ajoute) : un `SSCAN` saute alors des cases ou les traite deux fois (analyse d'incohérence du plan).
**Décision.** Le premier appel verse `cells:<cible>` dans `cv:<id>:clearing:<cible>` et pose la pierre tombale. Chaque tranche en retire 4096 cases par `SPOP` ; l'action est finie quand ce set est vide. Un appel suivant sur la même cible y reverse ce qui reste : une coupure reprend là où elle s'est arrêtée. Le gateway enchaîne les tranches : `cursor` sort de la frame du client (§4.3).
**Renoncement.** Pas de curseur `SSCAN`. Pas de balayage en un seul appel : 65 536 cases au pire bloqueraient Redis, le §5.4 fixe 4096 exprès.

## 2026-09-24 — Écart §10.2 et §4.3 : la photo Twitch dans le cookie de session et dans `you`

**Contexte.** Le design system montre sa propre photo dans la pill Compte. Le `you` du `welcome` vient du cookie de session (§10.2), qui ne porte que `sub`, `login` et `displayName`, figés à la connexion.
**Décision.** `avatarUrl` devient un claim **optionnel** du cookie, signé au callback Twitch comme le nom, puis recopié par le gateway dans `you.avatarUrl`, champ optionnel du protocole : `PROTOCOL_VERSION` ne bouge pas. Un cookie signé avant reste valide, sans photo : elle apparaît à la prochaine connexion.
**Renoncement.** Pas de lecture du miroir `user:` à chaque `hello` : une lecture Redis de plus par connexion, et deux sources pour une même identité (le nom dans le cookie, la photo dans Redis).

## 2026-09-24 — Le design system vit dans `ui/design/`, et `/design` passe avant le jeu

**Contexte.** Le design system LivePlace arrive en maquette et en JavaScript de référence (`innerHTML`, `window.LivePlace`). Le web n'avait que des `style={{}}` et des couleurs en dur, et des pills qui lisent les stores : impossibles à montrer hors du jeu.
**Décision.** Un `.tsx` et son `.css` par composant dans `ui/design/`, qui ne reçoivent que des props. `tokens.css` est la seule source des valeurs (la palette reste dans `domain`). Chaque pill du jeu = un composant d'affichage + un hook qui lit les stores. `/design`, en développement seulement, rend ces mêmes composants : on y change un composant avant de s'en servir. Un test du gate refuse `style=` hors de `ui/design/`, toute couleur en dur, et tout composant absent de `/design`.
**Renoncement.** Pas de package `packages/ui` (un seul consommateur), ni Tailwind, ni modules CSS, ni `tokens.json` et son générateur. Pas de recopie de la référence ni de la maquette.

## 2026-09-24 — Le thème est retenu dans le navigateur et posé avant la première peinture

**Contexte.** Le CDC 2026 veut un thème clair, sombre ou auto : auto au premier chargement, puis le choix retenu. Le rendu serveur ne voit pas le stockage du navigateur : la page s'afficherait au thème du système, puis basculerait après l'hydratation, à chaque F5.
**Décision.** Le choix vit dans `localStorage` (`liveplace:theme`). Un script émis par `ScriptOnce` en tête du `<head>` pose `data-theme` sur `<html>` avant la première peinture ; `useTheme` prend le relais ensuite.
**Renoncement.** Pas de cookie lu par le serveur : chaque route devrait lire la requête, pour ce que trois lignes de script font.

## 2026-09-24 — `lucide-react` et Nunito servie par le web

**Contexte.** Le design system LivePlace (fait avec Claude Design) dessine ses icônes avec Lucide et écrit en Nunito, graisses 700 à 900.
**Décision.** `lucide-react` et `@fontsource-variable/nunito` en dépendances d'`apps/web` seul. Les icônes s'importent une par une ; la police est servie par notre domaine, importée par `design-system.css`.
**Renoncement.** Pas de Google Fonts : une requête vers Google à chaque visite. Pas de SVG recopiés à la main depuis la référence du design system : un fichier de plus à tenir à jour.

## 2026-09-24 — Écart §5.1 et §4.3 : `avatarUrl` dans le miroir `user:` et dans l'inspection

**Contexte.** Le CDC 2026 montre l'avatar de l'auteur d'un pixel inspecté. Le miroir `user:` du §5.1 ne garde que `login` et `displayName`, et `InspectEntry` (§4.3) pas davantage.
**Décision.** `setUser` écrit aussi `avatarUrl` quand Twitch en donne un, à chaque connexion. `InspectEntry` gagne un `avatarUrl` **optionnel** : un ancien client l'ignore, `PROTOCOL_VERSION` ne bouge pas. Sans avatar (auteur pas reconnecté depuis), la pill affiche son initiale.
**Renoncement.** Pas de lecture de l'avatar dans Convex au moment d'inspecter : le gateway n'a pas le droit d'y aller (§5.1).

## 2026-09-24 — Écart §9.3 : le brouillon remplace le rectangle de la multi-sélection

**Contexte.** Le §9.3 choisit plusieurs cases par un rectangle glissé. Le CDC 2026 le remplace par le brouillon : un clic ou un tap par case, et le tracé à l'Espace ou au Toggle tracé, jusqu'à Valider.
**Décision.** Le brouillon vit dans `state/draft.ts` (règles pures) et `state/draft-store.ts`, séparé du store du canvas, que la vue OBS partagera. Valider découpe en lots de 64, un lot à la fois après l'ack du précédent, et jamais plus de 8 par seconde (§6.3). Il est sauvegardé par canvas et par utilisateur.
**Renoncement.** Aucun rectangle, même en raccourci : le glisser déplace toujours le viewport, en Dessin comme en Vue (CDC 2026).

## 2026-09-24 — Écart §5.6 : `getGauge` sur le port `CanvasCore`, en lecture seule

**Contexte.** Le `welcome` a un champ `gauge` (§4.3), mais le port du §5.6 n'a aucun moyen de lire une jauge : sans lui, la jauge reste inconnue jusqu'à la première pose.
**Décision.** `getGauge(canvasId, userId, nowMs)` lit `meta` et `gauge:<userId>`, applique `refillGauge` de `domain` (la formule de `place.lua`) et n'écrit rien. Le gateway la joint au `welcome` d'un connecté ; un invité n'en reçoit pas.
**Renoncement.** Pas d'écriture de la jauge recalculée : seul `place.lua` modifie une jauge, et le Lua ne bouge pas.

## 2026-09-24 — La palette suit l'ordre du CDC 2026, et cet ordre ne bouge plus

**Contexte.** La palette provisoire du J4 prenait 16 couleurs du CDC 2026 dans un autre ordre. Un canvas stocke des index (`state`, `hist:`) : réordonner change la teinte de chaque case déjà posée.
**Décision.** `PALETTE` = le transparent, puis les 42 couleurs dans l'ordre du CDC 2026. Choix de l'humain : les 154 pixels de la prod, tous à l'index 7 (rouge), passent à l'orange. Dès maintenant, l'ordre est figé : une couleur nouvelle s'ajoute à la fin.
**Renoncement.** Pas de garder les index 0 à 16 avec une liste d'affichage dans l'UI : une table de plus à tenir pour quelques pixels. Pas de migration des données.

## 2026-09-23 — Écart §9.3 : l'image hors écran se repeint en entier

**Contexte.** Le §9.3 n'écrit dans le `<canvas>` hors écran que les lignes sales. Pour les connaître, le store devrait dire quelles lignes ont changé : son contrat grandirait, pour un canvas de 256 × 256.
**Décision.** L'image entière est repeinte, au plus une fois par image affichée et seulement si le store a changé ; le zoom et le déplacement ne la touchent pas. Mesuré le 23/09 sur le PC : 0,05 ms pour 65 536 cases avec une table de couleurs en `Uint32Array`, contre 2 ms pour le `set()` par case du J7. Le téléphone se mesure à la preuve du J9.
**Renoncement.** Pas de lignes sales tant que le canvas ne grandit pas : elles reviennent avec le redimensionnement, ou si le repeint dépasse quelques millisecondes au téléphone.

## 2026-09-22 — Écart §8 : la production vise le déploiement Convex de dev

**Contexte.** Le §8 prévoit deux déploiements, `dev` sur le poste et `prod` visé par le VPS. Le `CONVEX_URL` et le `CONVEX_SERVICE_KEY` de Dokploy portent les valeurs du dev, et le déploiement de prod (`valiant-panther-436`) n'a pas de `SERVICE_KEY`.
**Décision.** On le garde ainsi tant qu'on développe : une seule base, celle de dev, pour le poste et le VPS. À rétablir avant toute ouverture publique, avec un `SERVICE_KEY` de prod posé par l'humain.
**Renoncement.** Pas de bascule maintenant : elle demande un secret de production et un export/import pour garder les `canvasId` déjà écrits dans Redis.

## 2026-09-22 — Les routes serveur de Start nomment leurs handlers `GET`

**Contexte.** Start déclare une route serveur par `server.handlers`, dont les clés sont les méthodes HTTP en capitales (`GET`). Biome exige des propriétés d'objet en camelCase et refuse `GET`.
**Décision.** Dans `apps/web/src/routes/**` seulement, `useNamingConvention` accepte aussi CONSTANT_CASE pour les propriétés d'objet. Les autres conventions ne bougent pas.
**Renoncement.** Pas de règle coupée dans les routes : variables et fonctions y restent contrôlées. Pas de clé calculée pour contourner la règle sans le dire.

## 2026-09-22 — Convex dans `durable`, `jose` et `ioredis` dans le web

**Contexte.** §8 nomme Convex et `ConvexHttpClient`. Le callback OAuth signe le cookie de session (§10.2) et écrit `user:` et le canvas dans Redis (§2, §10.1).
**Décision.** `convex` dans `packages/durable` seul. `jose` et `ioredis` dans `apps/web`, comme au gateway. Le web appelle Convex depuis son serveur, jamais depuis le navigateur (§8.3).
**Renoncement.** Pas de `convex-test` : §12.3 ne demande pas de test des fonctions Convex, et la garde `serviceKey` est une fonction pure testée à part.

## 2026-09-22 — `convex/_generated` sort du scan d'`architecture`

**Contexte.** Code produit par la CLI Convex, déjà ignoré par `lexique` et par Biome. L'entrée `noCycles` du 22/09 le repoussait à l'arrivée du code qu'il couvre.
**Décision.** `packages/durable/convex/_generated/**` rejoint `ignore` dans `architecture.json`. Un import écrit à la main vers lui reste contrôlé.
**Renoncement.** Pas de code généré hors du dépôt : versionné, il laisse construire l'image du web sans la CLI Convex.

## 2026-09-22 — `useNamingConvention` désactivé sur l'adaptateur Twitch

**Contexte.** Twitch répond en snake_case (`access_token`, `display_name`, `profile_image_url`). Biome exige des propriétés en camelCase, comme pour `config.ts` le 18/09.
**Décision.** Override Biome sur `apps/web/src/infra/twitch.ts` seul. Les champs de Twitch ne sortent pas de ce fichier : il rend un `User` en camelCase.
**Renoncement.** Pas de `biome-ignore` en ligne, interdit. Pas de lecture sans schéma : la réponse d'un tiers se valide.

## 2026-09-22 — Écart §9.2 : le web a aussi un `usecase/` et un `infra/`

**Contexte.** Le §9.2 range le web en cinq dossiers. Son serveur appelle Twitch, Convex et Redis, et signe le cookie, alors que `routes/` (couche `ui`) n'a pas le droit d'importer l'infra.
**Décision.** `usecase/` (callback, `returnTo`, résolution de `/{login}`) et `infra/` (Twitch, signature) s'ajoutent, déjà couverts par les globs `apps/*/src/…`. `app/start.ts` construit les dépendances et les pose dans le contexte des requêtes.
**Renoncement.** Pas de `routes/auth/**` dans la couche `app` : ce serait élargir une couche pour passer le gate.

## 2026-09-22 — Écart §10.1 : on revient là d'où l'on s'est connecté

**Contexte.** Le §10.1 renvoie vers le `/{login}` de celui qui se connecte : un viewer qui clique « Se connecter » sur `/fenysk` atterrirait sur son propre canvas, vide.
**Décision.** `/auth/twitch?returnTo=/<pseudo>` : le chemin voyage dans le cookie OAuth, et le callback y renvoie s'il a exactement cette forme. Sinon, vers son propre `/{login}`.
**Renoncement.** Jamais d'URL complète dans `returnTo` : ce serait une redirection ouverte.

## 2026-09-22 — Écart §8.1 : `lastSignInAt`, pas `lastLoginAt`

**Contexte.** Le §8.1 nomme `lastLoginAt`, alors que le §10.2 et le lexique réservent `login` au pseudo, jamais à l'action.
**Décision.** Le champ de `users` s'appelle `lastSignInAt`.
**Renoncement.** Pas de fidélité au plan sur ce nom : le lexique ne voit pas un champ de schéma, mais le nom dirait le contraire de ce qu'il porte.

## 2026-09-22 — `SESSION_SECRET` de production distinct de celui de dev

**Contexte.** Égal à celui du `.env` depuis le 19/09, pour le jalon J5 : un cookie signé sur le poste de dev était valide en production.
**Décision.** Nouvelle valeur posée par l'humain dans Dokploy, et une autre dans le `.env`, avant la première connexion Twitch. Preuve : un cookie signé avec le secret du `.env` au nom du propriétaire du canvas de test reçoit `guest` en production.
**Renoncement.** Pas de secret commun pour faciliter les essais : un cookie de production se signe dans le conteneur du gateway, d'où le secret ne sort pas.

## 2026-09-22 — L'exception Biome des fichiers de config revient aux seuls fichiers d'outils

**Contexte.** Depuis le 19/09, `**/*.config.ts` autorise `node:*` dans tout fichier ainsi nommé, couches comprises : une sonde `packages/domain/src/probe.config.ts` qui importe `node:fs` passait le lint.
**Décision.** Motif `*.config.ts` et `apps/*/*.config.ts` : la racine du dépôt et celle de chaque app, où vivent `vitest`, `vite` et `tsup`. Tout fichier couvert est hors couche, donc déjà inscrit nommément dans `unlayeredFilesAllowed`.
**Renoncement.** Pas de liste de chemins exacts dans `biome.json` : elle doublerait `unlayeredFilesAllowed`, qui impose déjà une décision par fichier.

## 2026-09-22 — `noCycles` rétabli : le socle 1.2.0 sait ignorer le code généré

**Contexte.** Coupé le 19/09 à cause du cycle de `routeTree.gen.ts`, généré par Start. Le socle 1.2.0 lit une clé `ignore` dans `architecture.json`, comme `lexique` : les fichiers couverts sortent du scan (couche, dépendances, cycles), un import écrit à la main vers eux reste contrôlé.
**Décision.** Socle réinstallé en 1.2.0, `ignore: ["**/*.gen.ts"]` et `noCycles: true`. Sonde : deux fichiers de `shared` qui s'importent passaient le gate, ils le font maintenant échouer. L'audit manuel des cycles avant chaque commit s'arrête.
**Renoncement.** Pas de `convex/_generated` ajouté d'avance, bien que `lexique` l'ignore déjà : il entrera au J8, avec le code qu'il couvre.

## 2026-09-19 — L'exception Biome des fichiers de config couvre aussi ceux des apps

**Contexte.** L'override de `biome.json` qui autorise `node:*` dans `*.config.ts` ne vise que la racine en Biome 2. `apps/gateway/tsup.config.ts` a besoin de `node:fs` pour copier les `*.lua` dans `dist/`, et `architecture.json` prévoyait déjà ces fichiers de config imbriqués.
**Décision.** Le motif passe de `*.config.ts` à `**/*.config.ts` : les fichiers de configuration d'outils, où qu'ils soient, peuvent importer `node:*`. Le code des couches reste soumis à la règle.
**Renoncement.** Pas de copie des `*.lua` en commande shell dans une chaîne : même effet, mais c'est contourner la règle sans le dire.

## 2026-09-19 — `noCycles` désactivé provisoirement : l'arbre de routes de Start fait un cycle

**Contexte.** Start génère `routeTree.gen.ts`, dont le pied importe le type de `getRouter` depuis le routeur, qui importe l'arbre : un cycle inhérent au framework (§9), dans du code généré. Essayé sans succès : routes écrites à la main (le build de Start exige l'arbre généré), `noImportCycles` de Biome (ne résout pas les alias `@liveplace/*`, prouvé par une sonde), fichier généré hors du scan (fuir la règle).
**Décision.** `rules.noCycles: false` jusqu'à ce que le socle sache ignorer le code généré dans `architecture`, comme `lexique` le fait déjà pour `**/*.gen.ts` : à remonter en amont du socle, puis rétablir `true`. D'ici là, un audit des cycles hors `*.gen.ts` avant chaque commit (19/09 : lancé à chaque commit, aucun cycle).
**Renoncement.** Pas de correctif dans `.agent/core/`, écrasé à la prochaine installation (`core-integrity`). Pas de fichier déplacé pour échapper au scan.

## 2026-09-19 — `SESSION_SECRET` de production provisoirement égal à celui de dev

**Contexte.** Posé ainsi par l'humain pour le jalon J5 : un cookie signé avec le secret du `.env` est donc valide en production.
**Décision.** À remplacer par une valeur distincte **au J8**, avant la première vraie connexion Twitch. D'ici là, aucun cookie n'est signé avec le secret du `.env` : les essais locaux lancent le gateway avec un secret jetable.
**Renoncement.** Pas de secret de prod tiré par l'agent : les secrets restent posés par l'humain dans Dokploy.

## 2026-09-19 — Écart §11.1 : les variables sont listées par service, sans `env_file`

**Contexte.** Le croquis du §11.1 donne le `.env` entier à chaque service. Dokploy n'injecte une variable du projet que si le Compose la référence (`${{project.NOM}}`), et sa doc ne garantit pas que l'onglet Environment devient un `.env`.
**Décision.** `environment:` explicite par service, avec `${NOM:?}` pour les obligatoires : le déploiement échoue si une variable manque (règle 4). Chaque app ne reçoit que ce que son `config.ts` lit. Pas de service `worker` avant son jour.
**Renoncement.** Pas d'`env_file: .env` : tous les secrets dans tous les conteneurs, y compris ceux qui ne les lisent pas.

## 2026-09-19 — Écart §9.1 provisoire : `canvasId = login` jusqu'au J8

**Contexte.** `/{login}` se résout par Convex (`users.getByLogin` puis `canvases.getActiveForOwner`), qui arrive au J8 avec Twitch.
**Décision.** Le loader de `/$login` rend `canvasId = login`, marqué `Écart §9.1`. Le canvas de test du jalon J5 est créé à la main avec le pseudo pour identifiant, et supprimé au J8, quand Convex crée le vrai `canvasId` opaque (D-14).
**Renoncement.** Pas de variable `DEMO_CANVAS_ID` : une variable de plus, qui pourrait partir en production.

## 2026-09-19 — Le web a son propre `tsconfig`, et `typecheck` vérifie les deux

**Contexte.** Le `tsconfig.json` racine vise Node (`lib: ES2023`, sans DOM ni JSX) et inclut pourtant `apps/**/*.tsx`. Le check `architecture` refuse tout fichier hors couche, fichiers de configuration compris.
**Décision.** `apps/web/tsconfig.json` (DOM, `jsx: react-jsx`), exclu du `tsconfig` racine ; `pnpm typecheck` lance les deux. `apps/web/vite.config.ts` et `apps/gateway/tsup.config.ts` entrent nommément dans `unlayeredFilesAllowed`.
**Renoncement.** Pas de DOM dans le `tsconfig` racine : les globales du navigateur deviendraient visibles dans le code serveur.

## 2026-09-19 — Le web dépend de TanStack Start, React, Vite et Nitro ; le gateway se construit avec tsup

**Contexte.** §9 nomme TanStack Start, §11.4 nomme tsup, `vite build` et Nitro. `redis-core` lit `place.lua` par `readFileSync` : une fois empaqueté, le fichier doit être à côté du bundle.
**Décision.** Web : `@tanstack/react-start`, `@tanstack/react-router`, `react`, `react-dom`, `zod`, `vite`, `@vitejs/plugin-react`, `nitro` (bêta, version épinglée). Gateway : `tsup`, qui empaquette `@liveplace/*` et copie les `*.lua` dans `dist/`.
**Renoncement.** Pas de `tsx` en production (sources et chargeur dans l'image). Pas d'import du Lua comme texte : trois outils à accorder pour un fichier.

## 2026-09-18 — `useNamingConvention` désactivé sur la seule lecture d'env

**Contexte.** Le §11.5 fixe les noms des variables (`REDIS_URL`, `SESSION_SECRET`…) et veut que le boot nomme la variable manquante telle qu'elle est écrite dans Dokploy. Biome exige des propriétés en camelCase et refuse donc le schéma Zod de `config.ts`.
**Décision.** Override Biome sur `apps/*/src/app/config.ts` et son test seulement : `useNamingConvention` off. Le reste du dépôt garde la règle.
**Renoncement.** Pas de schéma en camelCase : l'erreur dirait `sessionSecret` quand la variable à corriger s'appelle `SESSION_SECRET`. Pas de `biome-ignore` en ligne, qui est interdit.

## 2026-09-16 — Le gateway dépend de `ws`, `jose` et `tsx` ; `zod` entre dans `shared`

**Contexte.** §6 nomme `ws`. §10.2 veut un JWT HS256 vérifié localement, sans nommer d'outil. Node 22 ne lance pas nos sources (imports sans extension). §3.1 range la lecture d'env (Zod) dans `shared`.
**Décision.** `ws`, `jose`, `ioredis` et `zod` dans `apps/gateway`, `tsx` en dev. `zod` dans `packages/shared`.
**Renoncement.** Pas de HMAC écrit à la main : épingler l'algorithme et vérifier `exp` sont les deux trous que `jose` ferme. `pino` attend le déploiement.

## 2026-09-16 — Écart §12.1 : les ports s'importent par `@liveplace/domain/ports`

**Contexte.** `CanvasCore` (§3.3) a besoin d'`Event` et de l'`ack`, déclarés dans `protocol`, qui importe déjà `domain/src/index.ts` (§4.1). Le check `architecture` voit les cycles fichier par fichier, `import type` compris : un port dans `index.ts` ferait `domain → protocol → domain`.
**Décision.** Les ports vivent dans `packages/domain/src/ports.ts`, que `index.ts` n'importe jamais. Point d'entrée `./ports` dans `domain/package.json`, chemin `@liveplace/domain/*` dans `tsconfig.json`. Les alias du gate et de Vitest le résolvent déjà.
**Renoncement.** Pas d'`Event` déplacé dans `domain` (réécrit le J3, et l'`ack` resterait un type réseau). Pas de ports dans `protocol` (écart au §3.3).

## 2026-09-16 — Écart D-12 : Convex en région EU

**Contexte.** D-12 choisit la région US (~30 % moins cher à l'usage), et la région ne se change plus après la création du projet.
**Décision.** Projet créé en EU le 10/09, définitif : au plus près du VPS (Allemagne), car le loader SSR de `/{login}` lit Convex à chaque chargement de page (§9.1). Le risque du §13 (données de viewers européens en région US) tombe avec.
**Renoncement.** Pas d'économie US : Convex hors du chemin chaud ne veut pas dire hors de la latence du chargement de page.

## 2026-09-15 — Écart : `BROADCAST_HZ` n'est pas dans `domain`

**Contexte.** Le plan du jour 4 (bloc B) range `BROADCAST_HZ = 10` avec les valeurs de `domain`.
**Décision.** Il n'y entre pas. C'est un réglage de transport, et le §11.5 en fait une variable d'environnement du gateway (défaut `10`), parsée dans son `app/config.ts` au J5.
**Renoncement.** Pas de constante dans `domain` que seul le gateway lirait : le §11.5 sépare l'infrastructure (env) du jeu (`domain`).

## 2026-09-15 — Écart : la taille de palette vient de l'appelant, pas de `meta`

**Contexte.** Le §5.3 (étape 3) valide « `meta` en main » un pixel hors palette, mais `meta` (§5.1) ne porte pas la taille de la palette.
**Décision.** `client.ts` passe `PALETTE.length` (`domain`) à `place.lua` à chaque appel, comme `nowMs`. Le schéma du §5.1 ne change pas.
**Renoncement.** Pas de champ `paletteSize` dans `meta` : la palette est provisoire, et chaque canvas déjà créé garderait une taille périmée sans migration.

## 2026-09-15 — Écart : `place.lua` refuse lui-même un canvas pas prêt

**Contexte.** Le §5.5 confie la vérification de `meta.ready` au seul gateway, que le §6.1 oublie ensuite (incohérence n°3 de fin de plan).
**Décision.** Étape 0 de `place.lua` : `meta` absent ou `ready ≠ "1"` renvoie `canvas_not_found` sans rien écrire. Le gateway vérifiera aussi au J5.
**Renoncement.** Pas de confiance au seul appelant : une pose pendant un restore écrirait dans un état qui va être écrasé.

## 2026-09-15 — Écart : la recharge ignore une horloge qui recule

**Contexte.** La formule du §5.3 (étape 4) donne un nombre de recharges négatif si `nowMs < at`, par exemple après une correction NTP du gateway : la jauge baisserait et `at` reculerait.
**Décision.** `refills = max(0, floor((nowMs - at) / refillMs))`, dans `refillGauge` (`domain`) et dans `place.lua`, chacun avec son test.
**Renoncement.** Pas de rejet de la pose quand l'horloge recule : le viewer n'y est pour rien, et quelques millisecondes d'écart ne méritent pas une erreur.

## 2026-09-15 — Le JOURNAL consigne aussi les écarts aux plans

**Contexte.** Le plan d'architecture veut que toute décision prise en route soit ici, pour le bilan du 4 octobre. Or l'ancienne règle d'entrée n'acceptait que ce qui change le gate : les écarts se dispersaient dans les journaux Obsidian quotidiens.
**Décision.** Une décision qui contredit un plan a son entrée, et le code qui la porte a le marqueur `Écart §x.y (JOURNAL AAAA-MM-JJ)`. Au bilan, `grep -rn "Écart §"` se compare à ce fichier.
**Renoncement.** Pas de note « écarts » dans Obsidian : hors du dépôt, elle dériverait du code. Les choix d'implémentation où le plan est muet restent dans le code.

## 2026-09-15 — `redis-core` dépend d'ioredis, et le gate exige le Redis de dev

**Contexte.** §5.6 : scripts chargés par `defineCommand` d'ioredis, testés contre un vrai Redis (D-19). Le gate lance `pnpm test`, donc ces tests.
**Décision.** `ioredis` en dépendance de `packages/redis-core` seul. Sans `docker compose -f docker-compose.dev.yml up -d`, l'étape `tests` échoue avec un message qui le dit.
**Renoncement.** Pas de `skip` quand Redis est absent : un gate vert qui n'a pas testé le Lua est aveugle là où la justesse compte le plus.

## 2026-09-10 — Un alias par package, pas un joker au milieu

**Contexte.** Le §12.1 prescrit `@liveplace/*` → `packages/*/src`. Le résolveur du socle ne retire qu'un `*` en fin de cible : avec le joker au milieu, aucun import inter-packages ne se résout et le contrôle des couches passe au vert sans rien vérifier. Constaté par une sonde — `domain` important `redis-core` n'était pas signalé.
**Décision.** Cinq alias explicites, un par package. La sonde échoue désormais avec le bon message ; le gate mord.
**Renoncement.** Pas de correctif dans `.agent/core/` : c'est une limite du socle, elle se remonte en amont. Et plus jamais de gate déclaré vert sans avoir vérifié qu'il sait échouer.

## 2026-09-10 — LF partout, imposé par `.gitattributes`

**Contexte.** Git convertit en CRLF au checkout sous Windows. Le MANIFEST du socle est une empreinte des fichiers de `.agent/core/` en LF : après un clone, `core-integrity` accuserait une modification à la main qui n'a jamais eu lieu.
**Décision.** `* text=auto eol=lf` à la racine. Vaut aussi pour les scripts Lua et tout ce qui part dans une image Linux.
**Renoncement.** Pas de réglage git global par machine : la règle appartient au dépôt, pas au poste.

## 2026-09-10 — Collisions connues du lexique, laissées ouvertes

**Contexte.** Le check est aveugle au contexte. Trois mots que le §14 bannit dans un sens précis mordront ailleurs : `grid` (l'overlay du §9.3), `buffer` (le tampon du gateway, §6.1), `token` (le token bucket, §6.3).
**Décision.** Bans transcrits tels quels, aucune exception aujourd'hui — rien n'est écrit, donc rien ne casse.
**Renoncement.** Pas d'assouplissement préventif. Ça se tranche le jour où le mot est nécessaire (J4, J7), pas avant. `put` ne mord pas : un verbe banni ne l'est qu'en tête d'un identifiant d'au moins deux mots, donc `snapshots.put` (§8.2) passe.

## 2026-09-10 — Lexique : la section 14 remplace les tables du gabarit

**Contexte.** Le socle canonise `delete` et bannit `remove` ; le §14 bannit `delete` au profit de `clear`. Fusionner rendrait un mot canonique et interdit à la fois.
**Décision.** `nouns` et `verbs` remplacés par le §14 ; `bannedNames`, `booleanPrefixes` et `ignore` gardés du gabarit, moins `service` — D-03 parle de « trois services applicatifs », le mot a un sens ici.
**Renoncement.** Pas de verbes CRUD génériques ajoutés (`create`, `update`) : le §14 est muet dessus, et on ne légifère pas au-delà du plan figé.

## 2026-09-10 — Couche `shared` étendue à `apps/*/src/shared/**`

**Contexte.** Le §3.3 déclare un `src/shared/` dans chaque app ; le mapping du §12.1 ne le mappe nulle part. Un fichier écrit là serait « hors de toute couche ».
**Décision.** `shared` matche `packages/shared/**` **et** `apps/*/src/shared/**`, `canImport: []` inchangé.
**Renoncement.** Pas de septième couche : c'est le même rôle, à portée locale.

## 2026-09-10 — Pas de convention `filename` par couche

**Contexte.** Le gabarit impose `*.schema.ts`, `*.usecase.ts`, `*.repository.ts`. Le §12.1 ne demande rien de tel, et le plan nomme `place.lua`, `gauge.ts`, `wsClient`.
**Décision.** `filename` retiré des six couches. Biome tient déjà la casse et le style de nom de fichier.
**Renoncement.** Pas de renommage du plan d'architecture pour satisfaire un gabarit.

## 2026-09-10 — tsconfig strict recopié, pas étendu

**Contexte.** Vérifié sur TypeScript 7.0.2 : `extends` sur `.agent/core/templates/tsconfig.strict.json` produit 5 erreurs TS5023, les clés de commentaire `_` étant placées dans `compilerOptions`. Corriger le template échouerait `core-integrity`.
**Décision.** Les 13 options strictes sont écrites en clair dans le `tsconfig.json` du projet.
**Renoncement.** Aucune modification de `.agent/core/`. Le correctif se remonte en amont, dans le dépôt du socle.

## 2026-09-10 — `test` lancé avec `--passWithNoTests`

**Contexte.** Le gate ajoute l'étape `tests` dès qu'un script `test` existe, et Vitest sort en échec quand il ne trouve aucun fichier — ce qui est le cas au jour 2.
**Décision.** `vitest run --passWithNoTests`, pour que le premier test rouge du J2 entre dans le gate à la seconde où il est écrit.
**Renoncement.** Pas d'étape `tests` absente : un filet qu'on prévoit de tendre plus tard est un filet qu'on oublie.

## 2026-09-10 — Adoption du socle

**Contexte.** Dépôt neuf, zéro dette. Le §12.1 le dit : c'est le seul moment où le socle est gratuit, parce qu'il n'y a aucune règle à assouplir.
**Décision.** Branche A, socle 1.1.0. Couches du §12.1, lexique du §14, `pnpm gate` vert = la définition de « terminé ».
**Renoncement.** Pas de baseline — un projet neuf part à zéro et doit y rester.
