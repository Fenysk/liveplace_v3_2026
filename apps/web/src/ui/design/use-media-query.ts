// Une media query lue dans le navigateur. Le serveur ne connaît pas l'écran : il rend `false`, puis React relit.

import { useCallback, useSyncExternalStore } from "react";

// La même requête que `--control-size` dans tokens.css : écran étroit ou tactile, contrôles de 44 px.
export const COMPACT_SCREEN_QUERY = "(max-width: 640px), (pointer: coarse)";
// Un écran qu'on touche, même avec une souris branchée : le bouton Tracé y a sa place.
export const TOUCH_SCREEN_QUERY = "(any-pointer: coarse)";

const getServerMatch = (): boolean => false;

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (listener: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", listener);
      return () => list.removeEventListener("change", listener);
    },
    [query],
  );
  const getMatch = useCallback(() => window.matchMedia(query).matches, [query]);
  return useSyncExternalStore(subscribe, getMatch, getServerMatch);
}
