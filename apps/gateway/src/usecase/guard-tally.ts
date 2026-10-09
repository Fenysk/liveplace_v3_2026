// Ce que bloquent les protections du gateway (Écart §4.3 et §5.1, JOURNAL 2026-10-09) : les poses refusées pour le débit, les
// connexions fermées en 1013. Un compteur par minute, en mémoire : un refus ne coûte qu'une addition, Redis n'en voit rien.

import { MINUTE_MS, type Timestamp, toMinuteStart } from "@liveplace/domain";
import {
  GUARD_DAY_MS,
  type GuardCount,
  type GuardMinute,
  type GuardTotals,
  toGuardTotals,
} from "@liveplace/domain/capacity";

export interface GuardTally {
  countRefusedPlacement(): void; // à chaque pose refusée pour le débit
  countClosedConnection(): void; // à chaque connexion fermée en 1013
  getTotals(nowMs: Timestamp): GuardTotals; // la dernière heure et les 24 dernières, minute en cours comprise
  // Les minutes fermées pas encore écrites, du plus ancien au plus récent, jamais celle en cours.
  listUnstored(nowMs: Timestamp): GuardMinute[];
  markStored(minutes: readonly GuardMinute[]): void; // celles-ci et tout ce qui les précède sont écrits
  // Au démarrage : les minutes que Redis a gardées comptent, et ne se réécrivent pas.
  restore(minutes: readonly GuardMinute[], nowMs: Timestamp): void;
}

export function createGuardTally(now: () => Timestamp): GuardTally {
  const counts = new Map<Timestamp, GuardCount>();
  let storedUntil = Number.NEGATIVE_INFINITY; // chaque minute avant cet instant est écrite

  const getOpen = (): GuardCount => {
    const at = toMinuteStart(now());
    const found = counts.get(at);
    if (found) return found;
    const created = { refusedPlacements: 0, closedConnections: 0 };
    counts.set(at, created);
    return created;
  };

  // Ce qui a plus de 24 h s'en va de la mémoire.
  const listMinutes = (nowMs: Timestamp): GuardMinute[] => {
    for (const at of counts.keys()) if (at <= nowMs - GUARD_DAY_MS) counts.delete(at);
    return [...counts].map(([at, count]) => ({ at, ...count })).sort((left, right) => left.at - right.at);
  };

  return {
    countRefusedPlacement() {
      getOpen().refusedPlacements += 1;
    },

    countClosedConnection() {
      getOpen().closedConnections += 1;
    },

    getTotals: (nowMs) => toGuardTotals(listMinutes(nowMs), nowMs),

    listUnstored: (nowMs) =>
      listMinutes(nowMs).filter(({ at }) => at >= storedUntil && at < toMinuteStart(nowMs)),

    markStored(minutes) {
      for (const { at } of minutes) storedUntil = Math.max(storedUntil, at + MINUTE_MS);
    },

    restore(minutes, nowMs) {
      for (const { at, ...count } of minutes) counts.set(at, count);
      storedUntil = Math.max(storedUntil, toMinuteStart(nowMs));
    },
  };
}
