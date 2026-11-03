// Ports du système (§3.3). §12.1 : `index.ts` ne l'importe jamais.

import type { ClientFrame, Event, ServerFrame } from "@liveplace/protocol";
import type { Result } from "@liveplace/shared";
import type { SupportMirror } from "./badges";
import type { CapacityResourceId, GuardMinute, Saturation } from "./capacity";
import type { ChunkEntry, ChunkFile, Recovered } from "./chunk";
import type {
  AccountDeletionTrigger,
  ActivityPeriod,
  CanvasMeta,
  CanvasOrigin,
  CanvasSize,
  CanvasStatus,
  GaugeLimits,
  ObsBackground,
  Session,
  Timestamp,
  User,
} from "./index";
import type { ChunkSize, TierRow } from "./retention";
import type { CanvasSnapshot, SnapshotTier } from "./snapshot";

// Un lot : `placementId` nomme la pose (le brouillon validé) dont il fait partie (JOURNAL 2026-09-28).
// §5.8 : `origin`, le repère des pixels ; le script les traduit vers celui de la fresque. Absent : le même.
export type Placement = {
  userId: string;
  requestId: string;
  placementId: string;
  nowMs: Timestamp;
  origin?: CanvasOrigin;
  pixels: Extract<ClientFrame, { t: "place" }>["pixels"];
};

export type AckFrame = Extract<ServerFrame, { t: "ack" }>;
export type GaugeClaim = { userId: string; requestId: string; nowMs: Timestamp };

export type Pixel = Placement["pixels"][number];

// §4.3 : un pixel visible de l'auteur, avec son heure et sa pose (absentes de la preuve d'un ban).
export type AuthoredPixel = Extract<ServerFrame, { t: "pixels" }>["pixels"][number];

// La pose d'un auteur : `placementId` n'est unique que pour lui (JOURNAL 2026-09-28).
export type PlacementRef = { authorId: string; placementId: string };

// §5.4 : les autres pixels d'un auteur posés entre `from` et `to`, autour d'une pose.
export type PlacementRange = NonNullable<Extract<ClientFrame, { t: "report" }>["range"]>;

// Un signalement de la pose visible en (x, y), et de ses voisines dans `range` (JOURNAL 2026-09-29), avec le seuil
// calculé par le gateway sur les comptes connectés.
export type Report = {
  reporterId: string;
  x: number;
  y: number;
  placementId: string;
  range?: PlacementRange | undefined;
  threshold: number;
  nowMs: Timestamp;
};

export type ReportedPlacement = Extract<ServerFrame, { t: "reports" }>["reports"][number];

// Une case où la vue OBS montre autre chose que la page : une pose cachée du stream y est visible (JOURNAL 2026-09-28).
export type OffStreamCell = { x: number; y: number; colorIndex: number };

// D'où vient une action ou un rôle : LivePlace, ou la chaîne Twitch du streamer (JOURNAL 2026-09-27).
export type ModerationSource = "liveplace" | "twitch";

// Une action de modération (§5.4), et la tranche demandée : `first` pose la pierre tombale, `next` continue.
export type Moderation = {
  by: string;
  nowMs: Timestamp;
  action: Extract<ClientFrame, { t: "moderate" }>["action"];
  slice: "first" | "next";
  source?: ModerationSource; // absente : LivePlace
};

// Une tranche faite : sa version, les cases dont le pixel visible a changé, et s'il en reste.
export type ModerationSlice = { version: number; cells: number; isDone: boolean };

export type BannedUser = Extract<ServerFrame, { t: "bans" }>["users"][number];

// §5.1 : un modérateur et d'où il vient. Sans compte LivePlace, son nom vient de Twitch.
export type Moderator = Extract<ServerFrame, { t: "moderators" }>["users"][number];

// D'où vient le rôle d'un modérateur : de Twitch, d'ici, ou des deux.
export type ModeratorOrigin = NonNullable<InspectEntry["moderatorOrigin"]>;

// Nommer ou retirer un modérateur, pour une origine : l'autre origine peut le garder.
export type ModeratorRole = { userId: string; source: ModerationSource; isModerator: boolean };

// Le nom Twitch de quelqu'un qui n'a pas (encore) de compte LivePlace.
export type TwitchUser = Pick<User, "userId" | "login" | "displayName">;

// §10.4 : le live Twitch en cours d'un compte, avec sa catégorie (vide : sans catégorie).
// Absent : hors live.
export type TwitchLive = NonNullable<Extract<ServerFrame, { t: "twitchLive" }>["twitchLive"]>;

// Ce que le web garde par compte : son live, et l'heure de la dernière vérification chez Twitch.
export type TwitchLiveState = { twitchLive?: TwitchLive; checkedAt: Timestamp };

// §2 : une action venue de Twitch sur un canvas. Le web la dépose, le gateway l'applique avec ses scripts.
export type CanvasTwitchCommand =
  | { kind: "ban" | "unban"; canvasId: string; userId: string }
  | { kind: "moderator"; canvasId: string; userId: string; isModerator: boolean }
  // La liste complète, à la synchro : ce qui manque s'ajoute, ce qui n'y est plus part, l'origine LivePlace reste.
  | { kind: "moderators"; canvasId: string; userIds: string[] }
  | { kind: "bans"; canvasId: string; userIds: string[] };

// §10.4 : le live d'un compte a changé ; le gateway le dit à ses pages. Sans canvas : il vaut
// pour toutes les pages du streamer et pour les connexions de ce compte.
export type TwitchLiveCommand = { kind: "twitchLive"; userId: string; twitchLive?: TwitchLive };

export type TwitchCommand = CanvasTwitchCommand | TwitchLiveCommand;

// L'état de la synchro d'un canvas : faite, ou à refaire parce que le streamer a retiré ses droits chez Twitch.
export type TwitchSync = NonNullable<Extract<ServerFrame, { t: "moderators" }>["twitchSync"]>;

// Ce que le web écrit pour la synchro Twitch : jamais un pixel, donc jamais de script (§2).
export interface TwitchWrites {
  setTwitchUsers(canvasId: string, users: readonly TwitchUser[]): Promise<void>;
  queueTwitchCommands(commands: readonly TwitchCommand[]): Promise<void>;
  setTwitchSync(canvasId: string, sync: TwitchSync): Promise<void>; // dans `meta`
  // §10.1 : Twitch livre « au moins une fois ». `false` : ce message a déjà été reçu ; `release`
  // rend l'identifiant quand l'action a échoué, pour que la redélivrance de Twitch passe.
  reserveTwitchMessage(messageId: string): Promise<boolean>;
  releaseTwitchMessage(messageId: string): Promise<void>;
}

// Ce que le gateway lit : les actions pas encore acquittées d'abord (un arrêt en plein travail), puis les nouvelles.
export interface TwitchCommandQueue {
  listTwitchCommands(blockMs: number): Promise<{ id: string; command: TwitchCommand }[]>;
  ackTwitchCommand(id: string): Promise<void>;
}

// §10.4 : les comptes que LivePlace connaît (le miroir `user:`), que le web suit tous à son démarrage.
export interface AccountList {
  listAccountIds(): Promise<string[]>;
  // CDC §8 : un compte en cours d'effacement, ou effacé et pas revenu. Ce qui le suit (live, abonnements) ne doit rien écrire de plus.
  isDeletedAccount(userId: string): Promise<boolean>;
}

// §10.4 : l'état de live de chaque compte, écrit par le web ; le gateway le lit par `getTwitchLive`.
export interface TwitchLiveStore {
  getTwitchLiveState(userId: string): Promise<TwitchLiveState | null>; // `null` : aucun état connu
  // Avec `announce`, l'action qui le dit au gateway part dans le même bloc. Faux : le compte est supprimé ou en cours de l'être
  // (CDC §8), ni l'état ni l'action n'est écrit.
  setTwitchLiveState(userId: string, state: TwitchLiveState, announce?: TwitchLiveCommand): Promise<boolean>;
}

// §4.3 : une ligne du classement d'un canvas, et la place d'un joueur dans ce classement (JOURNAL 2026-10-06).
export type ScoreboardEntry = Extract<ServerFrame, { t: "scoreboard" }>["top"][number];
export type ScoreboardRank = NonNullable<Extract<ServerFrame, { t: "scoreboard" }>["you"]>;

// L'auteur du pixel visible d'une case (§4.3).
export type InspectEntry = NonNullable<Extract<ServerFrame, { t: "inspected" }>["entry"]>;

export type Snapshot = { state: Uint8Array; version: number };

