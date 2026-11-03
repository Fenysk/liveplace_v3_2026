// Les petites fonctions du temps que partagent toutes les animations des vignettes : de 0 à 1, un adoucissement, un appui de bouton, la
// boucle qui se referme sur elle-même. Aucune ne garde rien d'une image à l'autre : l'image fixe est une image comme une autre.

export const clamp = (value: number): number => Math.min(1, Math.max(0, value));
export const ease = (progress: number): number => 1 - (1 - clamp(progress)) ** 3;
export const lerp = (from: number, to: number, progress: number): number => from + (to - from) * progress;

export const loopTime = (timeMs: number, period: number): number => ((timeMs % period) + period) % period;

// De 0 à 1 entre `from` et `to` (en ms de la boucle), puis il reste à 1 ; et de 1 à 0.
export const spanIn = (timeMs: number, from: number, to: number): number =>
  ease((timeMs - from) / (to - from));
export const spanOut = (timeMs: number, from: number, to: number): number => 1 - spanIn(timeMs, from, to);

// 0 hors de [from, to[, 1 au milieu : un appui de bouton, qui s'enfonce puis revient.
export const tap = (timeMs: number, from: number, to: number): number =>
  timeMs < from || timeMs >= to ? 0 : 1 - Math.abs((2 * (timeMs - from)) / (to - from) - 1);

// Un clic de la souris à l'instant `clickMs` : l'appui dure 160 ms, 80 de chaque côté du clic, et vaut 1 au clic.
export const CLICK_HALF_MS = 80;
export const click = (timeMs: number, clickMs: number): number =>
  tap(timeMs, clickMs - CLICK_HALF_MS, clickMs + CLICK_HALF_MS);
