// Ce que la jauge montre (CDC 2026) : le nombre de l'anneau, les deux fluides, l'avance vers la prochaine charge.

import type { Timestamp } from "@liveplace/domain";

// La prochaine charge : `null` quand la jauge est pleine, et le minuteur arrêté.
export type GaugeRefill = { endsAt: Timestamp; durationMs: number };

// Niveaux entre 0 et 1. `chargesLevel` : le fluide réservé par le brouillon s'arrête là, derrière `remainingLevel`.
export type GaugeLevels = { count: number; remainingLevel: number; chargesLevel: number };

const clampShare = (share: number): number => Math.min(1, Math.max(0, share));

export function gaugeLevels(charges: number, max: number, draft: number): GaugeLevels {
  const remaining = Math.max(0, charges - draft);
  const share = (count: number) => (max > 0 ? clampShare(count / max) : 0);
  return { count: remaining, remainingLevel: share(remaining), chargesLevel: share(charges) };
}

// L'horloge du téléphone n'est pas celle du serveur : l'anneau reste plein ou vide, jamais au-delà (§9.4).
export function refillProgress(refill: GaugeRefill, nowMs: Timestamp): number {
  return clampShare(1 - (refill.endsAt - nowMs) / refill.durationMs);
}