// Canal `cv:<id>:live` : les événements, et les messages de contrôle de moderate.lua (§5.4).
// Un ban pour les sockets d'une personne, ou le délai OBS pour toutes celles du canvas (JOURNAL 2026-09-25).
export type LiveControl =
  | { t: "banned" | "unbanned"; userId: string }
  | { t: "role"; userId: string } // ses droits de modération ont changé (JOURNAL 2026-09-27)
  | { t: "obsDelay"; obsDelayMs: number }
  | { t: "obsBackground"; obsBackground: ObsBackground } // JOURNAL 2026-09-29
  | ({ t: "gaugeLimits" } & GaugeLimits) // chaque page reçoit sa jauge recalculée (JOURNAL 2026-09-30)
  | { t: "reports"; count: number } // les signalements en attente, pour qui modère (JOURNAL 2026-09-28)
  | { t: "tracesPurged" } // les traces d'un compte supprimé sont parties : classement et listes de qui modère à relire (JOURNAL 2026-11-01)
  | { t: "resize" } // la taille du canvas a changé : chaque page reprend un snapshot (JOURNAL 2026-09-29)
  | { t: "canvasStatus"; status: CanvasStatus } // publié par le web : archivé, redevenu actif, supprimé (§17.1)
  | { t: "backgroundImageOpacity"; backgroundImageOpacity: number } // l'opacité de l'image du fond (§4.3)
  | { t: "backgroundImage"; at?: Timestamp } // publié par le web : l'image du fond a changé, sans `at` il n'y en a plus (§4.3)
  | { t: "theme"; theme?: string }; // publié par le web : le thème du canvas a changé, sans `theme` il n'en a plus (§4.3)
export type LiveMessage = { e: Event } | { ctl: LiveControl };

export type Unsubscribe = () => Promise<void>;

// §17.1 : pourquoi un script ne sert pas un canvas. Absent ou pas prêt ; ou archivé, et il
// ne reçoit plus aucune écriture : le gateway le dit à la page par l'erreur `canvas_archived`.
export type CanvasRefusal = "canvas_not_found" | "canvas_archived";

export interface CanvasCore {
  createCanvas(canvasId: string, meta: CanvasMeta): Promise<void>;
  // Le miroir `user:<userId>` (§5.1), réécrit à chaque connexion : le gateway n'a pas le droit d'aller dans Convex.
  // §5.1 : `avatarUrl` aussi, quand Twitch en donne un. `support` : le badge Soutien du compte, que le gateway compare à l'heure à
  // chaque affichage (JOURNAL 2026-11-03) ; absent, le miroir garde celui qu'il avait.
  setUser(
    user: Pick<User, "userId" | "login" | "displayName"> & Partial<Pick<User, "avatarUrl">>,
    support?: SupportMirror | null,
  ): Promise<void>;
  getCanvas(canvasId: string): Promise<CanvasMeta | null>; // `null` si absent ou pas prêt (§5.5).
  isModerator(canvasId: string, userId: string): Promise<boolean>; // §10.3 : `false` pour un banni
  // §7.4 : `meta.ready` à 0, le canvas est remis en place. Absent, ou sans `ready` (le canvas neuf
  // d'un archivage), il ne l'est pas : `getCanvas` rend `null` dans les trois cas, seul celui-ci se dit `canvas_recovering`.
  isRecovering(canvasId: string): Promise<boolean>;
  getSnapshot(canvasId: string): Promise<Snapshot>; // État et version lus ensemble (§6.1).
  // §5.6 : lue sans être écrite, pour le `welcome`.
  getGauge(canvasId: string, userId: string, nowMs: Timestamp): Promise<AckFrame["gauge"]>;
  place(canvasId: string, placement: Placement): Promise<Result<AckFrame, CanvasRefusal>>;
  // JOURNAL 2026-09-30 : un +1 de jauge max, idempotent par `requestId` comme la pose.
  claimGauge(canvasId: string, claim: GaugeClaim): Promise<Result<AckFrame, CanvasRefusal>>;
  inspect(canvasId: string, x: number, y: number): Promise<InspectEntry | null>; // `null` : personne n'a posé ici
  moderate(
    canvasId: string,
    moderation: Moderation,
  ): Promise<Result<ModerationSlice, CanvasRefusal | "forbidden">>;
  // §5.6 : l'état banni au `hello`, les pixels d'un auteur, et les bannis.
  isBanned(canvasId: string, userId: string): Promise<boolean>;
  listPixels(canvasId: string, userId: string): Promise<AuthoredPixel[]>; // un banni : sa preuve (§5.1)
  listBans(canvasId: string): Promise<BannedUser[]>;
  // §5.4 : `changed`, la case ne montre plus cette pose ; `forbidden`, elle ne se signale pas.
  report(canvasId: string, report: Report): Promise<Result<void, CanvasRefusal | "changed" | "forbidden">>;
  canReport(canvasId: string, placement: PlacementRef, reporterId: string): Promise<boolean>; // ni signalée par lui, ni rétablie, ni lui banni
  listReports(canvasId: string): Promise<ReportedPlacement[]>; // du plus ancien signalement au plus récent
  // §4.3 : les pixels de l'auteur de la pose en (x, y). `null` : la case a changé.
  listAuthorPixels(
    canvasId: string,
    x: number,
    y: number,
    placementId: string,
  ): Promise<AuthoredPixel[] | null>;
  getReportCount(canvasId: string): Promise<number>;
  // JOURNAL 2026-10-06 : le top du classement, sans les bannis, et la place de chacun des joueurs demandés. Un joueur
  // qui n'y figure pas (rien posé, banni) n'a pas de place.
  listScoreboard(canvasId: string): Promise<ScoreboardEntry[]>;
  listScoreboardRanks(canvasId: string, userIds: readonly string[]): Promise<Map<string, ScoreboardRank>>;
  listOffStreamCells(canvasId: string): Promise<OffStreamCell[]>; // le snapshot d'une vue OBS qui arrive (§9.5)
  // §5.3 : le streamer seul. Publie le `ctl` `resize`. §5.8 : `busy`, des poses ont couru pendant
  // chaque essai du plan, qui n'a pas pu s'appliquer ; rien n'a bougé.
  resizeCanvas(
    canvasId: string,
    resize: CanvasSize & { by: string },
  ): Promise<Result<void, CanvasRefusal | "forbidden" | "busy">>;
  // §5.8 : le streamer seul. Activée, la fresque se resserre sur ses dessins ; publie le `ctl` `resize`
  // quand quelque chose a changé. `forbidden` aussi pour `resizeCanvas` tant que le réglage est actif.
  setDynamicSize(
    canvasId: string,
    change: { by: string; isDynamicSize: boolean },
  ): Promise<Result<void, CanvasRefusal | "forbidden" | "busy">>;
  // Le resync (§4.5) : les événements depuis `fromVersion`, ou `null` si le stream ne les a plus ou s'ils dépassent `maxCount`.
  listEvents(canvasId: string, fromVersion: number, maxCount: number): Promise<Event[] | null>;
  // Le `recent` de la vue OBS (§9.5) : les événements depuis `sinceMs`, du plus ancien au plus récent, 2000 au plus.
  listRecentEvents(canvasId: string, sinceMs: Timestamp): Promise<Event[]>;
  // CDC 2026 §1 : `meta` et le `ctl` ensemble, sans version.
  setObsDelay(canvasId: string, obsDelayMs: number): Promise<void>;
  setObsBackground(canvasId: string, obsBackground: ObsBackground): Promise<void>; // JOURNAL 2026-09-29, comme le délai
  setBackgroundImageOpacity(canvasId: string, backgroundImageOpacity: number): Promise<void>; // §9.5, de même
  setGaugeLimits(canvasId: string, limits: GaugeLimits): Promise<void>; // JOURNAL 2026-09-30, comme le délai
  // §5.1 : sans version non plus, ce n'est pas un pixel. Publie le `ctl` `role`.
  setModerator(canvasId: string, change: ModeratorRole): Promise<Result<void, CanvasRefusal | "forbidden">>;
  listModerators(canvasId: string): Promise<Moderator[]>;
  getTwitchSync(canvasId: string): Promise<TwitchSync | null>; // `null` : jamais synchronisé
  getTwitchLive(userId: string): Promise<TwitchLive | null>; // §10.4 ; `null` : hors live, ou inconnu
  // Une seule lecture pour tous ces comptes (l'activité du développeur) : seuls ceux en live ont une entrée.
  listTwitchLives(userIds: readonly string[]): Promise<Map<string, TwitchLive>>;
  // §17.1 : le nom Twitch de ces personnes, d'un canvas à son successeur, là où il manque.
  copyTwitchUsers(fromCanvasId: string, toCanvasId: string, userIds: readonly string[]): Promise<void>;
  // `null` : pas modérateur. Pour la pill Inspection de qui modère (JOURNAL 2026-09-27, §4.3).
  getModeratorOrigin(canvasId: string, userId: string): Promise<ModeratorOrigin | null>;
  subscribe(canvasId: string, onMessage: (message: LiveMessage) => void): Promise<Unsubscribe>;
}

