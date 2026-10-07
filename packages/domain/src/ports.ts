// Ports du système (§3.3). §12.1 : `index.ts` ne l'importe jamais.

import type { ClientFrame, Event, ServerFrame } from "@liveplace/protocol";
import type { Result } from "@liveplace/shared";
import type {
  ActivityPeriod,
  CanvasMeta,
  CanvasSize,
  CanvasStatus,
  GaugeLimits,
  ObsBackground,
  Session,
  Timestamp,
  User,
} from "./index";

// Un lot : `placementId` nomme la pose (le brouillon validé) dont il fait partie (JOURNAL 2026-09-28).
export type Placement = {
  userId: string;
  requestId: string;
  placementId: string;
  nowMs: Timestamp;
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

// §2 : une action venue de Twitch. Le web la dépose, le gateway l'applique avec ses scripts.
export type TwitchCommand =
  | { kind: "ban" | "unban"; canvasId: string; userId: string }
  | { kind: "moderator"; canvasId: string; userId: string; isModerator: boolean }
  // La liste complète, à la synchro : ce qui manque s'ajoute, ce qui n'y est plus part, l'origine LivePlace reste.
  | { kind: "moderators"; canvasId: string; userIds: string[] }
  | { kind: "bans"; canvasId: string; userIds: string[] };

// L'état de la synchro d'un canvas : faite, ou à refaire parce que le streamer a retiré ses droits chez Twitch.
export type TwitchSync = NonNullable<Extract<ServerFrame, { t: "moderators" }>["twitchSync"]>;

// Ce que le web écrit pour la synchro Twitch : jamais un pixel, donc jamais de script (§2).
export interface TwitchWrites {
  setTwitchUsers(canvasId: string, users: readonly TwitchUser[]): Promise<void>;
  queueTwitchCommands(commands: readonly TwitchCommand[]): Promise<void>;
  setTwitchSync(canvasId: string, sync: TwitchSync): Promise<void>; // dans `meta`
}

// Ce que le gateway lit : les actions pas encore acquittées d'abord (un arrêt en plein travail), puis les nouvelles.
export interface TwitchCommandQueue {
  listTwitchCommands(blockMs: number): Promise<{ id: string; command: TwitchCommand }[]>;
  ackTwitchCommand(id: string): Promise<void>;
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
  | { t: "resize" } // la taille du canvas a changé : chaque page reprend un snapshot (JOURNAL 2026-09-29)
  | { t: "canvasStatus"; status: CanvasStatus }; // publié par le web : archivé, redevenu actif, supprimé (Écart §15, JOURNAL 2026-10-06)
export type LiveMessage = { e: Event } | { ctl: LiveControl };

export type Unsubscribe = () => Promise<void>;

// Écart §15 (JOURNAL 2026-10-06) : pourquoi un script ne sert pas un canvas. Absent ou pas prêt ; ou archivé, et il
// ne reçoit plus aucune écriture : le gateway le dit à la page par l'erreur `canvas_archived`.
export type CanvasRefusal = "canvas_not_found" | "canvas_archived";

export interface CanvasCore {
  createCanvas(canvasId: string, meta: CanvasMeta): Promise<void>;
  // Le miroir `user:<userId>` (§5.1), réécrit à chaque connexion : le gateway n'a pas le droit d'aller dans Convex.
  // §5.1 : `avatarUrl` aussi, quand Twitch en donne un.
  setUser(
    user: Pick<User, "userId" | "login" | "displayName"> & Partial<Pick<User, "avatarUrl">>,
  ): Promise<void>;
  getCanvas(canvasId: string): Promise<CanvasMeta | null>; // `null` si absent ou pas prêt (§5.5).
  isModerator(canvasId: string, userId: string): Promise<boolean>;
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
  // §5.3 : le streamer seul. Publie le `ctl` `resize`.
  resizeCanvas(
    canvasId: string,
    resize: CanvasSize & { by: string },
  ): Promise<Result<void, CanvasRefusal | "forbidden">>;
  // Le resync (§4.5) : les événements depuis `fromVersion`, ou `null` si le stream ne les a plus ou s'ils dépassent `maxCount`.
  listEvents(canvasId: string, fromVersion: number, maxCount: number): Promise<Event[] | null>;
  // Le `recent` de la vue OBS (§9.5) : les événements depuis `sinceMs`, du plus ancien au plus récent, 2000 au plus.
  listRecentEvents(canvasId: string, sinceMs: Timestamp): Promise<Event[]>;
  // CDC 2026 §1 : `meta` et le `ctl` ensemble, sans version.
  setObsDelay(canvasId: string, obsDelayMs: number): Promise<void>;
  setObsBackground(canvasId: string, obsBackground: ObsBackground): Promise<void>; // JOURNAL 2026-09-29, comme le délai
  setGaugeLimits(canvasId: string, limits: GaugeLimits): Promise<void>; // JOURNAL 2026-09-30, comme le délai
  // §5.1 : sans version non plus, ce n'est pas un pixel. Publie le `ctl` `role`.
  setModerator(canvasId: string, change: ModeratorRole): Promise<Result<void, CanvasRefusal | "forbidden">>;
  listModerators(canvasId: string): Promise<Moderator[]>;
  getTwitchSync(canvasId: string): Promise<TwitchSync | null>; // `null` : jamais synchronisé
  // Écart §15 (JOURNAL 2026-10-06) : le nom Twitch de ces personnes, d'un canvas à son successeur, là où il manque.
  copyTwitchUsers(fromCanvasId: string, toCanvasId: string, userIds: readonly string[]): Promise<void>;
  // `null` : pas modérateur. Pour la pill Inspection du streamer (JOURNAL 2026-09-27).
  getModeratorOrigin(canvasId: string, userId: string): Promise<ModeratorOrigin | null>;
  subscribe(canvasId: string, onMessage: (message: LiveMessage) => void): Promise<Unsubscribe>;
}

// Ce que le web écrit dans Redis à la connexion (§2) : jamais un pixel, donc jamais de script. Un nouveau compte
// compte aussi dans l'activité (écart §5.1, JOURNAL 2026-10-06).
export type SignInWrites = Pick<CanvasCore, "createCanvas" | "setUser"> & SignupWrites;

// Écart §4.3 (JOURNAL 2026-10-06) : le suivi d'activité, tel que le gateway l'envoie au développeur.
export type ActivityFrame = Extract<ServerFrame, { t: "activity" }>;
export type ActivityCanvas = ActivityFrame["canvases"][number];
export type ActivityUser = ActivityCanvas["owner"];
export type ConnectedAccount = ActivityCanvas["accounts"][number];
export type ActivityPoint = Extract<ServerFrame, { t: "activityHistory" }>["points"][number];

// La minute écoulée, vue du gateway : le pic des personnes et des canvas streamés, ses pixels, et ceux de chaque canvas.
export type ActivityMinute = Omit<ActivityPoint, "signups"> & { pixelsByCanvas: ReadonlyMap<string, number> };

// Les pixels d'une minute passée, canvas par canvas : la température survit à un redémarrage.
export type CanvasPixelsMinute = Pick<ActivityMinute, "at" | "pixelsByCanvas">;

// Un nouveau compte, à sa première connexion, et le streamer depuis la page duquel il s'est connecté (§8.1).
export type Signup = { nowMs: Timestamp; discoveredViaUserId?: string | undefined };

// Les nouveaux comptes d'un jour de Paris : tous, et ceux venus de la page de chaque streamer.
export type DaySignups = { total: number; byDiscoveredViaUserId: ReadonlyMap<string, number> };

// Écart §5.1 (JOURNAL 2026-10-06) : des nombres sous `activity:`, jamais un nom. Le gateway écrit chaque minute, élague,
// et lit ce que le développeur regarde.
export interface ActivityStore {
  storeActivityMinute(minute: ActivityMinute): Promise<void>;
  pruneActivity(nowMs: Timestamp): Promise<void>; // les minutes de plus de 7 jours, les heures de plus de 366
  listActivityHistory(period: ActivityPeriod, nowMs: Timestamp): Promise<ActivityPoint[]>; // un point absent le reste
  listCanvasPixels(fromMs: Timestamp, toMs: Timestamp): Promise<CanvasPixelsMinute[]>; // les minutes de [from, to), alignés
  getDaySignups(nowMs: Timestamp): Promise<DaySignups>;
  getUser(userId: string): Promise<ActivityUser | null>; // le miroir `user:` du streamer d'un canvas
}

// Le web compte un nouveau compte au callback OAuth : des compteurs seulement, jamais un script (§2).
export interface SignupWrites {
  storeSignup(signup: Signup): Promise<void>;
}

// Le verrou d'un propriétaire, pris pour la durée d'un changement de canvas actif : `holderId` ne se rend qu'à qui l'a pris.
export type OwnerLock = { ownerId: string; holderId: string };

// L'image d'un canvas, pour sa miniature : un octet par case, l'index de palette.
export type CanvasImage = { width: number; height: number; state: Uint8Array };

// Écart §15 (JOURNAL 2026-10-06) : ce que le web écrit dans Redis pour archiver, rouvrir et supprimer un canvas. Jamais un
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
  discardCanvas(canvasId: string): Promise<void>; // toutes les clés `cv:<id>:*`
  getCanvasImage(canvasId: string): Promise<CanvasImage | null>;
}

// Un canvas vu de son propriétaire (§8.1) : `canvasId` est opaque (D-14).
export type OwnedCanvas = { canvasId: string; width: number; height: number };

// Écart §15 (JOURNAL 2026-10-06) : le canvas actif d'un propriétaire. Son nom et son code ne viennent que d'une archive rouverte.
export type ActiveCanvas = OwnedCanvas & { createdAt: Timestamp; name?: string; linkCode?: string };

// Une archive : son lien est `/{login}/archives/{linkCode}`, et rien d'autre ne la désigne aux yeux d'un public.
export type Archive = OwnedCanvas & {
  createdAt: Timestamp;
  archivedAt: Timestamp;
  linkCode: string;
  name?: string;
};

export type OwnerCanvases = { active: ActiveCanvas | null; archives: Archive[] }; // archives : dans un ordre quelconque

// Ce qu'un code de lien désigne : une archive, ou le canvas actif qui l'a gardé après une réouverture.
export type LinkedCanvas = { status: "active" } | { status: "archived"; archive: Archive };

// Archiver : le sortant (`outgoingId`, l'actif) devient une archive, l'entrant naît actif. `archivedAt` est aussi la
// naissance de l'entrant ; `linkCode` ne sert que si le sortant n'en a pas déjà un ; sans `name`, l'archive n'en a pas.
export type ArchiveInput = {
  ownerId: string;
  outgoingId: string;
  incoming: OwnedCanvas;
  archivedAt: Timestamp;
  linkCode: string;
  name?: string;
};

// Rouvrir : l'actif (`outgoingId`) devient une archive, `reopenedId` redevient actif, avec son code et son nom.
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

// Le stockage durable (§8.2) : des fonctions Convex, toutes gardées par la clé du service.
export interface DurableStore {
  // §8.1 : `discoveredViaUserId` ne s'écrit qu'à la création du compte.
  upsertUserFromTwitch(user: SignedInUser, discoveredViaUserId?: string): Promise<void>;
  getUserByLogin(login: string): Promise<User | null>;
  // Rend le canvas actif s'il existe, sinon crée le candidat : seul le `canvasId` rendu fait foi.
  ensureCanvasForOwner(ownerId: string, candidate: OwnedCanvas): Promise<string>;
  getActiveCanvasForOwner(ownerId: string): Promise<OwnedCanvas | null>;
  // Écart §15 (JOURNAL 2026-10-06) : le canvas actif et les archives de ce propriétaire.
  listCanvasesForOwner(ownerId: string): Promise<OwnerCanvases>;
  // Une transaction. Refus : `not_active`, le sortant n'est pas l'actif de ce propriétaire ; `archives_full`, il a déjà
  // MAX_ARCHIVES archives.
  archiveActiveCanvas(archiving: ArchiveInput): Promise<Result<void, "not_active" | "archives_full">>;
  // Une transaction. Refus : `not_active`, ou `not_archive` : ce n'est pas une archive de ce propriétaire.
  reopenArchive(reopening: ReopenInput): Promise<Result<void, "not_active" | "not_archive">>;
  // Le nom du canvas actif seulement : `not_active` si `canvasId` n'est pas l'actif de ce propriétaire. Sans `name`, le
  // canvas n'en a plus.
  renameActiveCanvas(ownerId: string, canvasId: string, name?: string): Promise<Result<void, "not_active">>;
  // Jamais le canvas actif, jamais celui d'un autre propriétaire : `not_archive`.
  discardArchive(ownerId: string, canvasId: string): Promise<Result<void, "not_archive">>;
  // `null` : aucun canvas de ce propriétaire n'a ce code. Rendu sans session : le lien suffit à voir une archive.
  getArchiveByLinkCode(ownerId: string, linkCode: string): Promise<LinkedCanvas | null>;
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

// Ce qu'il veut dire, une fois sa signature et son heure vérifiées. `ignored` : un type qu'on ne suit pas.
export type TwitchWebhookEvent =
  | { kind: "verification"; challenge: string }
  | { kind: "revocation"; broadcasterId: string }
  | { kind: "ban"; broadcasterId: string; user: TwitchUser; isPermanent: boolean }
  | { kind: "unban"; broadcasterId: string; user: TwitchUser }
  | { kind: "moderator"; broadcasterId: string; user: TwitchUser; isModerator: boolean }
  | { kind: "ignored" };

// `null` : pas signé par notre secret, ou plus vieux que 10 minutes. On n'en fait rien.
export interface TwitchWebhook {
  read(message: TwitchWebhookMessage, nowMs: Timestamp): TwitchWebhookEvent | null;
}

// §10.1 : les abonnements EventSub d'une chaîne, pris avec le jeton de l'application.
export interface TwitchEventSub {
  subscribeToModeration(broadcasterId: string): Promise<void>;
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
