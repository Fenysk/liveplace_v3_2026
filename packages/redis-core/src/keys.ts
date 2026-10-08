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

// §5.1 (JOURNAL 2026-10-06) : le score d'un joueur vaut `pixels × SCORE_TIE_SPAN + (SCORE_TIE_SPAN − 1 − version)`. À
// égalité de pixels, la plus petite version, donc le premier arrivé, reste devant. Les deux bornes gardent le score un
// entier exact d'un double : (2^24 − 1) × 2^29 + 2^29 − 1 = 2^53 − 1.
export const SCORE_TIE_SPAN = 2 ** 29;
export const SCORE_MAX_PIXELS = 2 ** 24 - 1;

export function toScorePixels(score: number): number {
  return Math.floor(score / SCORE_TIE_SPAN);
}

// §2 : les actions venues de Twitch, déposées par le web, lues par le seul gateway.
export const TWITCH_COMMANDS_KEY = "twitch:commands";
export const TWITCH_COMMANDS_MAXLEN = 10_000; // `MAXLEN ~` : une action acquittée n'a plus besoin de rester
export const TWITCH_COMMANDS_READER = "gateway";
export const TWITCH_COMMANDS_CONSUMER = "gateway"; // un seul gateway : au redémarrage, il retrouve ce qu'il n'a pas fini

// Écart §5.1 (JOURNAL 2026-10-08) : un message EventSub déjà reçu, retenu 10 minutes (la fraîcheur que le web accepte) + 1 de marge.
export const TWITCH_MESSAGE_TTL_SECONDS = 11 * 60;

export function twitchMessageKey(messageId: string): string {
  return `twitch:message:${messageId}`;
}

// §5.1 : une pose se nomme par son auteur, `placementId` n'est unique que pour lui.
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
    prefix,
    meta: `${prefix}meta`,
    state: `${prefix}state`,
    version: `${prefix}version`,
    events: `${prefix}events`,
    cleared: `${prefix}cleared`, // aucun EXPIRE : il rouvrirait le trou de D-16
    // §5.1 : les pierres tombales d'une pose et d'une plage d'heures, sans EXPIRE non plus.
    clearedPlacements: `${prefix}cleared:placements`,
    clearedRanges: `${prefix}cleared:ranges`, // `userId` → `[[from, to], …]`
    reported: `${prefix}reported`, // pose → heure du premier signalement, jusqu'à la décision d'un modérateur
    offStream: `${prefix}offstream`, // les poses cachées du stream, jusqu'au retrait ou à Rétablir
    approved: `${prefix}approved`, // les poses rétablies : elles ne se signalent plus
    clearingPrefix,
    reportsPrefix,
    bans: `${prefix}bans`,
    bansTwitch: `${prefix}bans:twitch`, // §5.1 : les bans venus de Twitch
    mods: `${prefix}mods`,
    // §5.1 : l'origine des modérateurs ; `mods` en est l'union, tenue par moderators.lua.
    modsTwitch: `${prefix}mods:twitch`,
    modsLiveplace: `${prefix}mods:liveplace`,
    twitchUsers: `${prefix}twitch:users`, // `userId` → `{login, displayName}`, pour qui n'a pas de miroir `user:`
    live: `${prefix}live`, // canal PUB/SUB, éphémère
    histPrefix,
    cellsPrefix,
    hist: (cellKey: CellKey) => `${histPrefix}${cellKey}`,
    cells: (userId: string) => `${cellsPrefix}${userId}`, // vidé par clearUser
    // §5.4 : vidé par la dernière tranche ; une coupure le garde jusqu'au clearUser suivant.
    clearing: (userId: string) => `${clearingPrefix}${userId}`,
    reports: (placementKey: string) => `${reportsPrefix}${placementKey}`, // qui a signalé cette pose
    // §5.1 : la preuve d'un ban, `cellKey` → `colorIndex`. Écrite par ban, supprimée par unban.
    ban: (userId: string) => `${prefix}ban:${userId}`,
    // §5.4 : ce qu'un retrait vient de lui ôter, `cellKey` → `colorIndex`, pour la preuve d'un ban.
    recentlyCleared: (userId: string) => `${prefix}cleared:recent:${userId}`,
    gauge: (userId: string) => `${prefix}gauge:${userId}`,
    // §5.1 : sans EXPIRE, contrairement à la jauge : une progression ne se perd pas.
    progress: (userId: string) => `${prefix}progress:${userId}`,
    // §5.1 : le classement, un ZSET `userId` → score, à part de `progress` que le reste copie. Sans EXPIRE non plus.
    scoreboard: `${prefix}scoreboard`,
    scoreboardBanned: `${prefix}scoreboard:banned`, // `userId` → score, mis à l'écart par ban, rendu par unban
    req: (userId: string, requestId: string) => `${prefix}req:${userId}:${requestId}`,
  };
}

