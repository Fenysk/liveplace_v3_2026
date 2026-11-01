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
