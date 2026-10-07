// Le délai de diffusion (écart §5.1, JOURNAL 2026-10-07) : d'une pose reçue à l'envoi de sa frame, en p99 sur 5 minutes. Un
// compteur par milliseconde, ouvert le temps d'une tranche : la mémoire ne dépend pas du nombre de poses, seulement des délais vus.

import type { Timestamp } from "@liveplace/domain";
import { INSTANT_WINDOW_MS } from "@liveplace/domain/capacity";

// Au-delà, tout tombe dans le dernier compteur : le centile dit « dépassé » sans garder chaque délai.
export const MAX_DELAY_MS = 2000;
const P99_PERCENT = 99;

// Une tranche fermée : les délais vus et leur nombre, sans les compteurs vides.
type Slice = { closedAt: Timestamp; counts: [delayMs: number, count: number][] };

export interface DelayTally {
  record(delayMs: number): void; // rien de lourd : un seul compteur de plus, à chaque pose envoyée
  // La tranche en cours se ferme à `nowMs`, et le centile se prend sur celles des 5 dernières minutes. Appelé à chaque échantillon.
  getP99(nowMs: Timestamp): number;
}

export function createDelayTally(): DelayTally {
  let open = new Uint32Array(MAX_DELAY_MS + 1);
  let slices: Slice[] = [];

  const closeSlice = (nowMs: Timestamp): void => {
    const counts = Array.from(open, (count, delayMs): [number, number] => [delayMs, count]).filter(
      ([, count]) => count > 0,
    );
    if (counts.length > 0) slices.push({ closedAt: nowMs, counts });
    open = new Uint32Array(MAX_DELAY_MS + 1);
    slices = slices.filter(({ closedAt }) => closedAt > nowMs - INSTANT_WINDOW_MS);
  };

  return {
    record(delayMs) {
      const slot = Math.min(MAX_DELAY_MS, Math.max(0, Math.round(delayMs)));
      open[slot] = (open[slot] ?? 0) + 1;
    },

    getP99(nowMs) {
      closeSlice(nowMs);
      const totals = new Map<number, number>();
      for (const { counts } of slices)
        for (const [delayMs, count] of counts) totals.set(delayMs, (totals.get(delayMs) ?? 0) + count);
      const all = [...totals.values()].reduce((sum, count) => sum + count, 0);
      const needed = Math.ceil((all * P99_PERCENT) / 100);
      let seen = 0;
      for (const [delayMs, count] of [...totals].sort(([left], [right]) => left - right)) {
        seen += count;
        if (seen >= needed) return delayMs;
      }
      return 0;
    },
  };
}
