---
name: executer
description: >-
  Applique les règles de conception pendant l'écriture du code — KISS comme budget,
  DRY sur la connaissance, SOLID sous forme de déclencheurs observables — et liste les
  anti-patterns spécifiques au code généré par IA. Utiliser au moment d'écrire ou de
  modifier du code, après CADRER et CONTRAT.
---

# EXÉCUTER

Les principes de conception ne sont pas des adjectifs à réciter, ce sont des
**déclencheurs**. Chacun ci-dessous répond à la seule question qui compte pendant
l'écriture : *qu'est-ce qui, dans le code sous mes yeux, m'oblige à faire autre chose ?*

## Posture par défaut : KISS est un budget, pas un goût

Le code par défaut est **le plus direct qui passe le gate**. Une indirection —
interface, générique, couche, fichier de configuration, hook d'extension — est une
dette contractée au nom d'un futur hypothétique.

> **On n'introduit une indirection que pour supprimer un problème qui existe déjà et
> qu'on peut nommer. Jamais pour un problème anticipé.**

« On en aura besoin plus tard » n'est pas un problème nommé. « Ces trois appels
divergent et le troisième a introduit un bug » en est un.

## DRY porte sur la connaissance, pas sur le texte

Deux blocs identiques ne sont pas forcément un doublon. La question n'est jamais
« se ressemblent-ils ? » mais :

> **Ces deux endroits changeront-ils toujours ensemble, pour la même raison ?**

- **Oui** → un seul endroit. La duplication cachait une seule décision.
- **Non** → les laisser séparés. Les factoriser crée un couplage entre deux choses
  indépendantes, et le prochain changement devra ajouter un paramètre pour les
  re-séparer. C'est de la duplication *fortuite*, et la mutualiser coûte plus cher
  que de la garder.

**Règle de trois** : à la deuxième occurrence, on observe. À la troisième, on extrait —
parce qu'à trois exemplaires la forme commune est enfin visible, alors qu'à deux on
généralise sur un échantillon de un.

## SOLID en cinq déclencheurs

| Ce que je vois dans le code | Ce que ça signale | Ce que je fais |
|---|---|---|
| Le nom juste de la fonction contient « et ». Ou : deux personnes différentes peuvent demander de la modifier pour deux raisons différentes. | **SRP** — deux responsabilités dans une unité | Scinder au point où le « et » tombe. |
| J'ajoute une **troisième** branche `if`/`switch` sur le même discriminant, dans un **troisième** endroit. | **OCP** — la variation est éparpillée | Remplacer par une table de descripteurs : les données portent les cas, un seul rendu les consomme. |
| Une implémentation d'une interface lève « non supporté » ou ne fait rien sur une méthode. | **LSP** — elle n'est pas une vraie substitution | La hiérarchie est fausse : séparer les types, ou remplacer l'héritage par de la composition. |
| Un implémenteur laisse des méthodes vides pour satisfaire le contrat. | **ISP** — l'interface est trop large | Découper l'interface selon les usages réels. |
| Une couche interne importe un fournisseur concret (SDK, client, ORM). | **DIP** — la dépendance pointe dans le mauvais sens | Le `usecase` déclare le port, `infra` l'implémente, `app` câble. Le gate le refuse déjà. |

## Anti-patterns spécifiques au code généré

Ceux-là ne figurent dans aucun manuel de conception, parce qu'ils sont propres à la
façon dont un modèle produit du code. Ce sont eux qui creusent l'écart mesuré à
l'échelle de l'industrie : duplication de blocs **+81 %**, refactoring tombé de 21 %
à **3,8 %** des lignes modifiées, connectivité entre fichiers **−35 %**.

**1. Le fichier réflexe.** Ne trouvant pas la chose, le modèle en crée une autre.
C'est la cause n°1 de la duplication et de la dérive de nomenclature — c'est le même
phénomène. → Traité en CADRER ; le gate le rattrape via `lexique` et `architecture`.

**2. L'erreur avalée.** `catch {}`, `catch { return null }`, `?? []` sur un échec.
Les constructions qui masquent les erreurs ont augmenté de **47 %**. Un `catch` doit
faire l'une de ces trois choses, jamais rien d'autre : relancer, journaliser **avec
le contexte**, ou convertir en `Result` typé. Un chemin d'erreur silencieux est un
bug qui se manifestera loin de sa cause.

**3. L'échappatoire de type.** `any`, `as unknown as`, `@ts-ignore`, `!` non justifié.
Chacun convertit une erreur de compilation — gratuite, immédiate — en erreur d'exécution
chez l'utilisateur. C'est exactement le filet le plus rentable qu'on est en train de
couper. Si le type résiste, c'est le **modèle de données** qui est faux, pas le compilateur.

**4. Les branches parallèles.** N états produisent N blocs quasi identiques. Un état à
N valeurs ne donne pas N blocs : il donne **un descripteur** (données) et **un rendu**
(une fois). Ajouter un état devient une ligne de données, pas un bloc de plus.

**5. La couche fantôme.** Un fichier dont chaque fonction ne fait que réexporter ou
transférer l'appel en dessous. Elle ajoute un saut de lecture et zéro décision. Supprimer.

**6. La sur-généralisation préventive.** Générique, `options`, injection, point
d'extension — pour **un seul** appelant. Attendre le deuxième. Puis le troisième.

**7. Le paramètre booléen.** `send(order, true)` est illisible au site d'appel, et la
prochaine session ajoutera un second booléen. Deux fonctions nommées, ou un paramètre
nommé sous forme d'objet.

**8. La réécriture opportuniste.** Pendant une tâche donnée, le modèle « améliore »
au passage du code qui marchait, dans son style à lui. C'est la principale source de
diffs illisibles et de régressions sans rapport avec la demande.
→ **Un diff ne contient que ce que la tâche exige.** Ce qui mérite d'être refactoré
devient une tâche à part, avec son propre gate.

## Avant de dire « c'est écrit »

- Le diff ne contient rien que la tâche n'exigeait pas.
- Aucun `catch` ne se termine sans relancer, journaliser ou retourner un `Result`.
- Aucun nom introduit n'est absent du lexique ni synonyme d'un terme existant.
- Aucune abstraction n'a été ajoutée pour un besoin encore hypothétique.

Puis, et seulement puis : `npm run gate`.
