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
