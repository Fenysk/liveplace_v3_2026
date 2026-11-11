// Le plan des images du GIF timelapse du développeur (JOURNAL 2026-11-11) : pur, le navigateur s'en sert pour dessiner et encoder.

import type { Result } from "@liveplace/shared";

export const STILLS_PER_SECOND = 20;
const STILL_CS = 100 / STILLS_PER_SECOND; // le délai d'une image de l'animation, en centièmes de seconde
const FIRST_STILL_HOLD_CS = 50; // l'état de départ, tenu 0,5 s
const LAST_STILL_HOLD_CS = 250; // l'état final, tenu 2,5 s de plus
const HOLDS_SECONDS = (FIRST_STILL_HOLD_CS + LAST_STILL_HOLD_CS) / 100;
const MIN_SECONDS = 10;
const MAX_SECONDS = 60;
const SECONDS_STEP_FROM_CHANGES = 1000; // 1 000 changements : 10 s ; chaque doublement en ajoute 10

// L'image montre l'état après `changesApplied` changements, pendant `delayCs` centièmes de seconde.
export type Still = { changesApplied: number; delayCs: number };

export type StillPlanRefusal = "no_changes";

// 10 s jusqu'à 1 000 changements, +10 s à chaque doublement, 60 s au plus.
export function timelapseSeconds(totalChanges: number): number {
  const doublings = Math.log2(Math.max(totalChanges, SECONDS_STEP_FROM_CHANGES) / SECONDS_STEP_FROM_CHANGES);
  return Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, MIN_SECONDS * (1 + doublings)));
}

export function planStills(totalChanges: number): Result<Still[], StillPlanRefusal> {
  if (totalChanges <= 0) return { ok: false, error: "no_changes" };
  const count = Math.round((timelapseSeconds(totalChanges) - HOLDS_SECONDS) * STILLS_PER_SECOND);
  const stills: Still[] = [{ changesApplied: 0, delayCs: FIRST_STILL_HOLD_CS }];
  for (let index = 1; index <= count; index++) {
    const changesApplied = Math.round((index * totalChanges) / count);
    const delayCs = index === count ? STILL_CS + LAST_STILL_HOLD_CS : STILL_CS;
    const previous = stills.at(-1);
    if (previous?.changesApplied === changesApplied) previous.delayCs += delayCs;
    else stills.push({ changesApplied, delayCs });
  }
  return { ok: true, value: stills };
}
