// Deux questions que le serveur ne peut pas trancher : la page est-elle montée dans le navigateur, et son onglet est-il visible ?
// Le serveur rend `false` et `true`, puis React relit : le HTML hydraté reste celui du serveur.

import { useSyncExternalStore } from "react";

const subscribeNothing = (): (() => void) => () => undefined;

// Faux au rendu du serveur et à l'hydratation, vrai ensuite : de quoi ne monter dans le navigateur que ce que la CSP de
// production refuserait dans le HTML du serveur (un attribut `style`).
export const useIsMounted = (): boolean =>
  useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );

const subscribeVisibility = (onChange: () => void): (() => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};

export const useIsPageVisible = (): boolean =>
  useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState === "visible",
    () => true,
  );
