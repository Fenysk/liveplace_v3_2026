---
name: cadrer
description: >-
  Dimensionne un changement et fait la reconnaissance du dépôt avant d'écrire la
  moindre ligne. Utiliser au tout début de chaque tâche de code — nouvelle
  fonctionnalité, correction, refactoring — pour déterminer le niveau de cérémonial
  nécessaire et vérifier que ce qu'on s'apprête à créer n'existe pas déjà sous un
  autre nom.
---

# CADRER

Deux sorties, rien d'autre : **une taille** et **un verdict de reconnaissance**.
Tant que les deux ne sont pas écrits, ne pas ouvrir un fichier de code.

## 1. Reconnaissance — la seule vraie parade à la duplication

La duplication n'entre pas dans un dépôt par paresse. Elle entre parce que
**la chose existante n'a pas été retrouvée**. C'est mécanique : on cherche
`fetchUser`, ça n'existe pas, on l'écrit — alors que `getUser` était là.
Le dépôt a maintenant deux implémentations et deux vocabulaires.

Avant de nommer quoi que ce soit :

```bash
# a. Quel est le mot juste ? Le lexique tranche, pas l'intuition.
cat .agent/project/lexique.json

# b. Le concept existe-t-il déjà, sous n'importe quel nom ?
grep -rniE "user|account|member|profile" src --include="*.ts*" -l

# c. Le symbole existe-t-il déjà ?
grep -rnE "export (const|function|type|interface|class) [A-Za-z]*User" src

# d. Que contient déjà la couche visée ?
ls -1 src/usecase
```

**Règle d'arrêt : on ne crée un nom que si la recherche est revenue vide.**
Si elle ramène quelque chose de proche, deux issues seulement — étendre l'existant,
ou expliquer en une phrase pourquoi c'est un concept différent. Jamais « je crée à côté ».

## 2. Taille — le cérémonial se paie, il doit être proportionné

Un test terrain rapporte 1 300 lignes de markdown générées pour une feature
d'affichage de date. Le sur-cérémonial n'est pas de la rigueur, c'est la même
maladie sous un autre nom. La taille se décide **ici**, une fois, et elle engage.

| Taille | Déclencheur | Étapes |
|---|---|---|
| **S** | 1 fichier touché · aucun nom exporté nouveau · aucune dépendance nouvelle | CADRER → EXÉCUTER → PROUVER |
| **M** | plusieurs fichiers · ou un nom exporté nouveau · ou un comportement observable change | + CONTRAT |
| **L** | nouvelle couche / module / dépendance externe · ou un contrat public change · ou `architecture.json` / `lexique.json` doit bouger | + CONTRAT + entrée JOURNAL **écrite avant le code** |

En cas de doute entre deux tailles : prendre la plus grande **une fois**, puis
redescendre. Un doute récurrent sur la taille signale un découpage trop gros —
scinder le changement plutôt que monter le cérémonial.

## 3. Sortie attendue

Trois lignes, littéralement :

```
Taille : M
Reconnaissance : `getUser` existe (src/infra/user.repository.ts:12) — j'étends, je ne crée pas.
Cible : couche usecase · src/usecase/suspend-user.usecase.ts · export `suspendUser`
```

Si la troisième ligne ne peut pas être écrite — couche, fichier et symbole nommés —
le cadrage n'est pas fini. Écrire du code à ce stade, c'est laisser l'emplacement
se décider par accident, et un emplacement accidentel est le premier pas de la dérive.

## 3. Découper — verticalement, jamais par couche

La question « je fais le front d'abord ou le back d'abord ? » est mal posée. Le vrai axe
est **horizontal ou vertical**, et il n'a qu'une bonne réponse pour un agent.

Une architecture en couches éparpille UNE feature sur six dossiers — schéma, service,
dépôt, route, composant, mapper. Pour en modifier un, l'agent doit charger les cinq
autres. La structure du dépôt fait partie du prompt : plus une feature est éparpillée,
plus l'agent charge du bruit, et **c'est exactement là qu'il se met à inventer des
abstractions qu'on ne lui a pas demandées.**

> **Une tâche = une tranche verticale, la plus mince qui traverse tout le système.**

Et l'agent ne peut pas se relire pour trouver les erreurs d'intégration : il ne peut
que les exécuter. Un système qui ne tourne pas de bout en bout ne lui apprend rien.
D'où l'ordre, à l'intérieur de la tranche :

| Ordre | Quoi | Pourquoi |
|---|---|---|
| 1 | **Le contrat** — le type à la couture entre les côtés | Les deux côtés se construisent ensuite contre la même chose. C'est ce qui permet de les faire *en parallèle* sans se mentir. |
| 2 | **Le chemin de LECTURE, de bout en bout** — données → transport → écran, avec un jeu de données figé s'il le faut | Si l'écran affiche, toutes les couches sont alignées. Un seul aller-retour prouve l'ensemble. |
| 3 | **Le chemin d'ÉCRITURE** — créer, modifier, supprimer | Il n'a plus qu'à persister puis rafraîchir une lecture déjà prouvée. |

« Le front à la fin » est la pire des trois options : le front est l'endroit où l'on
s'aperçoit que le contrat est faux, et le repousser, c'est repousser la découverte.
« Le back à la fin » n'est acceptable que si le contrat de l'étape 1 est réellement
écrit et typé — sinon on construit contre une fiction.

## Cas particulier : une feature CRUD complète

L'ordre d'implémentation n'est pas neutre — valider toute la chaîne de LECTURE
(domain → server → query → écran liste) avant d'ajouter la moindre écriture.
Détail et exemple : [patterns/crud-read-before-write.md](patterns/crud-read-before-write.md)

## Ce qui n'appartient PAS à cette étape

- Rédiger une spécification longue. Le contrat exécutable vient à l'étape suivante, et il est court.
- Décider de l'implémentation. Cadrer répond à *où* et *quelle ampleur*, pas à *comment*.
- Toucher au code. Aucune édition pendant CADRER.