// Ce que le web écrit dans Redis à la connexion (§2) : jamais un pixel, donc jamais de script. Un nouveau compte
// compte aussi dans l'activité (§16.2).
export type SignInWrites = Pick<CanvasCore, "createCanvas" | "setUser"> & SignupWrites;

// §16.1 : le suivi d'activité, tel que le gateway l'envoie au développeur.
export type ActivityFrame = Extract<ServerFrame, { t: "activity" }>;
export type ActivityCanvas = ActivityFrame["canvases"][number];
export type ActivityUser = ActivityCanvas["owner"];
export type ConnectedAccount = ActivityCanvas["accounts"][number];
export type ActivityHistoryFrame = Extract<ServerFrame, { t: "activityHistory" }>;
export type ActivityPoint = ActivityHistoryFrame["points"][number];
// JOURNAL 2026-10-07 : l'audience d'aujourd'hui et des 30 jours, chacune avec ses six nombres.
export type ActivityAudience = ActivityFrame["audience"];
// JOURNAL 2026-10-07 : le canvas de la socket du développeur, son audience (cinq nombres) et ses points.
export type ActivityHere = NonNullable<ActivityFrame["here"]>;
export type CanvasAudience = ActivityHere["audience"];
export type CanvasActivityPoint = NonNullable<ActivityHistoryFrame["canvasPoints"]>[number];
// L'historique d'une période : tout LivePlace, et le canvas de la socket (absent d'un gateway d'avant). `firstDayAt` : le plus
// ancien jour gardé (JOURNAL 2026-10-14).
export type ActivityHistory = Pick<ActivityHistoryFrame, "points" | "canvasPoints" | "firstDayAt">;

// JOURNAL 2026-10-14 : un jour passé tel que le gateway le rend, la frame `activityDay` sans sa requête.
export type ActivityDayFrame = Extract<ServerFrame, { t: "activityDay" }>;
export type ActivityDay = Omit<ActivityDayFrame, "t" | "requestId">;
export type ActivityDayCanvas = ActivityDay["canvases"][number];
export type ActivityDayHere = ActivityDay["here"];
export type CanvasDayPoint = ActivityDayCanvas["point"];
// Ce que le magasin lit pour un jour : sans les streamers, que le gateway ajoute.
export type ActivityDayRead = Pick<ActivityDay, "grain" | "day" | "points">;
export type CanvasDayRead = Pick<ActivityDayHere, "grain" | "point" | "points">;
export type DayCanvasPoint = Pick<ActivityDayCanvas, "canvasId" | "point">;

// Les identifiants que la minute a vus : de quoi compter les distincts d'un jour, jamais gardés tels quels.
export type ActiveIds = {
  accountIds: ReadonlySet<string>; // les comptes qui ont ouvert le jeu
  playerIds: ReadonlySet<string>; // les comptes dont une pose a été acceptée
  streamedCanvasIds: ReadonlySet<string>; // les canvas streamés : une vue OBS ouverte et le streamer en live (JOURNAL 2026-10-08)
};

// Ce qu'un canvas a vécu dans une minute (JOURNAL 2026-10-07 et 2026-10-08) : le pic de ses personnes, celui de ses vues OBS
// (un détail), 1 s'il a été streamé, ses pixels, ses visites dont celles au téléphone, son temps passé, et les comptes qui
// y ont posé un pixel. Les nouveaux comptes viennent du web, pas du gateway.
export type CanvasMinute = Pick<CanvasActivityPoint, "people" | "pixels" | "visits" | "visitMinutes"> & {
  obsViews: number;
  streamedMinutes: number;
  phoneVisits: number;
  playerIds: ReadonlySet<string>;
};

// La minute écoulée, vue du gateway : le pic des personnes et des canvas streamés, ses pixels, ses visites et son temps passé,
// les pixels de chaque canvas, et la minute de chacun de ceux où il s'est passé quelque chose. Les distincts ne se gardent
// que par jour : la minute n'apporte que ses identifiants.
export type ActivityMinute = Omit<
  ActivityPoint,
  "signups" | "activeAccounts" | "activePlayers" | "activeStreamers"
> &
  ActiveIds & {
    pixelsByCanvas: ReadonlyMap<string, number>;
    canvases: ReadonlyMap<string, CanvasMinute>;
  };

// Les pixels d'une minute passée, canvas par canvas : la température survit à un redémarrage.
export type CanvasPixelsMinute = Pick<ActivityMinute, "at" | "pixelsByCanvas">;

// §16.2 : les minutes d'une coupure de moins de `STREAM_GRACE_MS` (`toGapMinutes`), à compter
// comme streamées pour ce canvas : sa vue OBS, ou son live, est revenu.
export type ActivityGap = { canvasId: string; minutes: readonly Timestamp[] };

// Un nouveau compte, à sa première connexion, le streamer depuis la page duquel il s'est connecté (§8.1), et le canvas actif
// de ce streamer à cet instant : c'est dans ses points que le compte se compte (JOURNAL 2026-10-07).
export type Signup = {
  nowMs: Timestamp;
  discoveredViaUserId?: string | undefined;
  discoveredViaCanvasId?: string | undefined;
};

// Les nouveaux comptes d'un jour de Paris : tous, et ceux venus de la page de chaque streamer.
export type DaySignups = { total: number; byDiscoveredViaUserId: ReadonlyMap<string, number> };

// §16.2 : des nombres sous `activity:`, jamais un nom. Le gateway écrit chaque minute, élague,
// et lit ce que le développeur regarde.
export interface ActivityStore {
  storeActivityMinute(minute: ActivityMinute): Promise<void>;
  // Les minutes de plus de 7 jours, les heures de plus de 366 ; pour chaque canvas de `canvasIds`, ses minutes de plus de
  // 2 jours et ses heures de plus de 366.
  pruneActivity(nowMs: Timestamp, canvasIds?: Iterable<string>): Promise<void>;
  listActivityHistory(period: ActivityPeriod, nowMs: Timestamp): Promise<ActivityPoint[]>; // un point absent le reste
  listCanvasPixels(fromMs: Timestamp, toMs: Timestamp): Promise<CanvasPixelsMinute[]>; // les minutes de [from, to), alignés
  getDaySignups(nowMs: Timestamp): Promise<DaySignups>;
  // L'audience du jour et des 30 jours : les sommes des minutes écrites, les distincts avec `opened`, ce que la minute en
  // cours a déjà vu, versé à ce moment (sans effet pour qui est déjà compté).
  getAudience(nowMs: Timestamp, opened: ActiveIds): Promise<ActivityAudience>;
  // JOURNAL 2026-10-07 : les points d'un canvas, seulement ceux qui existent ; un point absent vaut zéro pour qui les lit.
  listCanvasHistory(
    canvasId: string,
    period: ActivityPeriod,
    nowMs: Timestamp,
  ): Promise<CanvasActivityPoint[]>;
  // L'audience d'un canvas, du jour et des 30 jours, comme `getAudience` : `openedPlayerIds`, les joueurs de la minute en cours.
  getCanvasAudience(
    canvasId: string,
    nowMs: Timestamp,
    openedPlayerIds: ReadonlySet<string>,
  ): Promise<CanvasAudience>;
  getUser(userId: string): Promise<ActivityUser | null>; // le miroir `user:` du streamer d'un canvas
  // JOURNAL 2026-10-14 : un jour passé, lu dans ce qui est déjà gardé, rien de plus. `dayAt` : le début d'un jour de Paris.
  // Le plus ancien jour gardé, le premier point de `activity:day` ; `null` : aucun.
  getFirstDayAt(): Promise<Timestamp | null>;
  // Le point du jour de tout LivePlace, avec son audience, et ses courbes : à la minute si tout le jour est dans la rétention
  // des minutes, sinon à l'heure, sinon aucune. Un point absent le reste.
  listActivityDay(dayAt: Timestamp, nowMs: Timestamp): Promise<ActivityDayRead>;
  // Le point du jour d'un canvas et ses courbes, avec la rétention (plus courte) de ses minutes ; seuls les points qui existent.
  listCanvasDay(canvasId: string, dayAt: Timestamp, nowMs: Timestamp): Promise<CanvasDayRead>;
  // Les canvas qui ont un point ce jour-là, par un balayage des clés `activity:cv:*:day` : aucun index.
  listDayCanvases(dayAt: Timestamp): Promise<DayCanvasPoint[]>;
  // §16.2 : compte un canvas comme streamé dans les minutes d'une coupure, pour lui seul et pour tout
  // LivePlace là où la minute existe. Atomique, et sans effet pour une minute déjà comptée : on le rejoue sans dégât.
  storeActivityGap(gap: ActivityGap): Promise<void>;
  // Par canvas, l'heure où il a été vu streamé pour la dernière fois.
  storeSeen(seen: ReadonlyMap<string, Timestamp>): Promise<void>; // remplace les heures de ces canvas
  listSeen(): Promise<Map<string, Timestamp>>; // au démarrage du gateway
  pruneSeen(nowMs: Timestamp): Promise<void>; // ce qui a été vu il y a plus de 10 minutes
}

