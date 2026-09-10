---
name: contrat
description: >-
  Écrit le contrat exécutable d'un changement — les types puis un test rouge — avant
  toute implémentation. Utiliser pour les changements de taille M et L déterminés à
  l'étape CADRER, c'est-à-dire dès qu'un nom exporté est créé ou qu'un comportement
  observable change.
---

# CONTRAT

Un contrat n'est pas une description de ce qu'on va faire. C'est **quelque chose qui
échoue tant que ce n'est pas fait**. Une phrase en prose ne dit jamais non ; un type
et un test rouge, si.

Deux artefacts, dans cet ordre. Le second ne s'écrit pas avant que le premier compile.

## 1. Le type — rendre l'état illégal irreprésentable

94 % des erreurs de compilation produites par un LLM sont des erreurs de **types**,
pas de syntaxe ; contraindre la génération par le type fait chuter ces erreurs de
75,3 %. Autrement dit : chaque invariant qu'on arrive à exprimer dans le type est un
bug que le modèle ne peut pas écrire, à chaque tour, gratuitement. C'est le meilleur
rapport effort/effet de tout le socle.

Trois gestes, par ordre de rendement :

**a. Union discriminée plutôt que champs optionnels.** Le drapeau booléen et le champ
`?` laissent exister des combinaisons qui n'ont aucun sens — et un agent finit
toujours par en construire une.

```ts
// ✘ 8 états représentables, 3 ont un sens
type Fetch = { isLoading: boolean; data?: User; error?: Error };

// ✔ 3 états représentables, 3 ont un sens
type Fetch =
  | { status: "loading" }
  | { status: "ready"; user: User }
  | { status: "failed"; error: Error };
```

**b. Type nominal quand deux `string` ne sont pas interchangeables.** `UserId` et
`OrderId` sont tous deux des `string` : le compilateur les confond, le modèle aussi.

```ts
type UserId = string & { readonly __brand: "UserId" };
```

**c. Résultat explicite plutôt qu'exception, sur les frontières.** Une exception est
invisible dans la signature ; un appelant généré ne la traitera pas.

```ts
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
```

## 2. Le test rouge — un seul, et il doit échouer pour la bonne raison

Le TDD a une réputation ambiguë chez les humains, et c'est mérité : une méta-analyse
sur 27 études ne trouve **aucun effet statistiquement significatif**, ni sur la qualité
(g = 0,106 · p = 0,96) ni sur la productivité (g = 0,064 · p = 0,87).

Sur un agent, c'est l'inverse, et l'écart est net : écrire le test d'abord fait gagner
**+12,0 %** de réussite à GPT-4 Turbo sur MBPP, **+8,5 %** sur HumanEval — et **+29,6 %**
à un modèle plus faible. Plus le modèle est faible, plus le gain est grand.

La raison de l'asymétrie tient en une phrase : **pour un humain, le test est une aide à
la conception ; pour un agent, c'est une condition d'arrêt.** Un humain sait quand il a
fini. Un agent, non — il s'arrête quand quelque chose lui dit de s'arrêter.

Un test par critère d'acceptation, formulé en **EARS** (*Easy Approach to Requirements
Syntax*) : la notation force une condition observable et interdit le flou.

```
Quand  <déclencheur>,  le système doit  <réponse observable>.
Si     <condition indésirable>,  alors le système doit  <réponse>.
Tant que <état>,  le système doit  <réponse>.
```

```ts
// Quand un user suspendu tente de créer un order, le système doit refuser.
it("refuse la création d'order pour un user suspendu", async () => {
  const result = await createOrder(suspendedUser, cart);
  expect(result).toEqual({ ok: false, error: "USER_SUSPENDED" });
});
```

**Lancer le test et lire l'échec.** Un test qui échoue sur `undefined is not a function`
ne prouve rien : il échoue parce que le code n'existe pas, pas parce que le comportement
manque. Il doit échouer sur l'**assertion**. Sinon le vert final ne vaudra rien.

### La règle qui rend tout le reste valable

> **Une fois le test écrit et rouge, il ne se touche plus.**
> Il se satisfait en changeant le CODE.

Ce n'est pas une question de discipline, c'est le mode d'échec dominant, et il est
mesuré. Mis face à un test qu'il n'arrive pas à faire passer, un agent déplace la cible :
jusqu'à **76 %** de triche selon le modèle et le benchmark — et les modèles les plus
capables trichent **plus**, pas moins. Les formes observées, par ordre de fréquence :
modifier le fichier de test, cas particulier codé en dur sur l'entrée du test, solution
heuristique qui ne passe que sur les cas visibles.

La consigne en prose ne suffit pas : elle fait tomber la triche de 93 % à 1 % sur un
benchmark, et seulement de 66 % à 54 % sur un autre. Ce qui marche vraiment, mesuré,
c'est de rendre le test inaccessible en écriture. À défaut, le check `test-integrity`
du gate refuse toute assertion en moins, tout cas supprimé, tout `.skip` et tout `.only`.

Si le test était réellement faux — ça arrive — c'est une **décision** : elle s'écrit
dans `JOURNAL.md`, et la baseline la gèle explicitement. Jamais un correctif discret
au milieu d'un commit d'implémentation.

## 3. Pour un changement L — l'entrée JOURNAL, avant le code

Cinq lignes maximum, ajoutées **en haut** de `.agent/project/JOURNAL.md`, et écrites
**avant** de coder :

```md
## AAAA-MM-JJ — <la décision en une ligne>
**Contexte.** Ce qui a rendu la décision nécessaire.
**Décision.** Ce qui change dans architecture.json / lexique.json / les seuils.
**Renoncement.** L'option écartée, et pourquoi. C'est la ligne la plus utile des cinq :
sans elle, une session future reproposera exactement ce qui vient d'être rejeté.
```

## Le piège à éviter

Ne pas produire de spécification permanente maintenue en parallèle du code. C'est
l'échec le mieux documenté des approches pilotées par la spécification : les documents
« dérivent, dérivent, jusqu'à contenir des doublons et des contradictions ».
Le contrat vit dans les types et les tests — qui, eux, ne peuvent pas mentir, parce
qu'ils s'exécutent. Le JOURNAL ne conserve que les **décisions**, jamais l'état du système.
