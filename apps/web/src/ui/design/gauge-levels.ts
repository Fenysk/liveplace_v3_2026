// Ce que la jauge montre (CDC 2026) : les deux fluides, le minuteur de l'anneau, l'avance vers le prochain pixel.

import type { Timestamp } from "@liveplace/domain";

// Le prochain pixel : `null` quand la jauge est pleine, et le minuteur arrêté. `secondsLeft` : ce que dit l'anneau.
export type GaugeRefill = { endsAt: Timestamp; durationMs: number; secondsLeft: number };

// Niveaux entre 0 et 1. `chargesLevel` : le fluide réservé par le brouillon s'arrête là, derrière `remainingLevel`.
export type GaugeLevels = { remainingLevel: number; chargesLevel: number };

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;

const clampShare = (share: number): number => Math.min(1, Math.max(0, share));

const twoDigits = (count: number): string => String(count).padStart(2, "0");

export function gaugeLevels(charges: number, max: number, draft: number): GaugeLevels {
  const remaining = Math.max(0, charges - draft);
  const share = (count: number) => (max > 0 ? clampShare(count / max) : 0);
  return { remainingLevel: share(remaining), chargesLevel: share(charges) };
}

// Le minuteur de l'anneau (Écart §9.3, JOURNAL 2026-10-13) : « 12 », « 1:05 », puis « 2h05 ». L'unique exception au format des
// durées : 36 px n'ont pas la place d'une unité.
export function timerText(seconds: number): string {
  if (seconds < SECONDS_PER_MINUTE) return String(seconds);
  if (seconds < SECONDS_PER_HOUR)
    return `${Math.floor(seconds / SECONDS_PER_MINUTE)}:${twoDigits(seconds % SECONDS_PER_MINUTE)}`;
  const minutes = Math.floor((seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  return `${Math.floor(seconds / SECONDS_PER_HOUR)}h${twoDigits(minutes)}`;
}

// L'horloge du téléphone n'est pas celle du serveur : l'anneau reste plein ou vide, jamais au-delà (§9.4).
export function refillProgress(refill: Pick<GaugeRefill, "endsAt" | "durationMs">, nowMs: Timestamp): number {
  return clampShare(1 - (refill.endsAt - nowMs) / refill.durationMs);
}

// Le fluide s'incline pendant un changement de niveau (design system, Gauge) : dans le sens du mouvement.
export function tiltDirection(previousLevel: number, nextLevel: number): -1 | 0 | 1 {
  return Math.sign(nextLevel - previousLevel) as -1 | 0 | 1;
}