// Le web compte un nouveau compte au callback OAuth : des compteurs seulement, jamais un script (§2).
export interface SignupWrites {
  storeSignup(signup: Signup): Promise<void>;
}

// §4.3 : la capacité, telle que le gateway l'envoie au développeur.
export type CapacityFrame = Extract<ServerFrame, { t: "capacity" }>;
export type CapacityHistoryFrame = Extract<ServerFrame, { t: "capacityHistory" }>;
export type CapacityPoint = CapacityHistoryFrame["points"][number];
export type CapacityHistory = Pick<CapacityHistoryFrame, "points">;

// Ce que Redis dit de lui-même (`INFO`) : sa mémoire face à `maxmemory` (0 : sans limite), le temps de processeur de son fil
// principal en secondes depuis son démarrage, et le nombre d'écritures refusées faute de mémoire (`errorstat_OOM`).
export type RedisUsage = {
  usedMemoryBytes: number;
  maxMemoryBytes: number;
  cpuSeconds: number;
  outOfMemoryRefusals: number;
};

// Ce que le web dépose pour le gateway (§16.3) : son occupation, en pourcentage, à l'instant
// de sa mesure ; et l'usage du mois d'un déploiement Convex, à l'instant de sa lecture (appels, Go, Go-heures).
export type WebMeasure = { at: Timestamp; utilization: number };
export type ConvexUsage = {
  at: Timestamp;
  calls: number;
  databaseIoGb: number;
  egressGb: number;
  computeGbHours: number;
  filesBytes?: number; // §16.3 : le stock de fichiers, absent quand le déploiement ne l'a pas dit
};

// Ce que le worker dépose pour la capacité (§16.3) : le retard de la sauvegarde, à l'instant de sa mesure.
export type SnapshotMeasure = { at: Timestamp; delayMs: number };

// Un déploiement dont le web lit l'usage (§16.3) : son nom, l'URL de son API et la clé de
// déploiement qui l'ouvre. La clé ne sort jamais de l'adaptateur : ni dans un journal, ni dans Redis, ni dans une frame.
export type ConvexDeployment = { name: string; url: string; key: string };

// L'usage du mois d'un déploiement, par l'API de déploiement de Convex (en bêta). Une forme inconnue ou un refus ne plante rien :
// le résultat dit en quelques mots pourquoi, sans jamais nommer la clé.
export interface ConvexUsageSource {
  name: string;
  getUsage(): Promise<Result<Omit<ConvexUsage, "at" | "filesBytes">>>;
  // Le stock de fichiers du déploiement, en octets, par un compteur que Convex tient lui-même (usage.ts) : l'API de
  // déploiement ne le donne pas. Un échec ne retient pas le reste de l'usage ; un compteur pas encore recompté en est un.
  getFilesBytes(): Promise<Result<number>>;
}

// Ce que le web a déposé pour Convex : rien (`null`), qu'aucun déploiement n'est configuré, ou l'usage de chacun par son nom ;
// un déploiement que le web n'a jamais pu lire y figure à l'instant 0.
export type ConvexDeposit =
  | { status: "unconfigured" }
  | { status: "configured"; deployments: ReadonlyMap<string, ConvexUsage> };

// Les pics d'une minute : la saturation, la ressource qui la portait, et le plus haut taux de chaque maillon mesuré.
export type CapacityMinute = { at: Timestamp } & Pick<Saturation, "percent" | "resource" | "linkRatios">;

// §16.3 : des nombres sous `capacity:`. Le gateway lit ce que le web dépose, écrit chaque minute et élague.
export interface CapacityStore {
  getRedisUsage(): Promise<RedisUsage>;
  getWebMeasure(): Promise<WebMeasure | null>; // `null` : le web n'a rien déposé
  getConvexDeposit(): Promise<ConvexDeposit | null>;
  getSnapshotMeasure(): Promise<SnapshotMeasure | null>; // `null` : le worker n'a rien déposé
  // Le plafond atteint le plus récemment, par ressource : il survit à un redémarrage du gateway.
  listCeilingsReached(): Promise<Map<CapacityResourceId, Timestamp>>;
  storeCeilingReached(id: CapacityResourceId, at: Timestamp): Promise<void>;
  storeCapacityMinute(minute: CapacityMinute): Promise<void>;
  pruneCapacity(nowMs: Timestamp): Promise<void>; // les minutes de plus de 7 jours, les heures de plus de 366
  listCapacityHistory(period: ActivityPeriod, nowMs: Timestamp): Promise<CapacityPoint[]>; // un point absent le reste
  // §16.3 : les minutes où une protection a joué. `HSET` : la même minute réécrite se remplace.
  storeGuardMinutes(minutes: readonly GuardMinute[]): Promise<void>;
  listGuardMinutes(nowMs: Timestamp): Promise<GuardMinute[]>; // les dernières 24 h, au démarrage ; une minute sans protection est absente
}

// Ce que le web écrit pour la capacité : des nombres seulement, jamais un script (§2).
export interface CapacityWrites {
  storeWebUtilization(measure: WebMeasure): Promise<void>;
  storeConvexUsage(deployment: string, usage: ConvexUsage): Promise<void>; // `deployment` : son nom, jamais une clé
  // Un déploiement configuré que le web n'a pas pu lire : déposé « vieux de toujours » (instant 0), sans écraser une lecture
  // déjà là. Le gateway le voit, et ne somme pas les seuls autres (§16.3).
  storeConvexUnread(deployment: string): Promise<void>;
  storeConvexUnconfigured(): Promise<void>;
}

// Ce que le worker écrit pour la capacité : un nombre, comme le web.
export interface SnapshotDelayWrites {
  storeSnapshotDelay(measure: SnapshotMeasure): Promise<void>;
}

// JOURNAL 2026-11-03 : ce que `/healthz` demande, une sonde par partie (le web, lui, répond ou non). Vrai : la partie répond.
// Une sonde peut rejeter ou ne jamais répondre (Redis coupé) : le délai est à l'appelant.
export interface HealthProbe {
  redis(): Promise<boolean>;
  gateway(): Promise<boolean>;
  worker(): Promise<boolean>;
}

// Ce que le process mesure de sa machine et de lui-même, par `node:os` et `node:fs` : les chiffres de l'hôte, même
// depuis un conteneur. Un pourcentage se compte depuis le dernier appel : le premier n'en a pas (`null`).
export interface HostProbe {
  getMemory(): { usedBytes: number; totalBytes: number };
  getCpuPercent(): number | null; // tous les cœurs de la machine
  getCoreCount(): number; // ses cœurs : le plafond du processeur
  getDisk(): Promise<{ usedBytes: number; totalBytes: number }>; // le disque du process
  getUtilizationPercent(): number; // la part du temps où la boucle d'événements du process travaille
}

// Le verrou d'un propriétaire, pris pour la durée d'un changement de canvas actif : `holderId` ne se rend qu'à qui l'a pris.
export type OwnerLock = { ownerId: string; holderId: string };

// L'image d'un canvas, pour sa miniature et l'aperçu de son lien : un octet par case, l'index de palette.
export type CanvasImage = { width: number; height: number; state: Uint8Array };

