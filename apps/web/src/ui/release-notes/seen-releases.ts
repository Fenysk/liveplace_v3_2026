// Ce qui est lu des Nouveautés, retenu par clé dans le navigateur de l'appareil. Le stockage est injecté. Le magasin des bulles vues
// (state/seen-bubbles.ts) fait la même chose, mais la page d'accueil, qui montre le point de Nouveautés, ne charge jamais `state/`
// (home-offline.test.ts) : ce magasin-ci vit à côté des Nouveautés, avec ses propres clés.

export type SeenStorage = Pick<Storage, "getItem" | "setItem">;

export type SeenReleases = {
  isRead(key: string): boolean;
  markRead(key: string): void;
  subscribe(listener: () => void): () => void;
};

const STORAGE_PREFIX = "liveplace:release-read:";
const READ = "1";

export function createSeenReleases(getStorage: () => SeenStorage): SeenReleases {
  const known = new Map<string, boolean>();
  const listeners = new Set<() => void>();

  // Lu au premier accès par clé, dans le navigateur seulement : `localStorage` n'existe pas sur le serveur.
  // Un stockage illisible ne retiendrait jamais le « lu » : tout compte comme lu, et aucun point ne s'allume pour rien.
  const isRead = (key: string): boolean => {
    const cached = known.get(key);
    if (cached !== undefined) return cached;
    let isStored = true;
    try {
      isStored = getStorage().getItem(STORAGE_PREFIX + key) === READ;
    } catch (error) {
      console.warn(`nouveautés ${key} : stockage refusé, compté comme lu`, error);
    }
    known.set(key, isStored);
    return isStored;
  };

  return {
    isRead,
    markRead(key) {
      if (isRead(key)) return;
      known.set(key, true);
      try {
        getStorage().setItem(STORAGE_PREFIX + key, READ);
      } catch (error) {
        console.warn(`nouveautés ${key} : lu non retenu, stockage refusé`, error);
      }
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
