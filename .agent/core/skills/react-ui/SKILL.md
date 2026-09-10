---
name: react-ui
description: >-
  Recueil de patterns React/TSX (composants, layout, hooks, structure HTML).
  Utiliser quand on écrit ou révise un composant UI et qu'on veut appliquer
  un pattern éprouvé plutôt qu'une solution ad-hoc.
---

# React UI

Sommaire des patterns disponibles. Chaque ligne indique quand l'appliquer.
Lire le fichier correspondant dans `patterns/` pour le détail et l'exemple de code.

- **Cartes cliquables avec actions imbriquées** — carte qui navigue au clic, contenant un bouton (like, menu…) qui doit rester cliquable indépendamment. → [patterns/clickable-card.md](patterns/clickable-card.md)
- **`enum` pour un état simple** — statut de formulaire ou petit set de valeurs fixes, sans besoin de nombres ni d'itération runtime. → [patterns/enum-vs-const-union.md](patterns/enum-vs-const-union.md)
- **Shell plein viewport sous le header** — layout app (header + zone contenu) qui doit occuper toute la hauteur d'écran. → [patterns/full-height-app-shell.md](patterns/full-height-app-shell.md)
- **Effets hors updater `setState`** — log / fetch / mutation dans un `setState(fn)` qui se double en Strict Mode (dev). → [patterns/pure-setstate-updater.md](patterns/pure-setstate-updater.md)
- **Navigation = liste de liens** — `<nav>` de plusieurs liens, sidebar ou menu : garder `<ul>/<li>` et sortir les entrées en données. → [patterns/nav-link-list.md](patterns/nav-link-list.md)
- **État UI → descripteur** — un statut à N valeurs qui produit N blocs JSX quasi identiques (alerte, toast, bandeau). → [patterns/status-descriptor.md](patterns/status-descriptor.md)
- **Conteneur arrondi + enfants avec fond** — parent `rounded-*` / `border` dont un enfant opaque masque les coins. → [patterns/overflow-hidden-rounded-container.md](patterns/overflow-hidden-rounded-container.md)

<!-- Ajouter une ligne par nouveau pattern -->
