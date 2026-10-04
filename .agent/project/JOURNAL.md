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

## 2026-10-04 — CSP de `/{login}` : celle de Google ; la stricte du 2026-09-29 ailleurs

**Contexte.** Le script AdSense charge des iframes et des requêtes dont les domaines changent : la liste d'hôtes du 3/10 est bloquée en build de prod, et Google ne prend en charge qu'une CSP stricte.
**Décision.** `/{login}` porte `script-src 'nonce-…' 'strict-dynamic' https: 'unsafe-inline'`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`, le reste ouvert. La politique se choisit sur la route servie, jamais sur le chemin ; `/{login}/obs`, `/`, `/design` et `/confidentialite` gardent la stricte.
**Renoncement.** Pas de liste de domaines Google. Pas de CMP tierce : pill de consentement, pubs non personnalisées, script chargé seulement si accepté.
