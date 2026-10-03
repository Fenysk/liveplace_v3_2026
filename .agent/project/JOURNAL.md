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