// Sans EXPIRE : `inspect` perdrait le nom d'un auteur inactif.
export function userKey(userId: string): string {
  return `user:${userId}`;
}

// Écart §4 (JOURNAL 2026-10-07) : le live Twitch d'un compte, un HASH `checkedAt` et, en live seulement, `category`.
// Sans EXPIRE : « hors live » est un état connu, et le web revérifie celui qui date.
export function twitchLiveKey(userId: string): string {
  return `twitch:live:${userId}`;
}

// Écart §15 (JOURNAL 2026-10-06) : le verrou d'un propriétaire, pris par le web le temps d'un changement de canvas actif.
// Il expire de lui-même : un web tombé en plein changement ne bloque personne plus de 30 s.
export const OWNER_LOCK_TTL_MS = 30_000;

export function ownerLockKey(ownerId: string): string {
  return `lock:owner:${ownerId}`;
}

// Écart §5.1 (JOURNAL 2026-10-06) : l'activité, des nombres seulement. Un autre préfixe isole les clés d'un test.
export const ACTIVITY_MINUTES_RETENTION_MS = 7 * 24 * 3600 * 1000;
export const ACTIVITY_HOURS_RETENTION_MS = 366 * 24 * 3600 * 1000;
// Écart §5.1 (JOURNAL 2026-10-07) : les minutes d'un canvas ne servent qu'aux 24 h ; ses heures vivent comme celles du global.
export const ACTIVITY_CANVAS_MINUTES_RETENTION_MS = 2 * 24 * 3600 * 1000;
// Écart §5.1 (JOURNAL 2026-10-08) : un canvas vu streamé il y a plus de 10 minutes, le double de la tolérance, ne comble plus rien.
export const ACTIVITY_SEEN_RETENTION_MS = 10 * 60 * 1000;
export const CANVAS_PIXELS_TTL_SECONDS = 61 * 60; // la température relit les 59 minutes d'avant la minute en cours
export const SIGNUPS_TTL_SECONDS = 31 * 24 * 3600; // les 30 jours des nouveaux comptes venus de la page d'un streamer
export const WITHOUT_DISCOVERED_VIA = "none"; // un nouveau compte venu de l'accueil (§8.1)
// Écart §5.1 (JOURNAL 2026-10-07) : un jour de plus que les 30 de l'audience, pour que le jour qui sort s'y compte encore.
export const ACTIVE_TTL_SECONDS = 31 * 24 * 3600;

// Les nouveaux comptes d'un point, à côté de lui dans le même HASH : le web les compte sans script.
export function toSignupsField(pointAt: number): string {
  return `${pointAt}:signups`;
}

// Les comptes, joueurs et streamers distincts d'un jour, `accounts,players,streamers`, à côté de son point : sans eux,
// la courbe « Tout » les perdrait avec les HyperLogLog.
export function toActiveField(dayAt: number): string {
  return `${dayAt}:active`;
}

// Écart §5.1 (JOURNAL 2026-10-07) : la capacité, des nombres seulement, sous `capacity:`, avec la pyramide de l'activité.
export const CAPACITY_MINUTES_RETENTION_MS = ACTIVITY_MINUTES_RETENTION_MS;
export const CAPACITY_HOURS_RETENTION_MS = ACTIVITY_HOURS_RETENTION_MS;

