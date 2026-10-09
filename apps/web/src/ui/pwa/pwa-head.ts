// Les balises de la page du jeu qui en font une application installable (Écart §9.1, JOURNAL 2026-10-08).

import type { CanvasOwner } from "../../usecase/resolve-canvas";

// Un seul `name` par balise : le routeur ne garde que la dernière de chaque nom.
export const pwaHead = ({ login, displayName }: Pick<CanvasOwner, "login" | "displayName">) => ({
  meta: [
    { name: "mobile-web-app-capable", content: "yes" },
    { name: "apple-mobile-web-app-capable", content: "yes" },
    // `default` et non `black-translucent` : ce dernier garde des symboles blancs, illisibles sur le fond clair du jeu.
    { name: "apple-mobile-web-app-status-bar-style", content: "default" },
    { name: "apple-mobile-web-app-title", content: displayName },
  ],
  links: [
    { rel: "manifest", href: `/${login}/manifest.webmanifest` },
    { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
  ],
});
