// Le classement replié ou déplié (JOURNAL 2026-10-06), retenu d'une visite à l'autre dans le navigateur. Chaque accès
// au stockage peut échouer : le choix tient alors pour la visite, jamais une page cassée.

import { useSyncExternalStore } from "react";

export type CollapseStorage = Pick<Storage, "getItem" | "setItem">;

const STORAGE_KEY = "liveplace:scoreboard-collapsed";

export function createScoreboardCollapse(getStorage: () => CollapseStorage) {
  let isCollapsed: boolean | null = null;
  const listeners = new Set<() => void>();

  // Lu au premier accès, dans le navigateur seulement : `localStorage` n'existe pas sur le serveur.
  const getSnapshot = (): boolean => {
    if (isCollapsed !== null) return isCollapsed;
    try {
      isCollapsed = getStorage().getItem(STORAGE_KEY) === "1";
    } catch (error) {
      console.warn("scoreboard : stockage refusé, classement déplié", error);
      isCollapsed = false;
    }
    return isCollapsed;
  };

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot,
    toggle(): void {
      const next = !getSnapshot();
      isCollapsed = next;
      try {
        getStorage().setItem(STORAGE_KEY, next ? "1" : "0");
      } catch (error) {
        console.warn("scoreboard : choix non retenu, stockage refusé", error);
      }
      for (const listener of listeners) listener();
    },
  };
}

const collapse = createScoreboardCollapse(() => window.localStorage);

// Le serveur ne connaît pas le choix : il rend déplié, et React relit le vrai choix à l'hydratation.
const getServerSnapshot = (): boolean => false;

export function useScoreboardCollapse() {
  const isCollapsed = useSyncExternalStore(collapse.subscribe, collapse.getSnapshot, getServerSnapshot);
  return { isCollapsed, toggle: collapse.toggle };
}