// §17.1 : ce que le web écrit dans Redis pour archiver, rouvrir et supprimer un canvas. Jamais un
// pixel, donc jamais de script (§2). L'ordre des appels est celui de l'usecase : il fait l'opération fiable.
export interface ArchiveWrites extends Pick<CanvasCore, "getCanvas"> {
  // Un seul changement à la fois par propriétaire (double clic, deux onglets). `null` : un autre est en cours.
  acquireOwnerLock(ownerId: string): Promise<OwnerLock | null>;
  releaseOwnerLock(lock: OwnerLock): Promise<void>;
  // Le canvas qui entre : `meta`, `state` vide et version 0, sans `ready` : personne ne le sert encore.
  prepareCanvas(canvasId: string, meta: CanvasMeta): Promise<void>;
  markReady(canvasId: string): Promise<void>;
  // Un seul `HSET` : dès lors, aucun script n'écrit plus sur ce canvas, et `successorId` dit où suivre.
  markArchived(canvasId: string, archived: { archivedAt: Timestamp; successorId: string }): Promise<void>;
  markActive(canvasId: string): Promise<void>; // retire `archivedAt` et `successorId`
  setSuccessor(canvasId: string, successorId: string | null): Promise<void>; // `null` : plus de successeur
  // Ce que les canvas du streamer partagent, recopié du sortant vers l'entrant en REMPLAÇANT le sien : bannis et leurs
  // preuves, modérateurs, noms Twitch, et dans `meta` le délai, le fond et la synchro Twitch. Le classement de l'entrant
  // reste le sien, mais suit ses nouveaux bannis : un banni en sort, un débanni y revient (règle de moderate.lua).
  copyShared(fromCanvasId: string, toCanvasId: string): Promise<void>;
  // « Garder » : la progression de l'entrant devient celle du sortant, effacée puis recopiée. Jamais `gauge:*`.
  copyProgress(fromCanvasId: string, toCanvasId: string): Promise<void>;
  // Classés sans suite : `reported`, `reports:*` et `offstream` vidés ; `approved` reste.
  settleReports(canvasId: string): Promise<void>;
  publishStatus(canvasId: string, status: CanvasStatus): Promise<void>;
  // §8.1 : la copie du thème dans `meta` (sans `theme`, plus de thème), jamais publiée ; puis
  // le `ctl` `theme`, pour les pages d'un canvas qui reste là. Archiver ou rouvrir n'écrit que la copie : ses pages changent de canvas.
  setTheme(canvasId: string, theme: string | undefined): Promise<void>;
  publishTheme(canvasId: string, theme: string | undefined): Promise<void>;
  // §8.4 : la copie de l'image du fond dans `meta`, puis le `ctl` `backgroundImage` pour les pages du
  // canvas. Le fond et l'opacité ne bougent pas : l'image se pose par-dessus n'importe quel fond.
  setBackgroundImage(canvasId: string, at: Timestamp): Promise<void>;
  clearBackgroundImage(canvasId: string): Promise<void>;
  discardCanvas(canvasId: string): Promise<void>; // toutes les clés `cv:<id>:*`
  getCanvasImage(canvasId: string): Promise<CanvasImage | null>;
}

// Un effacement de compte en cours (CDC §8, Supprimer son compte) : le seul endroit où l'identifiant reste stocké, le temps
// de l'effacement. `canvasIds` : ses fresques, actives et archives, que Convex oublie avant que Redis les ait vidées.
export type PendingDeletion = {
  userId: string;
  runId: string; // tiré au hasard : la preuve s'y rattache sans nommer le compte
  trigger: AccountDeletionTrigger;
  startedAt: Timestamp;
  canvasIds: readonly string[];
};

// L'empreinte de la session d'un compte supprimé (HMAC de son identifiant, jamais l'identifiant) et l'instant de la suppression.
export type DeletedAccountMark = { fingerprint: string; deletedAt: Timestamp };

// Ce que Redis garde d'un compte qu'on supprime (JOURNAL 2026-11-01). Chaque étape est idempotente : la relancer sur un
// compte à moitié effacé finit le travail, et c'est ainsi qu'un effacement interrompu reprend.
export interface AccountPurge {
  getPending(userId: string): Promise<PendingDeletion | null>;
  listPending(): Promise<PendingDeletion[]>;
  // Marque l'effacement en cours, garde l'empreinte de la session et ferme les connexions du compte. Sans effet pour un
  // effacement déjà marqué : il garde son `runId` et son heure.
  begin(deletion: PendingDeletion): Promise<void>;
  // Ses fresques : le statut `discarded` pour les pages ouvertes, puis toutes leurs clés, ses statistiques et son verrou.
  purgeOwnedCanvases(ownerId: string, canvasIds: readonly string[]): Promise<void>;
  // Ses traces sur toutes les autres fresques ; rend combien de fresques en portaient.
  purgeTraces(userId: string): Promise<number>;
  // `user:<userId>`, son live, ses actions Twitch en attente, et son origine dans les nouveaux comptes.
  purgeAccountKeys(userId: string): Promise<void>;
  // Plus rien ne nomme le compte : l'effacement n'est plus en cours. L'ancien contenu sort ensuite de l'AOF.
  finish(userId: string): Promise<void>;
  // `BGREWRITEAOF` après une suppression, repris au démarrage si le serveur s'est arrêté avant. Vrai : rien ne reste à
  // réécrire. Faux : une réécriture déjà en cours a commencé avant nos dernières écritures, il faudra la refaire.
  rewriteAppendOnlyFile(): Promise<boolean>;
  // Les empreintes de session gardées dans Convex ont-elles été remises dans Redis ? Non après une perte totale (JOURNAL 2026-11-02).
  areMarksRestored(): Promise<boolean>;
  // Remet les empreintes avec le temps qui leur reste (`nowMs` moins l'instant de la suppression), sans toucher à celles qui y sont.
  restoreMarks(marks: readonly DeletedAccountMark[], nowMs: Timestamp): Promise<void>;
  // L'empreinte de la session d'un compte, de quoi la garder dans Convex : jamais plus que cela ne quitte le web.
  getFingerprint(userId: string): string;
}

// Les comptes supprimés vus des sessions : un jeton signé avant la suppression vaut un invité.
export interface DeletedAccounts {
  // `issuedAt` : l'instant d'émission du jeton, en secondes (`iat`).
  isSessionRevoked(userId: string, issuedAt: number): Promise<boolean>;
}

// Le gateway apprend qu'un compte est supprimé : il ferme ses connexions et oublie ce qu'il savait de lui.
export type DeletedAccountListener = (userId: string) => void;

// Un canvas vu de son propriétaire (§8.1) : `canvasId` est opaque (D-14).
export type OwnedCanvas = { canvasId: string; width: number; height: number };

// §17.1 : le canvas actif d'un propriétaire. Son code ne vient que d'une archive rouverte ; son
// thème (§8.1) est celui que le streamer lui a donné, ou qu'une archive rouverte a gardé.
export type ActiveCanvas = OwnedCanvas & { createdAt: Timestamp; theme?: string; linkCode?: string };

// Une archive : son lien est `/{login}/archives/{linkCode}`, et rien d'autre ne la désigne aux yeux d'un public.
export type Archive = OwnedCanvas & {
  createdAt: Timestamp;
  archivedAt: Timestamp;
  linkCode: string;
  theme?: string;
};

export type OwnerCanvases = { active: ActiveCanvas | null; archives: Archive[] }; // archives : dans un ordre quelconque

// Ce qu'un code de lien désigne : une archive, ou le canvas actif qui l'a gardé après une réouverture.
export type LinkedCanvas = { status: "active" } | { status: "archived"; archive: Archive };

// Archiver : le sortant (`outgoingId`, l'actif) devient une archive, l'entrant naît actif. `archivedAt` est aussi la
// naissance de l'entrant ; `linkCode` ne sert que si le sortant n'en a pas déjà un ; l'entrant n'a pas de thème, et sans
// `theme` l'archive n'en a pas non plus : celui du sortant, s'il en avait un, ne reste pas.
export type ArchiveInput = {
  ownerId: string;
  outgoingId: string;
  incoming: OwnedCanvas;
  archivedAt: Timestamp;
  linkCode: string;
  theme?: string;
};

// Rouvrir : l'actif (`outgoingId`) devient une archive, `reopenedId` redevient actif, avec son code et son thème.
export type ReopenInput = {
  ownerId: string;
  outgoingId: string;
  reopenedId: string;
  archivedAt: Timestamp;
  linkCode: string;
};

// Ce que Twitch rend à la connexion : l'utilisateur, et son e-mail quand il en a un (JOURNAL 2026-09-27).
// L'e-mail ne va qu'à Convex : ni dans la session, ni dans le miroir `user:`.
export type SignedInUser = User & { email?: string };

