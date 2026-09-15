# AGENTS.md

Fichier d'amorçage du socle. C'est le **seul** document toujours présent en contexte.
Il ne contient pas les règles : il dit où elles sont, et quand les charger.

Il est court exprès. Un contexte long dégrade le taux de succès, et un document qui
s'applique également à tous les fichiers ne s'applique spécifiquement à aucun.
**Ne jamais l'allonger** : une règle nouvelle va dans un check, pas ici.

---

## La règle qui prime sur tout

> **C'est TOI qui lances `pnpm gate`, et tu boucles jusqu'au vert.**
> Un changement est terminé quand il sort en 0 — jamais avant, jamais pour une autre
> raison, jamais sur lecture du code.

Ne jamais renvoyer l'exécution du gate à l'utilisateur. « À toi de lancer », « pense à
vérifier », « il resterait à tester » : ces phrases sont interdites. Elles transforment
la seule preuve du système en devoir maison, et la boucle qui rend un agent fiable est
précisément celle-ci — lancer, lire l'échec, corriger, relancer.

Si le gate ne peut PAS être lancé (commande absente, dépendances manquantes, pas de
droits), le dire explicitement et nommer l'obstacle. Un empêchement se signale ; il ne
se déguise pas en fin de travail.

## Le cycle

| # | Étape | Charger | Quand |
|---|---|---|---|
| 1 | **CADRER** | `.agent/core/skills/cadrer/SKILL.md` | toujours, avant d'ouvrir un fichier |
| 2 | **CONTRAT** | `.agent/core/skills/contrat/SKILL.md` | tailles M et L uniquement |
| 3 | **EXÉCUTER** | `.agent/core/skills/executer/SKILL.md` | à l'écriture du code |
| 4 | **PROUVER** | `pnpm gate` | avant toute annonce et tout commit |
| ↺ | **CAPITALISER** | `.agent/core/skills/capitaliser/SKILL.md` | après une erreur, ou quand une bêtise revient |

La taille se décide à l'étape 1 : **S** (1 fichier, aucun nom exporté nouveau) →
1·3·4 · **M** (plusieurs fichiers, ou un nom exporté nouveau) → +2 ·
**L** (nouvelle couche/dépendance, ou contrat public modifié) → +2 + entrée JOURNAL
écrite **avant** le code.

Charger un skill au moment indiqué, pas avant : les charger tous d'emblée revient à
refaire le gros document que ce socle existe pour éviter.

## Sources de vérité — des données, pas de la prose

| Fichier | Contient | Lu par |
|---|---|---|
| `.agent/project/architecture.json` | couches et dépendances autorisées | check `architecture` |
| `.agent/project/lexique.json` | un mot par concept, synonymes interdits | check `lexique` |
| `.agent/project/JOURNAL.md` | décisions, append-only, jamais réécrit | l'humain et l'agent |

Modifier l'un des deux `.json` **change ce que le gate accepte**. C'est donc une
décision : elle s'écrit dans `JOURNAL.md` **d'abord**, on modifie ensuite.

## Interdits absolus

Faire passer le gate en l'affaiblissant, sous toutes ses formes :

- `any`, `as unknown as`, `@ts-ignore`, `@ts-expect-error`, `!` non justifié
- `eslint-disable` / `biome-ignore` en ligne
- élargir un `canImport`, relever un seuil, ajouter un synonyme, étendre un `ignore`
- déplacer un fichier vers une couche plus permissive pour échapper à une règle

Un gate qu'on peut affaiblir n'est plus une preuve, c'est un avis — donc plus rien.

Et trois règles de conduite qui ne se vérifient pas mécaniquement :

- **Un diff ne contient que ce que la tâche exige.** Pas d'amélioration opportuniste
  de code qui marchait : ça devient une tâche à part, avec son propre gate.
- **On ne crée un nom que si la recherche est revenue vide.** Chercher d'abord,
  nommer ensuite. C'est là que naissent la duplication et la dérive de vocabulaire.
- **Commentaires ultra concis.** Une ligne, seulement le non-évident (un piège, une
  référence `§`/`D-xx`). Jamais de paraphrase du code ni de bandeau décoratif.

## Commandes

```bash
pnpm gate                     # tout, arrêt à la première famille fondamentale en échec
pnpm gate -- --only lexique   # boucler vite sur une seule famille
pnpm calibrate                # (installation) mesure le dépôt et propose une config
pnpm gate -- --baseline       # (installation) gèle la dette héritée d'un dépôt existant
```

Installation ou reprise d'un projet non configuré → `.agent/core/skills/installer-les-rails/SKILL.md`
