// Une media query lue dans le navigateur. Le serveur ne connaît pas l'écran : il rend `false`, puis React relit.

import { useCallback, useSyncExternalStore } from "react";

// La même requête que `--control-size` dans tokens.css : écran étroit ou tactile, contrôles de 44 px.
export const COMPACT_SCREEN_QUERY = "(max-width: 640px), (pointer: coarse)";
// La barre du bas en colonne sur le côté (Écart §8.1 et §9.3, JOURNAL 2026-10-08), et la feuille Dessin en panneau : un téléphone
// en paysage (écran bas, étroit ou tactile), et un écran tactile large dont les deux côtés font au moins 560 px (pliable déplié,
// tablette). Aucune API ne distingue un pliable déplié d'une tablette. 560 : un téléphone n'atteint jamais ses deux côtés (440 px
// au plus, en portrait comme en paysage), le plus étroit des pliables dépliés mesurés fait 626 px (iPhone Duo).
export const SIDE_COLUMN_QUERY =
  "(orientation: landscape) and (max-height: 500px) and (max-width: 640px), (orientation: landscape) and (max-height: 500px) and (pointer: coarse), (pointer: coarse) and (min-width: 560px) and (min-height: 560px)";
// La fenêtre est une feuille qui monte du bas, ses sections en rangée d'onglets (window.css) : un écran étroit, tactile ou non.
export const WINDOW_SHEET_QUERY = "(max-width: 640px)";
// Un écran qu'on touche, même avec une souris branchée : le bouton Tracé y a sa place.
export const TOUCH_SCREEN_QUERY = "(any-pointer: coarse)";
// Le pointeur principal est un doigt : le zoom au toucher d'une case trop petite vise de plus grandes cases (canvas/draft-zoom.ts).
export const COARSE_POINTER_QUERY = "(pointer: coarse)";

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
