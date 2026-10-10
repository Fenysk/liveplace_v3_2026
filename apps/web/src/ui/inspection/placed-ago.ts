// La date de pose, en relatif (CDC 2026, inspection) : « il y a 3 heures ». La date complète va dans l'infobulle.

import type { Timestamp } from "@liveplace/domain";
import { INTL_TAGS, type Locale } from "../locale/locale";
import { INSPECTION_TEXTS } from "./inspection-texts";

const UNITS = [
  { unit: "day", ms: 86_400_000 },
  { unit: "hour", ms: 3_600_000 },
  { unit: "minute", ms: 60_000 },
] as const;

// L'horloge du téléphone peut avancer un peu sur celle du serveur : une pose « future » vient d'avoir lieu.
export function formatPlacedAgo(placedAt: Timestamp, nowMs: Timestamp, locale: Locale): string {
  const elapsed = nowMs - placedAt;
  const largest = UNITS.find(({ ms }) => elapsed >= ms);
  if (!largest) return INSPECTION_TEXTS[locale].justNow;
  return new Intl.RelativeTimeFormat(INTL_TAGS[locale], { numeric: "auto" }).format(
    -Math.floor(elapsed / largest.ms),
    largest.unit,
  );
}
