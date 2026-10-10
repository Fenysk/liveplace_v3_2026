// Un cache en mémoire, borné, dont chaque valeur a sa durée : l'image d'aperçu d'un canvas, la photo d'un streamer.

export type TimedCache<Value> = {
  get(key: string): Value | undefined; // absent ou expiré : `undefined`
  set(key: string, value: Value, keptMs: number): void;
  delete(key: string): void;
};

export function createTimedCache<Value>(maxEntries: number, now: () => number): TimedCache<Value> {
  // Dans l'ordre où les clés ont été posées : les plus anciennes en tête.
  const entries = new Map<string, { value: Value; expiresAt: number }>();

  return {
    get(key) {
      const entry = entries.get(key);
      if (entry && now() < entry.expiresAt) return entry.value;
      entries.delete(key);
      return undefined;
    },

    set(key, value, keptMs) {
      const at = now();
      entries.delete(key);
      for (const [oldKey, { expiresAt }] of entries) {
        if (entries.size < maxEntries && at < expiresAt) break;
        entries.delete(oldKey);
      }
      entries.set(key, { value, expiresAt: at + keptMs });
    },

    delete(key) {
      entries.delete(key);
    },
  };
}