// CDC §8 : ce que Convex rend du compte qu'il vient de supprimer, de quoi oublier les caches du web. Jamais l'e-mail.
export type DeletedProfile = { login: string; avatarUrl: string };

// La preuve d'un effacement (RGPD art. 5.2), écrite avec la ligne du compte : sans nom, sans e-mail, sans identifiant.
// `runId` la nomme, tiré au hasard au début de l'effacement ; `ownedCanvases`, les fresques parties avec lui.
export type AccountDeletionProof = {
  runId: string;
  deletedAt: Timestamp;
  trigger: AccountDeletionTrigger;
  ownedCanvases: number;
};

// Le stockage durable (§8.2) : des fonctions Convex, toutes gardées par la clé du service.
export interface DurableStore {
  // §8.1 : `discoveredViaUserId` ne s'écrit qu'à la création du compte. Sans `email`, celui qu'on gardait part : un jeton qui n'a
  // plus le droit de le lire (réduction de portée) ne le garde pas (contrat Twitch VI.F).
  upsertUserFromTwitch(user: SignedInUser, discoveredViaUserId?: string): Promise<void>;
  getUserByLogin(login: string): Promise<User | null>;
  // Rend le canvas actif s'il existe, sinon crée le candidat : seul le `canvasId` rendu fait foi.
  ensureCanvasForOwner(ownerId: string, candidate: OwnedCanvas): Promise<string>;
  // §8.1 : avec son thème, que `/{login}` rend dans la page sans appel de plus.
  getActiveCanvasForOwner(ownerId: string): Promise<(OwnedCanvas & { theme?: string }) | null>;
  // §17.1 : le canvas actif et les archives de ce propriétaire.
  listCanvasesForOwner(ownerId: string): Promise<OwnerCanvases>;
  // Une transaction. Refus : `not_active`, le sortant n'est pas l'actif de ce propriétaire ; `archives_full`, il a déjà
  // MAX_ARCHIVES archives.
  archiveActiveCanvas(archiving: ArchiveInput): Promise<Result<void, "not_active" | "archives_full">>;
  // Une transaction. Refus : `not_active`, ou `not_archive` : ce n'est pas une archive de ce propriétaire.
  reopenArchive(reopening: ReopenInput): Promise<Result<void, "not_active" | "not_archive">>;
  // Le thème du canvas actif seulement : `not_active` si `canvasId` n'est pas l'actif de ce propriétaire. Sans `theme`, le
  // canvas n'en a plus.
  setActiveCanvasTheme(
    ownerId: string,
    canvasId: string,
    theme?: string,
  ): Promise<Result<void, "not_active">>;
  // §8.4 : l'image du fond du canvas actif seulement (`not_active` sinon), remplaçant la précédente, dont le
  // fichier part. `at` : l'instant où Convex l'a rangée, qui date aussi son adresse.
  setActiveCanvasBackgroundImage(
    ownerId: string,
    canvasId: string,
    image: Uint8Array,
  ): Promise<Result<{ at: Timestamp }, "not_active">>;
  clearActiveCanvasBackgroundImage(ownerId: string, canvasId: string): Promise<Result<void, "not_active">>;
  // Les octets de l'image du canvas actif de ce propriétaire, si elle date de `at` ; `null` : plus d'image, ou une autre.
  getActiveCanvasBackgroundImage(ownerId: string, at: Timestamp): Promise<Uint8Array | null>;
  // Jamais le canvas actif, jamais celui d'un autre propriétaire : `not_archive`.
  discardArchive(ownerId: string, canvasId: string): Promise<Result<void, "not_archive">>;
  // `null` : aucun canvas de ce propriétaire n'a ce code. Rendu sans session : le lien suffit à voir une archive.
  getArchiveByLinkCode(ownerId: string, linkCode: string): Promise<LinkedCanvas | null>;
  // CDC §8, Supprimer son compte. Toutes les fresques du propriétaire, l'active comprise (`discardArchive` la refuse) :
  // leurs sauvegardes et leurs fichiers partent en tâche de fond. Rend leurs identifiants, aucun si elles sont déjà parties.
  discardOwnedCanvases(ownerId: string): Promise<string[]>;
  // La ligne du compte, e-mail compris, avec la preuve de son effacement dans la même transaction. `null` : la ligne était déjà partie.
  deleteUser(userId: string, proof: AccountDeletionProof): Promise<DeletedProfile | null>;
  // Les comptes venus de sa page ne le nomment plus (`discoveredViaUserId`).
  detachDiscoveredAccounts(userId: string): Promise<void>;
  // Les sauvegardes du worker : la demande est gardée dans Convex, le worker réécrit les fichiers qui nomment le compte (JOURNAL
  // 2026-11-02). À poser APRÈS la purge de Redis. Sans effet pour un compte déjà demandé.
  requestErasure(userId: string): Promise<void>;
  // Les empreintes de session des comptes supprimés, gardées 31 jours : Redis peut les perdre, Convex non. Idempotent.
  keepDeletedAccount(mark: DeletedAccountMark): Promise<void>;
  // Les empreintes d'au plus 31 jours (`since` : l'instant le plus ancien gardé) ; celles d'avant sont retirées de Convex.
  syncDeletedAccounts(since: Timestamp): Promise<DeletedAccountMark[]>;
}

// Ce qui s'est passé sur un canvas, vu du worker : une pose seule (elle attend le tour de cinq minutes), ou tout le
// reste (modération, réglage, taille : le snapshot suit en moins de 2 s). §7.6. `status` : le
// `canvasStatus` publié par le web, `version` la version de l'événement (JOURNAL 2026-10-08).
export type CanvasActivity = {
  canvasId: string;
  isPlacement: boolean;
  status?: CanvasStatus;
  version?: number;
};

// Ce que le worker lit de Redis pour sauvegarder (§7.2). `getCanvasSnapshot` rend `null` pour un canvas absent, pas prêt,
// ou sans pose ni modération (version 0, sans banni, modérateur ni progression : JOURNAL 2026-10-08).
export interface SnapshotSource {
  // Chaque canvas de Redis, avec les joueurs qui y ont une progression : un balayage, jamais un par canvas.
  listCanvases(): Promise<Map<string, string[]>>;
  // Les joueurs d'un seul canvas, pour celui que le dernier balayage n'a pas vu.
  listPlayers(canvasId: string): Promise<string[]>;
  // Le canvas qui a pris la place de celui-ci en l'archivant (`successorId`), ou `null`.
  getSuccessorId(canvasId: string): Promise<string | null>;
  getVersion(canvasId: string): Promise<number | null>;
  getCanvasSnapshot(
    canvasId: string,
    players: readonly string[],
    takenAt: Timestamp,
  ): Promise<CanvasSnapshot | null>;
  watch(onActivity: (activity: CanvasActivity) => void): Promise<Unsubscribe>;
}

// Ce que le worker lit du flux d'un canvas pour en archiver l'historique (§7.1).
export type HistoryRead = {
  entries: ChunkEntry[]; // dans l'ordre des versions
  resizedAtVersion: number | null; // la version sans événement de la dernière taille, `null` : jamais redimensionné
  // La dernière récupération (`meta.recoveredAt` et `recoveredAtVersion`) : son saut de version n'est pas un trou.
  recovered: Recovered | null;
};

export interface HistorySource {
  getVersion(canvasId: string): Promise<number | null>;
  // La dernière récupération du canvas : ses versions n'ont pas toutes une entrée, le saut ne compte pas parmi celles qui attendent.
  getRecovery(canvasId: string): Promise<{ at: Timestamp; version: number } | null>;
  // Les entrées après `afterVersion` (exclue), `maxCount` au plus : un XRANGE, aucun groupe de consommateurs.
  listHistory(canvasId: string, afterVersion: number, maxCount: number): Promise<HistoryRead>;
  watch(onActivity: (activity: CanvasActivity) => void): Promise<Unsubscribe>;
}

// L'historique d'un seul environnement (`DURABLE_SCOPE`), comme les snapshots.
export interface HistoryStore {
  // Le dernier `toVersion` rangé de chaque canvas : le curseur du worker à son démarrage.
  listChunkCursors(): Promise<{ canvasId: string; version: number }[]>;
  // `overlap` : Convex garde déjà des versions de cet intervalle.
  storeChunk(file: ChunkFile): Promise<"stored" | "overlap">;
}

