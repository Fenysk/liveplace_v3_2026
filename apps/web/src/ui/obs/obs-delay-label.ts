// Un cran du délai OBS, comme on le dit (JOURNAL 2026-09-25) : « Aucun », « 10 s », « 2 min ».

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;

export function obsDelayLabel(obsDelayMs: number): string {
  if (obsDelayMs === 0) return "Aucun";
  return obsDelayMs < MINUTE_MS ? `${obsDelayMs / SECOND_MS} s` : `${obsDelayMs / MINUTE_MS} min`;
}
