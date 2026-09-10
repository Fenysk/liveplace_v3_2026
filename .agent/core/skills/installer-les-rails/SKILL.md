---
name: installer-les-rails
description: >-
  Met en place dans un projet des garde-fous exécutables contre la dérive d'architecture
  et de nomenclature : règles de couches, lexique du domaine, seuil de duplication, et une
  commande unique `npm run gate` qui échoue tant que le code ne les respecte pas. Va de
  bout en bout sans intervention humaine, jusqu'au gate vert. Utiliser quand l'utilisateur
  demande d'installer les rails, de mettre en place les règles d'architecture ou les
  garde-fous, de brancher le gate, ou de préparer un projet avant de commencer à coder ;
  quand il démarre un nouveau projet et veut les garde-fous dès le départ ; ou quand un
  projet existant n'a ni AGENTS.md ni `npm run gate` alors qu'on s'apprête à y travailler
  avec un agent.
---

# Installer les rails

Poser dans ce dépôt des règles que la machine fait respecter, plutôt que des consignes
qu'on espère voir suivies. Concrètement, à la fin : une commande `npm run gate` existe,
elle refuse un import qui remonte une couche, un nom hors du vocabulaire du projet et un
bloc recopié — et elle est **verte**.

Aller jusqu'au bout sans rien casser et sans intervention humaine. Deux branches, et le
choix de branche n'est pas discutable : il change tout ce qui suit.

## 0. Récupérer le socle

```bash
git clone --depth 1 https://github.com/Fenysk/fenysk-skills-repo .socle-tmp
node .socle-tmp/install.mjs --dry-run    # montre ce qui serait fait, n'écrit RIEN
node .socle-tmp/install.mjs              # écrit
rm -rf .socle-tmp
```

Toujours passer par `--dry-run` d'abord sur un dépôt qui contient déjà du travail :
c'est gratuit, et ça montre exactement quels fichiers seront touchés.

L'installation est **mécanique et idempotente** : relançable à volonté. Elle écrase
`.agent/core/` (c'est le mécanisme de mise à jour), ne touche jamais `.agent/project/`,
et **ajoute** un renvoi à la fin d'un `CLAUDE.md` existant au lieu de l'écraser.
Si `AGENTS.md` existe déjà, elle le laisse : le fusionner à la main, sans le rallonger.

## 1. Déterminer la branche

```bash
find src app lib -name "*.ts" -o -name "*.tsx" 2>/dev/null | head -20
```

- **Aucun code, ou moins de ~10 fichiers** → branche **A**, nouveau projet.
- **Du code existant** → branche **B**, dépôt existant. Ne jamais appliquer A à un
  dépôt existant : ça produit des centaines de violations héritées, et un gate qu'on
  ne peut pas satisfaire est un gate qu'on désactive — une seule fois suffit à le
  perdre pour de bon.

---

## Branche A — nouveau projet

Ici l'architecture est une **décision**, pas une observation : il n'y a rien à mesurer.

1. **`tsconfig.json`** → `{ "extends": "./.agent/core/templates/tsconfig.strict.json" }`.
   D'abord, toujours : sur un projet vierge il n'y a aucune dette, donc aucune raison
   d'assouplir quoi que ce soit. C'est le seul moment où c'est gratuit.
2. **`biome.jsonc`** → copier `.agent/core/templates/biome.jsonc`, puis `npx biome check .`
   pour valider les noms de règles de la version installée.
3. **`architecture.json`** → garder le gabarit livré (`domain` · `usecase` · `infra` ·
   `ui` · `app` · `shared`) sauf raison explicite. Créer les dossiers vides correspondants.
   Ne pas inventer une architecture pour un projet qui n'a pas encore de contraintes :
   six couches dont la direction des dépendances est déjà juste valent mieux qu'un
   découpage sur mesure fondé sur rien.
4. **`lexique.json`** → vider `nouns` (le domaine n'existe pas encore), **garder**
   `verbs`, `bannedNames` et `booleanPrefixes` : ceux-là sont vrais dès la première ligne.
5. **Pas de baseline.** Un projet neuf part à zéro et doit y rester.
6. `npm run gate` → vert immédiatement.

---

## Branche B — dépôt existant

Ici l'architecture est une **observation** : on part de ce que le dépôt fait déjà,
et on resserre ensuite. L'inverse ne s'adopte jamais.

1. **Calibrer** — mesure, ne décide pas, n'écrase rien :
   ```bash
   npm run calibrate          # ou : node .agent/core/calibrate.mjs --root <dossier>
   ```
   Sortie : couches réelles, sens réel des imports, couches qui s'importent
   mutuellement, duplication actuelle, verbes en conflit, mots vides déjà présents.
   Écrit `.agent/project/architecture.proposed.json`.

2. **Relire la proposition.** Un `canImport` qui choque n'est pas une erreur du script :
   c'est une dette déjà présente, que le script rend visible. Ne pas la corriger ici —
   la geler d'abord, la corriger ensuite. Renommer en `architecture.json`.

3. **Écrire `lexique.json` à partir des conflits mesurés.** Pour chaque famille de
   verbes en conflit, le **plus fréquent gagne**, sauf raison métier contraire, et les
   autres passent en `banned`. Pour les noms : prendre 5 à 10 termes parmi les plus
   fréquents remontés, pas 50. Un lexique trop large au jour 1 ne produit que du bruit.

4. **Geler la dette héritée** :
   ```bash
   npm run gate -- --baseline
   ```
   Écrit `.agent/project/baseline.json`. Le gate n'échouera plus que sur les
   violations **nouvelles**. La dette reste affichée à chaque passage — une dette
   qu'on ne voit plus est une dette qu'on ne rembourse jamais.

5. `npm run gate` → **vert**. S'il ne l'est pas, c'est que l'étape 2 ou 3 a été durcie
   à la main : desserrer maintenant, resserrer plus tard.

6. **Une ligne de JOURNAL**, et une seule :
   ```md
   ## AAAA-MM-JJ — Adoption du socle
   **Contexte.** Dette gelée : N violations, duplication à X %.
   **Décision.** Le gate n'échoue que sur les nouvelles violations.
   **Renoncement.** Pas de reprise du legacy maintenant — resserrage d'un cran à chaque passage.
   ```

---

## Le cliquet, ensuite

Après chaque lot corrigé : `npm run gate -- --baseline` pour faire **descendre** le
compteur. Et à chaque fois qu'on repasse dans un fichier, resserrer d'un cran —
`maxDuplicationPercent` d'un dixième, une couche qui perd un `canImport` de trop.

> **Ne jamais régénérer la baseline pour faire taire une violation qu'on vient
> d'introduire.** C'est la seule commande capable de rendre le gate inutile, et elle
> le fait en silence. Le compteur ne descend jamais tout seul — s'il remonte,
> quelqu'un a triché.

## Vérification finale — les quatre à contrôler avant de dire que c'est installé

```bash
npm run gate                                    # vert
grep -c . AGENTS.md                             # ≈ 71 lignes, jamais rallongé
grep -l "AGENTS.md" CLAUDE.md .cursorrules      # les renvois pointent bien
cat .agent/project/baseline.json | head -5      # dette connue chiffrée (branche B)
```

Puis annoncer à l'utilisateur, en trois lignes : les couches retenues, le nombre de
violations gelées, et la seule phrase qui compte pour la suite — *terminé = gate vert*.
