# JOURNAL

Append-only. On ajoute en haut, on ne réécrit jamais, on ne supprime jamais.

Une entrée existe pour **une seule raison** : une décision a changé ce que le gate accepte
(architecture.json, lexique.json, un seuil, une règle désactivée). Tout le reste — ce qui a
été fait, ce qui marche — se lit dans le code et dans le gate. Un journal qui raconte le
travail devient un doublon du dépôt, et un doublon dérive.

Format : 5 lignes maximum. Si ça demande plus, la décision n'est pas mûre.

---

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
