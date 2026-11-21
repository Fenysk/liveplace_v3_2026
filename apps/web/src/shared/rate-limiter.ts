// Un seau par clé (une adresse, ici) : il se remplit de `refillPerSecond` par seconde jusqu'à `capacity`, chaque demande en
// prend une. Plein, il laisse passer d'un coup une rafale de `capacity` demandes ; vide, il refuse jusqu'à la suivante. En mémoire :
// un seul process, et un redémarrage repart de seaux pleins.
export type RateVerdict = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export type RateLimiter = { take: (key: string) => RateVerdict };

type Bucket = { allowance: number; at: number };

export type RateLimiterOptions = {
  capacity: number;
  refillPerSecond: number;
  now: () => number;
  // Au-delà, les seaux revenus pleins sont oubliés (un seau plein et l'absence de seau disent la même chose) ; si cela ne suffit
  // pas, tous le sont : la mémoire ne grossit jamais sans borne sous des milliers d'adresses.
  maxKeys: number;
};

export function createRateLimiter({
  capacity,
  refillPerSecond,
  now,
  maxKeys,
}: RateLimiterOptions): RateLimiter {
  const buckets = new Map<string, Bucket>();
  const refilled = ({ allowance, at }: Bucket, instant: number): number =>
    Math.min(capacity, allowance + ((instant - at) / 1000) * refillPerSecond);

  const forget = (instant: number): void => {
    for (const [key, bucket] of buckets) if (refilled(bucket, instant) >= capacity) buckets.delete(key);
    if (buckets.size > maxKeys) buckets.clear();
  };

  return {
    take: (key) => {
      const instant = now();
      if (buckets.size >= maxKeys && !buckets.has(key)) forget(instant);
      const known = buckets.get(key);
      const allowance = known ? refilled(known, instant) : capacity;
      if (allowance < 1) {
        // `known` existe forcément : un seau neuf est plein.
        buckets.set(key, { allowance, at: instant });
        return { allowed: false, retryAfterSeconds: Math.ceil((1 - allowance) / refillPerSecond) };
      }
      buckets.set(key, { allowance: allowance - 1, at: instant });
      return { allowed: true };
    },
  };
}
