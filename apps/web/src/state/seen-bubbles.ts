// Les bulles déjà vues (Écart §8.1, JOURNAL 2026-10-08), retenues par clé dans le navigateur : une bulle ne s'affiche qu'une fois.
// Le stockage est injecté ; quand la bulle s'affiche, l'appelant décide.

export type BubbleStorage = Pick<Storage, "getItem" | "setItem">;

export type SeenBubbles = {
  isSeen(key: string): boolean;
  markSeen(key: string): void;
  subscribe(listener: () => void): () => void;
};

const STORAGE_PREFIX = "liveplace:bubble-seen:";
const SEEN = "1";

export function createSeenBubbles(getStorage: () => BubbleStorage): SeenBubbles {
  const known = new Map<string, boolean>();
  const listeners = new Set<() => void>();

  // Lu au premier accès par clé, dans le navigateur seulement : `localStorage` n'existe pas sur le serveur.
  // Un stockage illisible ne retiendrait jamais la bulle : elle compte comme vue, et ne s'affiche pas.
  const isSeen = (key: string): boolean => {
    const cached = known.get(key);
    if (cached !== undefined) return cached;
    let isStored = true;
    try {
      isStored = getStorage().getItem(STORAGE_PREFIX + key) === SEEN;
    } catch (error) {
      console.warn(`bulle ${key} : stockage refusé, bulle comptée comme vue`, error);
    }
    known.set(key, isStored);
    return isStored;
  };

  return {
    isSeen,
    markSeen(key) {
      if (isSeen(key)) return;
      known.set(key, true);
      try {
        getStorage().setItem(STORAGE_PREFIX + key, SEEN);
      } catch (error) {
        console.warn(`bulle ${key} : vue non retenue, stockage refusé`, error);
      }
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
