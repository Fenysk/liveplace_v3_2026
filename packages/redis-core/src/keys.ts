// Clés Redis et leur rétention (§5.1). Sans mention : vit avec le canvas.

import type { CellKey } from "@liveplace/domain";

export const HIST_DEPTH = 8; // D-06
export const EVENTS_MAXLEN = 20_000; // `MAXLEN ~` à chaque XADD, rien d'autre ne trimme
export const GAUGE_TTL_SECONDS = 30 * 24 * 3600; // glissant, jauge expirée = pleine
export const REQ_TTL_SECONDS = 120;
export const CLEAR_SLICE_CELLS = 4096; // §5.4 : la latence Redis pire cas d'une tranche, connue d'avance

export function buildCanvasKeys(canvasId: string) {
  const prefix = `cv:${canvasId}:`;
  // Le Lua construit `hist:` et `cells:` en concaténant ces préfixes.
  const histPrefix = `${prefix}hist:`;
  const cellsPrefix = `${prefix}cells:`;
  return {
    meta: `${prefix}meta`,
    state: `${prefix}state`,
    version: `${prefix}version`,
    events: `${prefix}events`,
    cleared: `${prefix}cleared`, // aucun EXPIRE : il rouvrirait le trou de D-16
    bans: `${prefix}bans`,
    mods: `${prefix}mods`,
    live: `${prefix}live`, // canal PUB/SUB, éphémère
    histPrefix,
    cellsPrefix,
    hist: (cellKey: CellKey) => `${histPrefix}${cellKey}`,
    cells: (userId: string) => `${cellsPrefix}${userId}`, // vidé par clearUser
    // Écart §5.4 (JOURNAL 2026-09-25) : vidé par la dernière tranche ; une coupure le garde jusqu'au clearUser suivant.
    clearing: (userId: string) => `${prefix}clearing:${userId}`,
    // Écart §5.1 (JOURNAL 2026-09-25) : la preuve d'un ban, `cellKey` → `colorIndex`. Écrite par ban, supprimée par unban.
    ban: (userId: string) => `${prefix}ban:${userId}`,
    gauge: (userId: string) => `${prefix}gauge:${userId}`,
    req: (userId: string, requestId: string) => `${prefix}req:${userId}:${requestId}`,
  };
}

// Sans EXPIRE : `inspect` perdrait le nom d'un auteur inactif.
export function userKey(userId: string): string {
  return `user:${userId}`;
}
