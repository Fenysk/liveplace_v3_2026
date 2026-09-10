---
name: capitaliser
description: >-
  Transforme une erreur qui vient de se produire en garde-fou exécutable plutôt qu'en
  note de documentation. Utiliser après avoir corrigé un bug, après avoir constaté
  qu'une même bêtise revient, ou quand on est tenté d'écrire « il faudra penser à… ».
---

# CAPITALISER

## Pourquoi la documentation ne suffit pas

L'intuition naturelle après une erreur est d'en écrire la leçon quelque part. C'est
précisément là que la plupart des systèmes échouent, et c'est mesuré : une équipe
rapporte **40 % de conformité** avec 3 000 lignes de documentation, contre **80 %**
quand la contrainte est injectée au bon moment puis vérifiée après génération. La
formule qui résume le problème : *un document de 1 000 lignes s'applique également à
tous les fichiers, donc il ne s'applique spécifiquement à aucun.*

Une leçon en prose se dilue à mesure que le document grossit, et un contexte long
dégrade le taux de succès — des mesures font tomber des taux de 40-50 % à moins de 10 %.
Chaque ligne ajoutée à un document de consignes rend les autres un peu moins efficaces.

> **Une leçon qui n'est pas exécutable n'est pas capitalisée. Elle est archivée.**

## L'arbre de décision

À chaque erreur, descendre la liste et s'arrêter au **premier** oui. Les options du
haut coûtent zéro token et ne s'oublient jamais.

| L'erreur, au fond, c'est… | Le garde-fou | Où |
|---|---|---|
| un état qui n'aurait jamais dû être représentable | un **type** (union discriminée, type nominal, `Result`) | dans le code |
| une dépendance qui part dans le mauvais sens, un fichier mal placé, un cycle | une **règle de couche** | `architecture.json` |
| un mot de trop pour un concept qui en avait déjà un | une **entrée de lexique** | `lexique.json` |
| un comportement faux dans un cas non couvert | un **test** | à côté du code |
| une forme de code répétée que rien n'interdit | une **règle de lint** | config lint du projet |
| une vérification qu'aucun outil existant ne sait faire | un **check maison** | `.agent/core/checks/`, branché via `gate.json` |
| *rien de ce qui précède* | alors, et alors seulement, **trois lignes** dans le skill concerné | `.agent/core/skills/…` |

La dernière ligne est un aveu d'échec, pas une issue par défaut. Si elle est choisie
plus d'une fois sur cinq, c'est le socle lui-même qui manque d'un mécanisme — et c'est
ça, la vraie leçon à traiter.

## Ajouter un check maison

```js
// .agent/core/checks/mon-check.mjs
import { walk, stripNoise, report } from "../lib/scan.mjs";
// … calculer `violations` : des chaînes « fichier:ligne — ce qui ne va pas, et quoi faire »
process.exit(report("mon-check", violations, { hint: "l'action corrective" }));
```

```json
// .agent/project/gate.json
{ "extra": [{ "name": "mon-check", "cmd": "node .agent/core/checks/mon-check.mjs" }] }
```

Trois exigences, non négociables :

- **Il échoue.** Un check qui avertit sans faire échouer sera ignoré dès la première
  urgence, et une seule fois suffit à le rendre inutile pour toujours.
- **Zéro faux positif.** Un check qui crie à tort perd sa crédibilité, et un check
  auquel on ne croit plus est désactivé — donc il vaut moins que rien, puisqu'il a
  coûté du temps.
- **Le message dit l'action.** Pas « nommage non conforme », mais « dire *user* et non
  *account* ». Le destinataire est un agent : il applique ce qu'on lui dit, il
  n'interprète pas ce qu'on lui suggère.

## Le cliquet

Chaque check ajouté rend une classe entière d'erreurs **définitivement** impossible,
sans consommer un seul token de contexte, dans toutes les sessions futures, quel que
soit le modèle et quel que soit le harnais. C'est le seul mécanisme du socle qui
s'améliore tout seul avec le temps — et la raison pour laquelle il fallait des règles
qui s'exécutent plutôt que des règles qui se lisent.
