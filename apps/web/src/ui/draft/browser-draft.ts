// Ce que le brouillon prend dans le navigateur : son stockage, et son horloge. Partagé par la page du jeu et celle d'une
// archive, qui n'en fait rien mais le tient (le canvas de la scène l'exige).

import type { DraftClock } from "../../state/draft-store";

// Lu à chaque accès : dans une fenêtre qui refuse le stockage, l'accès lui-même lève (le brouillon l'attrape).
export const getBrowserStorage = () => window.localStorage;

export const browserClock: DraftClock = {
  now: () => Date.now(),
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};
