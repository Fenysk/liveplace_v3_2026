// Suivre le canvas actif (Écart §15, JOURNAL 2026-10-06) : l'attente avant de relire la page, selon l'essai.
// Au premier, tout de suite ; ensuite de plus en plus lentement, car Convex a peut-être encore l'ancien canvas actif.

const FOLLOW_DELAYS_MS = [0, 400, 800, 1600] as const;
const FOLLOW_MAX_DELAY_MS = 3000;

export const followDelayMs = (attempt: number): number => FOLLOW_DELAYS_MS[attempt] ?? FOLLOW_MAX_DELAY_MS;
