// Une fenêtre ouverte (CDC 2026, Fenêtre) : un `<dialog>` natif, ouvert par `showModal()`. Le navigateur le dit par son
// attribut `open`, qu'il y ait eu animation ou non ; le clavier et les bulles d'aide se taisent tant qu'il y en a une.

import { useSyncExternalStore } from "react";

const countOpenWindows = (): number => document.querySelectorAll("dialog[open]").length;

export const isWindowOpen = (): boolean => countOpenWindows() > 0;

const subscribe = (listener: () => void): (() => void) => {
  const watching = new MutationObserver(listener);
  watching.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["open"] });
  return () => watching.disconnect();
};

const getServerSnapshot = (): number => 0;

// Combien de fenêtres sont ouvertes : une petite fenêtre s'ouvre parfois par-dessus la grande (Écart §8.1, JOURNAL 2026-10-09,
// la bulle de la grande se tait alors).
export const useOpenWindowCount = (): number =>
  useSyncExternalStore(subscribe, countOpenWindows, getServerSnapshot);
