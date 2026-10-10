// Un cran du délai OBS, comme on le dit (JOURNAL 2026-09-25) : « Aucun », « 10 s », « 2 min ».

import type { Locale } from "../locale/locale";
import { OBS_TEXTS } from "./obs-texts";

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;

export function obsDelayLabel(obsDelayMs: number, locale: Locale): string {
  if (obsDelayMs === 0) return OBS_TEXTS[locale].delayNone;
  return obsDelayMs < MINUTE_MS ? `${obsDelayMs / SECOND_MS} s` : `${obsDelayMs / MINUTE_MS} min`;
}
