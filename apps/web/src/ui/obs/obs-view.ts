// La vue OBS (§9.1) : OBS Studio et Streamlabs injectent tous deux `window.obsstudio` dans leurs sources Navigateur, et
// `/{login}/obs` force la vue dans un navigateur normal. Écart §9.1 (JOURNAL 2026-09-25) : la marque est posée avant la
// première peinture, par un script émis par `ScriptOnce` comme celui du thème. Le CSS cache alors l'interface.

import { useSyncExternalStore } from "react";

const OBS_VIEW = "obs";

// Deux segments au moins : un streamer dont le pseudo serait « obs » garde sa page de jeu.
export const OBS_VIEW_SCRIPT = `if(window.obsstudio||/^\\/[^/]+\\/obs\\/?$/.test(location.pathname))document.documentElement.dataset.view=${JSON.stringify(OBS_VIEW)}`;

export const isObsView = (): boolean => document.documentElement.dataset.view === OBS_VIEW;

// La marque ne bouge plus une fois posée : rien à écouter.
const subscribeToNothing = (): (() => void) => () => undefined;

// Le serveur ne voit pas `window.obsstudio` : il rend le jeu, que le CSS cache déjà, puis React bascule.
export function useIsObsView(): boolean {
  return useSyncExternalStore(subscribeToNothing, isObsView, () => false);
}