// Un snapshot rangé dans Convex : ses octets compressés, et ce que l'index en dit (§8.1).
export type SnapshotFile = {
  canvasId: string;
  tier: SnapshotTier;
  version: number;
  takenAt: Timestamp;
  schemaVersion: number;
  bytes: Uint8Array;
  // Les comptes que le fichier nomme (`createAccountsFilter`), pour qu'une suppression ne lise que les fichiers qui le peuvent.
  accountsFilter?: string;
};

// Le stockage des snapshots d'un seul environnement (`DURABLE_SCOPE`) : un autre scope n'y est jamais visible.
export interface SnapshotStore {
  // `refused` : Convex garde déjà un snapshot plus récent de ce canvas.
  storeSnapshot(file: SnapshotFile): Promise<"stored" | "refused">;
  listLatestSnapshots(tier: SnapshotTier): Promise<Pick<SnapshotFile, "canvasId" | "version" | "takenAt">[]>;
  getLatestSnapshot(canvasId: string, tier: SnapshotTier): Promise<SnapshotFile | null>;
}

// §7.3 : la rétention des sauvegardes d'un seul environnement. Une ligne se nomme par son palier
// et sa date ; une promotion lui ajoute une ligne qui partage le fichier de sa source.
export type PromotedTier = Exclude<SnapshotTier, "working">;
export type CanvasTiers = { canvasId: string; rows: TierRow[] };
export type TierFile = { isStateOnly: boolean; bytes: Uint8Array };
export type StateOnlyFile = Pick<TierRow, "version" | "takenAt"> & {
  canvasId: string;
  tier: PromotedTier;
  schemaVersion: number;
  bytes: Uint8Array;
};

export interface RetentionStore {
  // Les paliers de `maxCanvases` canvas à la suite de `afterCanvasId` ("" : depuis le premier) ; `next` : où reprendre, `null` : fini.
  listTiers(
    afterCanvasId: string,
    maxCanvases: number,
  ): Promise<{ canvases: CanvasTiers[]; next: string | null }>;
  // `missing` : la source n'existe plus dans Convex ; `exists` : le palier a déjà sa ligne.
  promote(canvasId: string, from: TierRow, to: PromotedTier): Promise<"promoted" | "exists" | "missing">;
  getFile(canvasId: string, row: TierRow): Promise<TierFile | null>;
  storeStateOnly(file: StateOnlyFile): Promise<"stored" | "exists">; // un fichier neuf, plus petit : le palier tiré d'une sauvegarde complète
  degrade(canvasId: string, row: TierRow, bytes: Uint8Array): Promise<"degraded" | "missing">; // la ligne passe à un fichier en `state` seul
  discard(canvasId: string, row: TierRow): Promise<void>;
}

// §7.3 : le budget de l'historique d'un seul environnement, lu sur les compteurs de Convex.
export interface BudgetStore {
  ensureUsage(): Promise<{ isRecounted: boolean }>; // les compteurs d'un déploiement d'avant la rétention se font une fois
  getHistoryBytes(): Promise<number>; // le total des chunks de ce scope
  listOldestChunks(limit: number): Promise<ChunkSize[]>; // les plus anciens d'abord, canvas confondus
  // Les chunks du canvas avant `beforeVersion` (exclue) et finis avant `floorTs`, `maxChunks` au plus ; `isDone` : le préfixe est parti.
  purgeChunks(
    canvasId: string,
    beforeVersion: number,
    floorTs: Timestamp,
    maxChunks: number,
  ): Promise<{ removed: number; bytes: number; isDone: boolean }>;
}

// Le ménage des fichiers qu'aucune ligne ne désigne (JOURNAL 2026-11-02), pour tout le déploiement.
export interface OrphanStore {
  // Les fichiers à partir de la borne `after`, `maxFiles` au plus, du plus ancien au plus récent : ceux de moins de `graceMs` restent,
  // les autres partent si aucune ligne ne les désigne. `next` : la borne du prochain appel ; `isDone` : plus rien d'assez vieux à voir.
  purgeOrphans(
    after: number,
    graceMs: number,
    maxFiles: number,
  ): Promise<{ next: number; deleted: number; isDone: boolean }>;
}

// Un fichier de Convex qui peut nommer un compte : un snapshot complet ou un chunk. Un fichier que plusieurs lignes partagent
// (une promotion) ne figure qu'une fois.
export type StoredFileKind = "snapshot" | "chunk";
export type StoredFile = { storageId: string; size: number; accountsFilter?: string };

// Le travail du worker pour un compte supprimé (JOURNAL 2026-11-02), tous scopes confondus : le déploiement ne doit plus rien
// garder qui nomme le compte.
export interface ErasureStore {
  // Les comptes dont les fichiers restent à réécrire : leur identifiant est ici, le temps du travail.
  listPendingErasures(): Promise<string[]>;
  completeErasure(userId: string): Promise<void>;
  // Une page de fichiers de ce genre, `next` : où reprendre (`null` : fini). Un snapshot en `state` seul n'y figure pas.
  listFiles(
    kind: StoredFileKind,
    cursor: string | null,
    maxFiles: number,
  ): Promise<{ files: StoredFile[]; next: string | null }>;
  getFile(kind: StoredFileKind, storageId: string): Promise<Uint8Array | null>;
  // Le nouveau fichier remplace l'ancien pour toutes ses lignes, d'un bloc ; l'ancien part ensuite. `missing` : plus aucune ligne
  // ne le désigne, le nouveau fichier part aussi.
  replaceFile(
    kind: StoredFileKind,
    storageId: string,
    bytes: Uint8Array,
    accountsFilter: string,
  ): Promise<"replaced" | "missing">;
  stampFilter(kind: StoredFileKind, storageId: string, accountsFilter: string): Promise<void>;
  // Un fichier illisible ne peut pas être prouvé propre, et personne ne peut le lire : ses lignes et lui partent.
  discardFile(kind: StoredFileKind, storageId: string): Promise<void>;
}

// Le miroir `user:<id>` d'une personne, perdu avec Redis et gardé par la table `users` de Convex.
export type RestoredUser = Pick<User, "userId" | "login" | "displayName"> & Partial<Pick<User, "avatarUrl">>;

// Ce qu'il faut pour remettre un canvas : sa sauvegarde, les noms de ses personnes, sa nouvelle version et l'heure.
export type Restoration = {
  snapshot: CanvasSnapshot;
  users: readonly RestoredUser[];
  version: number;
  at: Timestamp;
};

// Ce que le worker écrit dans Redis pour remettre un canvas perdu (§7.4).
export interface RecoveryTarget {
  // Ceux de ces canvas qui n'ont plus de `version` : perdus. Un pipeline Redis, jamais Convex.
  listLostCanvases(canvasIds: readonly string[]): Promise<string[]>;
  // `meta.ready` à 0 : le canvas est en récupération. `already_live` : il existe, revenu ou neuf, et rien n'y touche.
  beginRestore(canvasId: string): Promise<"begun" | "already_live">;
  cancelRestore(canvasId: string): Promise<void>; // le canvas n'existe plus dans Convex : il n'est plus en récupération
  restore(canvasId: string, restoration: Restoration): Promise<"restored" | "already_live">;
}

// Une sauvegarde parmi les deux dernières d'un canvas : ses octets ne se lisent que si on en a besoin.
export type RecentSnapshot = Pick<SnapshotFile, "version" | "takenAt" | "schemaVersion"> & {
  getBytes(): Promise<Uint8Array>;
};

// Ce que la récupération lit de Convex, pour un seul `DURABLE_SCOPE` : seulement pour un canvas perdu, jamais en boucle.
export interface RecoveryStore {
  hasSnapshot(canvasId: string): Promise<boolean>; // ce scope garde au moins une sauvegarde de ce canvas
  hasCanvas(canvasId: string): Promise<boolean>; // il existe encore dans `canvases` (une archive supprimée, non)
  listRecentSnapshots(canvasId: string): Promise<RecentSnapshot[]>; // du plus récent au plus ancien, au plus deux
  listUsers(userIds: readonly string[]): Promise<RestoredUser[]>; // ceux que Convex connaît
  // Les comptes supprimés dont les fichiers ne sont pas tous réécrits : une sauvegarde lue ici peut encore les nommer.
  listPendingErasures(): Promise<string[]>;
}

// Ce que le web écrit pour qu'une page dise « en récupération » dès son rendu, avant que le worker ait vu la perte.
export interface RecoveryMarks {
  isCanvasLive(canvasId: string): Promise<boolean>;
  markRecovering(canvasId: string): Promise<void>;
}

