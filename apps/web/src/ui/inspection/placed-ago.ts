// La date de pose, en relatif (CDC 2026, inspection) : « il y a 3 heures ». La date complète va dans l'infobulle.

import type { Timestamp } from "@liveplace/domain";

const RELATIVE_FORMAT = new Intl.RelativeTimeFormat("fr-FR", { numeric: "auto" });
const UNITS = [
  { unit: "day", ms: 86_400_000 },
  { unit: "hour", ms: 3_600_000 },
  { unit: "minute", ms: 60_000 },
] as const;

// L'horloge du téléphone peut avancer un peu sur celle du serveur : une pose « future » vient d'avoir lieu.
export function formatPlacedAgo(placedAt: Timestamp, nowMs: Timestamp): string {
  const elapsed = nowMs - placedAt;
  const largest = UNITS.find(({ ms }) => elapsed >= ms);
  return largest ? RELATIVE_FORMAT.format(-Math.floor(elapsed / largest.ms), largest.unit) : "à l’instant";
}
