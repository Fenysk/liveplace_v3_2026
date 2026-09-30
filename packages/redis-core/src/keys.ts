// Clés Redis et leur rétention (§5.1). Sans mention : vit avec le canvas.

import type { CellKey } from "@liveplace/domain";
import type { PlacementRef } from "@liveplace/domain/ports";

export const HIST_DEPTH = 8; // D-06
export const EVENTS_MAXLEN = 20_000; // `MAXLEN ~` à chaque XADD, rien d'autre ne trimme
export const GAUGE_TTL_SECONDS = 30 * 24 * 3600; // glissant, jauge expirée = pleine
export const REQ_TTL_SECONDS = 120;
export const RECENT_MAX_EVENTS = 2000; // §5.6 : le `recent` de la vue OBS, borné même avec un délai de 10 min
export const CLEAR_SLICE_CELLS = 4096; // §5.4 : la latence Redis pire cas d'une tranche, connue d'avance
export const RECENTLY_CLEARED_TTL_SECONDS = 3600; // JOURNAL 2026-09-29 : le temps de décider d'un ban après un retrait

// Écart §2 (JOURNAL 2026-09-27) : les actions venues de Twitch, déposées par le web, lues par le seul gateway.
export const TWITCH_COMMANDS_KEY = "twitch:commands";
export const TWITCH_COMMANDS_MAXLEN = 10_000; // `MAXLEN ~` : une action acquittée n'a plus besoin de rester
export const TWITCH_COMMANDS_READER = "gateway";
export const TWITCH_COMMANDS_CONSUMER = "gateway"; // un seul gateway : au redémarrage, il retrouve ce qu'il n'a pas fini

// Écart §5.1 (JOURNAL 2026-09-28) : une pose se nomme par son auteur, `placementId` n'est unique que pour lui.
export function toPlacementKey({ authorId, placementId }: PlacementRef): string {
  return `${authorId}:${placementId}`;
}

// L'inverse : `placementId` n'a jamais de `:`, l'auteur est tout ce qui le précède.
export function toPlacementRef(placementKey: string): PlacementRef {
  const at = placementKey.lastIndexOf(":");
  return { authorId: placementKey.slice(0, at), placementId: placementKey.slice(at + 1) };
}

export function buildCanvasKeys(canvasId: string) {
  const prefix = `cv:${canvasId}:`;
  // Le Lua construit `hist:`, `cells:`, `clearing:` et `reports:` en concaténant ces préfixes.
  const histPrefix = `${prefix}hist:`;
  const cellsPrefix = `${prefix}cells:`;
  const clearingPrefix = `${prefix}clearing:`;
  const reportsPrefix = `${prefix}reports:`;
  return {
    meta: `${prefix}meta`,
    state: `${prefix}state`,
    version: `${prefix}version`,
    events: `${prefix}events`,
    cleared: `${prefix}cleared`, // aucun EXPIRE : il rouvrirait le trou de D-16
    // Écart §5.1 (JOURNAL 2026-09-28) : les pierres tombales d'une pose et d'une plage d'heures, sans EXPIRE non plus.
    clearedPlacements: `${prefix}cleared:placements`,
    clearedRanges: `${prefix}cleared:ranges`, // `userId` → `[[from, to], …]`
    reported: `${prefix}reported`, // pose → heure du premier signalement, jusqu'à la décision d'un modérateur
    offStream: `${prefix}offstream`, // les poses cachées du stream, jusqu'au retrait ou à Rétablir
    approved: `${prefix}approved`, // les poses rétablies : elles ne se signalent plus
    clearingPrefix,
    reportsPrefix,
    bans: `${prefix}bans`,
    bansTwitch: `${prefix}bans:twitch`, // Écart §5.1 (JOURNAL 2026-09-27) : les bans venus de Twitch
    mods: `${prefix}mods`,
    // Écart §5.1 (JOURNAL 2026-09-27) : l'origine des modérateurs ; `mods` en est l'union, tenue par moderators.lua.
    modsTwitch: `${prefix}mods:twitch`,
    modsLiveplace: `${prefix}mods:liveplace`,
    twitchUsers: `${prefix}twitch:users`, // `userId` → `{login, displayName}`, pour qui n'a pas de miroir `user:`
    live: `${prefix}live`, // canal PUB/SUB, éphémère
    histPrefix,
    cellsPrefix,
    hist: (cellKey: CellKey) => `${histPrefix}${cellKey}`,
    cells: (userId: string) => `${cellsPrefix}${userId}`, // vidé par clearUser
    // Écart §5.4 (JOURNAL 2026-09-25) : vidé par la dernière tranche ; une coupure le garde jusqu'au clearUser suivant.
    clearing: (userId: string) => `${clearingPrefix}${userId}`,
    reports: (placementKey: string) => `${reportsPrefix}${placementKey}`, // qui a signalé cette pose
    // Écart §5.1 (JOURNAL 2026-09-25) : la preuve d'un ban, `cellKey` → `colorIndex`. Écrite par ban, supprimée par unban.
    ban: (userId: string) => `${prefix}ban:${userId}`,
    // Écart §5.4 (JOURNAL 2026-09-29) : ce qu'un retrait vient de lui ôter, `cellKey` → `colorIndex`, pour la preuve d'un ban.
    recentlyCleared: (userId: string) => `${prefix}cleared:recent:${userId}`,
    gauge: (userId: string) => `${prefix}gauge:${userId}`,
    // Écart §5.1 (JOURNAL 2026-09-30) : sans EXPIRE, contrairement à la jauge : une progression ne se perd pas.
    progress: (userId: string) => `${prefix}progress:${userId}`,
    req: (userId: string, requestId: string) => `${prefix}req:${userId}:${requestId}`,
  };
}

// Sans EXPIRE : `inspect` perdrait le nom d'un auteur inactif.
export function userKey(userId: string): string {
  return `user:${userId}`;
}