// `null` = invité (§10.2).
export interface SessionVerifier {
  verify(cookieHeader: string | undefined): Promise<Session | null>;
}

// Le pendant de `SessionVerifier`, côté web : le cookie signé au callback OAuth (§10.2).
export interface SessionSigner {
  sign(session: Session): Promise<string>;
}

// Pourquoi on part chez Twitch : se connecter, ou synchroniser la modération de sa chaîne (JOURNAL 2026-09-27).
export type TwitchPurpose = "signIn" | "sync";

// Un ban Twitch. Un timeout n'est pas définitif : la synchro l'ignore.
export type TwitchBan = TwitchUser & { isPermanent: boolean };

// La chaîne du streamer, lue au retour de Twitch avec le jeton qu'il vient d'accorder.
export type TwitchChannel = { user: SignedInUser; moderators: TwitchUser[]; bans: TwitchBan[] };

// §2 : un message de Twitch tel qu'il arrive sur `/twitch/eventsub`.
export type TwitchWebhookMessage = {
  id: string;
  timestamp: string;
  signature: string;
  type: string;
  body: string;
};

// §10.4 : ce que Twitch dit du live d'une chaîne. `online` : seulement un live, jamais une
// rediffusion. `liveRevoked` : un abonnement de live retiré, qui ne touche pas à la synchro de modération.
export type TwitchLiveEvent =
  | { kind: "online" | "offline" | "liveRevoked"; broadcasterId: string }
  | { kind: "category"; broadcasterId: string; category: string };

// Ce qu'il veut dire, une fois sa signature et son heure vérifiées. `ignored` : un type qu'on ne suit pas.
export type TwitchWebhookEvent =
  | { kind: "verification"; challenge: string }
  | { kind: "revocation"; broadcasterId: string }
  // CDC §8 : la personne a retiré l'accès à LivePlace dans Twitch. Signée comme le reste, avant tout effacement.
  | { kind: "accessRevoked"; userId: string }
  | { kind: "ban"; broadcasterId: string; user: TwitchUser; isPermanent: boolean }
  | { kind: "unban"; broadcasterId: string; user: TwitchUser }
  | { kind: "moderator"; broadcasterId: string; user: TwitchUser; isModerator: boolean }
  | TwitchLiveEvent
  | { kind: "ignored" };

// `null` : pas signé par notre secret, ou plus vieux que 10 minutes. On n'en fait rien.
export interface TwitchWebhook {
  read(message: TwitchWebhookMessage, nowMs: Timestamp): TwitchWebhookEvent | null;
}

// --- Ko-fi (JOURNAL 2026-11-03) : un don arrive par `POST /kofi/webhook`, le badge Soutien en découle ---

// Un paiement que Ko-fi dit reçu et qui compte comme un don. Jamais le message du donateur, ni rien de ce que Ko-fi joint d'autre
// (adresse postale, Discord, adresse de la page). `messageId` : Ko-fi le renvoie tant qu'il n'a pas son 200, c'est la clé du doublon ;
// `transactionId` n'est pas unique, les envois de test de Ko-fi en partagent un seul.
export type KofiDonation = {
  messageId: string;
  transactionId?: string;
  amountCents: number; // tel quel, sans conversion de monnaie
  currency: string;
  donatedAt: Timestamp;
  email?: string; // Convex le met en minuscules ; il ne reste qu'à un don non relié
  kofiName?: string; // le nom Ko-fi, qui suit l'e-mail
};

// `ignored` : un type qui n'est pas un don (une commande, une boutique).
export type KofiWebhookEvent = { kind: "donation"; donation: KofiDonation } | { kind: "ignored" };

// `unconfigured` : pas de jeton posé, rien ne passe ; `unauthorized` : un autre jeton ; `invalid` : un corps illisible.
export type KofiWebhookRefusal = "unconfigured" | "unauthorized" | "invalid";

export interface KofiWebhook {
  read(body: string, nowMs: Timestamp): Result<KofiWebhookEvent, KofiWebhookRefusal>;
}

// `linked` : un seul compte porte l'e-mail du don, qui part avec le nom Ko-fi ; le compte est rendu avec, pour que le web écrive
// tout de suite son miroir. `duplicate` : ce message est déjà reçu ; son compte est rendu s'il était relié (Ko-fi renvoie tant
// qu'il n'a pas son 200, et le renvoi réécrit le miroir).
export type DonationOutcome =
  | { kind: "linked"; user: User }
  | { kind: "unlinked" }
  | { kind: "duplicate"; user?: User };

// Ce que le badge Soutien lit d'un compte : le cumul à vie de tous ses dons, et la date du dernier.
export type SupportSummary = { lifetimeCents: number; lastDonatedAt: Timestamp };

// Un don qui attend un compte, tel que le développeur le voit : jamais le montant. `donationId` est opaque.
export type WaitingDonation = { donationId: string; donatedAt: Timestamp; email?: string; kofiName?: string };

// `unknown_account` : aucun compte ne porte ce pseudo ; `already_linked` : le don a déjà son compte ; `unknown_donation` : plus de don.
export type DonationLinkRefusal = "unknown_account" | "already_linked" | "unknown_donation";

export interface DonationStore {
  recordDonation(donation: KofiDonation): Promise<DonationOutcome>;
  // `null` : aucun don relié à ce compte.
  getSupport(userId: string): Promise<SupportSummary | null>;
  // La date du dernier don de chaque compte relié dont ce dernier don est postérieur à `since` : de quoi compter les titulaires.
  getLastDonationDates(since: Timestamp): Promise<Timestamp[]>;
  // Les plus récents d'abord.
  listWaitingDonations(): Promise<WaitingDonation[]>;
  // Le compte se trouve par son pseudo ; il est rendu pour écrire son miroir. Rien ne change sur un refus.
  linkDonation(donationId: string, login: string): Promise<Result<User, DonationLinkRefusal>>;
}

// §10.1 : les abonnements EventSub d'une chaîne, pris avec le jeton de l'application.
export interface TwitchEventSub {
  subscribeToModeration(broadcasterId: string): Promise<void>;
  subscribeToLive(broadcasterId: string): Promise<void>; // §10.4
  // CDC §8 : l'accès retiré dans Twitch vaut pour toute l'application, non pour une chaîne : un seul abonnement, pris au démarrage.
  subscribeToAccessRevoked(): Promise<void>;
  // CDC §8 : ceux de live et de modération qui nomment ce compte, quels que soient leur adresse et leur état. Un abonnement déjà
  // parti n'est pas une erreur ; une panne de Twitch en est une, que la reprise de l'effacement refait.
  deleteSubscriptions(userId: string): Promise<void>;
}

// §10.4 : ce que Twitch dit d'une chaîne maintenant, avec le jeton de l'application.
export interface TwitchLiveSource {
  getLive(userId: string): Promise<TwitchLive | null>; // `helix/streams` : `null` hors live
  getCategory(userId: string): Promise<string>; // `helix/channels` : la catégorie de la chaîne, vide si elle n'en a pas
}

// Twitch (§10.1) : le token ne sort jamais de l'adaptateur, il n'est ni gardé ni logué.
export interface TwitchAuth {
  authorizeUrl(state: string, purpose: TwitchPurpose): string;
  getUserFromCode(code: string): Promise<SignedInUser>;
  getChannelFromCode(code: string): Promise<TwitchChannel>;
}

// Une connexion vue de la socket : le pendant de `ClientSocket`, pour que l'infra n'importe pas le usecase.
export interface ClientConnection {
  receive(text: string): Promise<void>;
  close(): Promise<void>;
}

// Une socket vue du gateway.
export interface ClientSocket {
  sendFrame(frame: ServerFrame): void;
  sendSnapshot(state: Uint8Array): void;
  close(code: number): void;
}

// Ce que le gateway renvoie au web : les frames JSON, et le snapshot en binaire (§4.3).
export type TransportListeners = {
  onOpen(): void; // à chaque ouverture : la première, puis chaque reprise (§4.5)
  onFrame(frame: ServerFrame): void;
  onSnapshot(state: Uint8Array): void;
  onClose(code: number): void; // à chaque coupure : la reprise suit d'elle-même, sauf après `close()`
};

// Le lien du web vers le gateway, vu du store : `net/` l'implémente, `state/` le reçoit (§9.2).
export interface Transport {
  send(frame: ClientFrame): void; // perdue si la connexion n'est pas ouverte : le store renvoie ce qui compte
  listen(listeners: TransportListeners): void; // ouvre la connexion
  close(): void; // pour de bon : plus de reprise
}