export function buildCapacityKeys(prefix = "capacity:") {
  return {
    // `HASH` début du point → `saturation,resource,redis,gateway,web,machine,convex` (capacity.lua) : la saturation, la
    // position de la ressource qui la portait dans `CAPACITY_RESOURCE_IDS` (-1 : aucune), et le taux de chaque maillon (-1 : sans mesure).
    minutes: `${prefix}minute`, // élagué au-delà de 7 jours
    hours: `${prefix}hour`, // élagué au-delà de 366 jours
    days: `${prefix}day`, // le début du jour de Paris, sans limite
    // Déposé par le web : `STRING` `at,utilization`, son occupation à l'instant de sa mesure.
    web: `${prefix}web`,
    // Déposé par le web : `HASH` nom du déploiement → `at,calls,databaseIoGb,egressGb,computeGbHours[,filesBytes]`, l'usage du
    // mois et le stock de fichiers (absent tant que le déploiement ne le dit pas : JOURNAL 2026-10-08).
    convex: `${prefix}convex`,
    // Déposé par le worker (JOURNAL 2026-10-08) : `STRING` `at,delayMs`, le retard de la sauvegarde à l'instant de sa mesure.
    snapshot: `${prefix}snapshot`,
    convexUnconfigured: `${prefix}convex:unconfigured`, // posé quand aucun déploiement n'est configuré
    reached: `${prefix}reached`, // `HASH` ressource → instant du dernier plafond atteint, sans EXPIRE : il survit au redémarrage
  };
}

export function buildActivityKeys(prefix = "activity:") {
  return {
    // `HASH` début du point → `people,streamed,pixels,visits,phoneVisits,visitMinutes,live` (activity.lua ; un point d'avant
    // l'audience en a trois, un point d'avant le live six ; `streamed` et `live` y portent le même état streamé depuis
    // JOURNAL 2026-10-08), `toSignupsField` → nouveaux comptes, et pour les jours `toActiveField` → distincts.
    minutes: `${prefix}minute`, // élagué au-delà de 7 jours
    hours: `${prefix}hour`, // élagué au-delà de 366 jours
    days: `${prefix}day`, // le début du jour de Paris, sans limite
    canvasPixels: (minuteAt: number) => `${prefix}pixels:${minuteAt}`, // `canvasId` → pixels de la minute, EXPIRE
    // Écart §5.1 (JOURNAL 2026-10-08) : `HASH` `canvasId` → l'heure où il a été vu streamé, en millisecondes (l'ancien format,
    // `obsSeenAt,liveSeenAt`, se relit par sa dernière heure), versé à la minute et à la fermeture de la dernière vue OBS, relu
    // au démarrage ; élagué au-delà de 10 minutes.
    seen: `${prefix}seen`,
    signups: (parisDay: string) => `${prefix}signups:${parisDay}`, // provenance → nouveaux comptes, EXPIRE
    // Des HyperLogLog, un par jour de Paris, EXPIRE 31 jours : de quoi compter les distincts sans garder qui.
    activeAccounts: (parisDay: string) => `${prefix}accounts:${parisDay}`, // les comptes qui ont ouvert le jeu
    activePlayers: (parisDay: string) => `${prefix}players:${parisDay}`, // les comptes dont une pose a été acceptée
    activeStreamers: (parisDay: string) => `${prefix}streamers:${parisDay}`, // les canvas streamés
    // Écart §5.1 (JOURNAL 2026-10-07) : l'historique d'un canvas, hors de `cv:<canvasId>:` (des nombres d'observation, que le
    // worker ne sauvegarde pas). Les mêmes trois niveaux, écrits seulement pour une minute où il s'y passe quelque chose.
    canvas: (canvasId: string) => ({
      // `HASH` comme ceux du global, `people,obsViews,pixels,visits,phoneVisits,visitMinutes,live` (activity.lua ; `live` y est
      // la somme de ses minutes streamées), `toSignupsField` → nouveaux comptes venus de sa page, et pour les jours
      // `toActiveField` → joueurs actifs.
      minutes: `${prefix}cv:${canvasId}:minute`, // élagué au-delà de 2 jours
      hours: `${prefix}cv:${canvasId}:hour`, // élagué au-delà de 366 jours
      days: `${prefix}cv:${canvasId}:day`, // le début du jour de Paris, sans limite
      // Un HyperLogLog par jour de Paris, EXPIRE 31 jours : les comptes qui y ont posé un pixel.
      activePlayers: (parisDay: string) => `${prefix}cv:${canvasId}:players:${parisDay}`,
    }),
  };
}
