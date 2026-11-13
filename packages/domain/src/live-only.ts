// CDC « Dessin seulement pendant le live » : un viewer ne dessine que pendant le live du streamer, et 10 minutes après sa fin.
// Pur : le gateway décide de chaque pose, le web affiche ce qu'il dit (§10.3).

import { MINUTE_MS, type Role, type Timestamp } from "./index";

// Un stream qui coupe et repart dans ce délai ne ferme rien. Distinct de `STREAM_GRACE_MS` (5 min), qui ne comble que l'activité.
export const LIVE_ONLY_GRACE_MS = 10 * MINUTE_MS;

// L'état du live d'un streamer tel que le web le garde : `twitchLive` présent, il est en live ; `endedAt`, l'heure où il a fini.
export type LiveRecord = { twitchLive?: object | undefined; endedAt?: Timestamp | undefined };

// `closesAt` : le dessin est ouvert et se ferme à cette heure, sans autre événement (le live vient de finir).
export type DrawingGate = { isClosed: boolean; closesAt?: Timestamp };

export const OPEN_DRAWING: DrawingGate = { isClosed: false };

// Le viewer et le modérateur seuls : le streamer dessine toujours, et l'invité ne dessine pas, rien ne change pour lui.
export function isBoundToLive(isLiveOnly: boolean, role: Role): boolean {
  return isLiveOnly && (role === "viewer" || role === "moderator");
}

// Un état jamais lu (`null`) laisse le dessin ouvert : LivePlace ne sait pas, et ne ferme pas dans le doute. Sans `endedAt`,
// le streamer est hors live depuis avant qu'on le note : fermé.
export function liveGate(record: LiveRecord | null, nowMs: Timestamp): DrawingGate {
  if (record === null || record.twitchLive) return OPEN_DRAWING;
  const closesAt = (record.endedAt ?? 0) + LIVE_ONLY_GRACE_MS;
  return nowMs >= closesAt ? { isClosed: true } : { isClosed: false, closesAt };
}
