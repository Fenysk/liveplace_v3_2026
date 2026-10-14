// Les dessins posés sur cet appareil (Écart §8.1, JOURNAL 2026-10-12), retenus dans son navigateur : ils disent quand proposer la
// palette, Ctrl+Z et la pipette. Compté par appareil, plafonné à ce qui sert ; le stockage est injecté.

import type { BubbleStorage } from "./seen-bubbles";

// Le plus grand seuil d'une bulle : la pipette, au troisième dessin posé.
export const PLACEMENT_COUNT_CAP = 3;

const STORAGE_KEY = "liveplace:placement-count";

export type PlacementCount = {
  subscribe(listener: () => void): () => void; // la forme qu'attend `useSyncExternalStore`
  getCount(): number;
  record(): void; // un dessin vient d'être posé en entier
  forget(): void; // rejouer le tutoriel
};

export function createPlacementCount(getStorage: () => BubbleStorage): PlacementCount {
  const listeners = new Set<() => void>();
  let count: number | undefined;

  const setCount = (next: number): void => {
    count = next;
    for (const listener of listeners) listener();
  };

  // Lu au premier accès, dans le navigateur seulement. Un stockage illisible compte le plafond, comme une bulle vue : rien ne
  // se retiendrait, et une bulle ne doit pas revenir en boucle. Une valeur qui n'est pas un nombre vaut aucun dessin.
  const read = (): number => {
    try {
      const stored = Number(getStorage().getItem(STORAGE_KEY) ?? 0);
      return Number.isInteger(stored) && stored > 0 ? Math.min(stored, PLACEMENT_COUNT_CAP) : 0;
    } catch (error) {
      console.warn("dessins posés : stockage refusé, comptés au plafond", error);
      return PLACEMENT_COUNT_CAP;
    }
  };

  const getCount = (): number => {
    count ??= read();
    return count;
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getCount,
    record() {
      const next = Math.min(getCount() + 1, PLACEMENT_COUNT_CAP);
      if (next === getCount()) return;
      try {
        getStorage().setItem(STORAGE_KEY, String(next));
      } catch (error) {
        console.warn("dessins posés : non retenus, stockage refusé", error);
      }
      setCount(next);
    },
    forget() {
      try {
        getStorage().removeItem(STORAGE_KEY);
        setCount(0);
      } catch (error) {
        console.warn("dessins posés : oubli impossible, stockage refusé", error);
      }
    },
  };
}
