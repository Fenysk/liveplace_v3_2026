---
name: prouver
description: >-
  Établit qu'un changement est réellement terminé en exécutant le gate, et fixe la
  conduite à tenir quand il échoue. Utiliser à la fin de chaque changement, avant
  d'annoncer un travail fini ou de commiter.
---

# PROUVER

## La règle, entière

> **C'est TOI qui lances le gate, et tu boucles jusqu'au vert.**
> Un changement est terminé quand `npm run gate` sort en 0. Jamais avant, et pour
> aucune autre raison.

**Ne jamais déléguer l'exécution.** « À toi : `npm run gate` », « pense à vérifier »,
« il resterait à tester » — ces phrases sont interdites, et ce sont les plus faciles à
écrire, parce qu'elles ressemblent à de la politesse. Elles rendent le système inutile :
tout repose sur une boucle — lancer, lire l'échec, corriger, relancer — et déléguer la
première étape la supprime entière.

La commande exacte est celle inscrite dans `AGENTS.md` : elle a été écrite à
l'installation avec le bon gestionnaire de paquets (`npm`, `pnpm`, `yarn`, `bun`).
Ne pas en inventer une autre. Si le projet a son propre script de vérification
(`verify`, `validate`, `ci`), le gate le lance déjà — il n'y a **qu'une** commande.

Si le gate ne peut pas être lancé — commande absente, dépendances non installées, pas
les droits — le dire et nommer l'obstacle. Un empêchement se signale ; il ne se déguise
pas en travail terminé.

Ni « le code a l'air correct », ni « ça devrait marcher », ni « j'ai vérifié
mentalement ». Une étude randomisée sur des développeurs expérimentés a mesuré des
tâches **19 % plus lentes** avec assistance IA, alors que les mêmes personnes
estimaient après coup avoir été **20 % plus rapides**. Le jugement subjectif sur du
code assisté n'est pas une source fiable — dans les deux sens. La seule sortie qui
compte est un code de retour.

C'est aussi ce qui rend la boucle exploitable : quand la condition d'arrêt est un
ensemble de vérifications exécutables, elle est déterministe. Quand c'est une
consigne en prose, elle dérive.

## Lire un échec

Le gate s'arrête à la première famille en échec quand elle est fondamentale
(`types`, `lint`) : lire un rapport d'architecture calculé sur du code qui ne compile
pas ne produit que du bruit.

1. **Corriger la première erreur, puis relancer.** Les erreurs de type sont en
   cascade : la première en cause souvent dix. Ne pas les corriger en lot.
2. **`--only` pour boucler vite** sur une seule famille :
   ```bash
   npm run gate -- --only lexique
   ```
3. **Chaque violation dit déjà quoi faire.** Elle n'a pas besoin d'être interprétée,
   elle a besoin d'être appliquée.

## Ce qui est interdit, sans exception

Faire passer le gate en l'affaiblissant :

- ajouter `any`, `as unknown as`, `@ts-ignore`, `@ts-expect-error`, `!`
- poser un `eslint-disable` / `biome-ignore` en ligne
- élargir un `canImport`, relever `maxDuplicationPercent`, ajouter un synonyme au lexique
- déplacer un fichier dans une couche plus permissive pour échapper à une règle
- ajouter un chemin à `ignore` ou `unlayeredFilesAllowed`
- **modifier un test pour le faire passer** — retirer une assertion, supprimer un cas,
  poser un `.skip` ou un `.only`. Le check `test-integrity` le refuse, et c'est le geste
  que les benchmarks de triche mesurent le plus souvent chez les agents.

Ces gestes ne corrigent rien : ils suppriment **le seul mécanisme qui signale que le
dépôt dérive**. Une seule dérogation, et le gate cesse d'être une preuve — il redevient
un avis, c'est-à-dire rien.

## Quand le check a réellement tort

Ça arrive, et ce n'est pas un drame — mais c'est une **décision**, pas un contournement.
Le chemin est fixe :

1. Écrire l'entrée dans `.agent/project/JOURNAL.md` — contexte, décision, renoncement.
2. **Ensuite** modifier la donnée du socle (`architecture.json` ou `lexique.json`).
3. Relancer le gate.

L'ordre n'est pas cosmétique. Écrire d'abord force à formuler la raison ; et une raison
qu'on n'arrive pas à écrire en cinq lignes est presque toujours une envie de contourner
déguisée en argument.

## Avant de commiter

```bash
npm run gate && git add -A && git commit
```

Enchaîné par `&&` : un gate rouge n'atteint jamais l'index. Un commit qui n'a pas passé
le gate n'est pas un commit, c'est une dette qu'une session future paiera sans savoir
d'où elle vient.
