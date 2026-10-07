// Écart §15 (JOURNAL 2026-10-06) : la page qui demande un changement de canvas le dit elle-même ; les autres préviennent
// leurs viewers d'un toast court. Elle se souvient d'avoir demandé, le temps que la frame arrive.

export const OWN_SWITCH_WINDOW_MS = 8000;

export type OwnSwitchTracker = { mark(nowMs: number): void; isRecent(nowMs: number): boolean };

export function createOwnSwitchTracker(): OwnSwitchTracker {
  let markedAt = Number.NEGATIVE_INFINITY;
  return {
    mark(nowMs) {
      markedAt = nowMs;
    },
    isRecent: (nowMs) => nowMs - markedAt < OWN_SWITCH_WINDOW_MS,
  };
}
