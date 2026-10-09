// Quel snapshot Convex garde, et lequel il refuse (Écart §8.1, JOURNAL 2026-10-06).

export const SNAPSHOTS_KEPT = 2; // par canvas et par palier : le dernier, et celui d'avant s'il est illisible

type Stamp = { version: number; takenAt: number };

// Une version plus basse est refusée : un Redis revenu en arrière ne remplace pas une sauvegarde plus avancée.
// À version égale (un réglage n'en change pas), le plus récent gagne.
export function isOutdated(incoming: Stamp, latest: Stamp | undefined): boolean {
  if (!latest) return false;
  return (
    incoming.version < latest.version ||
    (incoming.version === latest.version && incoming.takenAt < latest.takenAt)
  );
}
