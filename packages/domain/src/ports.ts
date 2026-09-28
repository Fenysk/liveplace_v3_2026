// Ports du système (§3.3). Écart §12.1 (JOURNAL 2026-09-16) : `index.ts` ne l'importe jamais.

import type { ClientFrame, Event, ServerFrame } from "@liveplace/protocol";
import type { Result } from "@liveplace/shared";
import type { CanvasMeta, CanvasSize, ObsBackground, Session, Timestamp, User } from "./index";

// Un lot : `placementId` nomme la pose (le brouillon validé) dont il fait partie (JOURNAL 2026-09-28).
export type Placement = {
  userId: string;
  requestId: string;
  placementId: string;
  nowMs: Timestamp;
  pixels: Extract<ClientFrame, { t: "place" }>["pixels"];
};

export type AckFrame = Extract<ServerFrame, { t: "ack" }>;

export type Pixel = Placement["pixels"][number];

// Écart §4.3 (JOURNAL 2026-09-28) : un pixel visible de l'auteur, avec son heure et sa pose (absentes de la preuve d'un ban).
export type AuthoredPixel = Extract<ServerFrame, { t: "pixels" }>["pixels"][number];

// La pose d'un auteur : `placementId` n'est unique que pour lui (JOURNAL 2026-09-28).
export type PlacementRef = { authorId: string; placementId: string };

// Écart §5.4 (JOURNAL 2026-09-28) : les autres pixels d'un auteur posés entre `from` et `to`, autour d'une pose.
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

// Écart §5.1 (JOURNAL 2026-09-27) : un modérateur et d'où il vient. Sans compte LivePlace, son nom vient de Twitch.
export type Moderator = Extract<ServerFrame, { t: "moderators" }>["users"][number];

// D'où vient le rôle d'un modérateur : de Twitch, d'ici, ou des deux.
export type ModeratorOrigin = NonNullable<InspectEntry["moderatorOrigin"]>;

// Nommer ou retirer un modérateur, pour une origine : l'autre origine peut le garder.
export type ModeratorRole = { userId: string; source: ModerationSource; isModerator: boolean };

// Le nom Twitch de quelqu'un qui n'a pas (encore) de compte LivePlace.
export type TwitchUser = Pick<User, "userId" | "login" | "displayName">;

// Écart §2 (JOURNAL 2026-09-27) : une action venue de Twitch. Le web la dépose, le gateway l'applique avec ses scripts.
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
  | { t: "reports"; count: number } // les signalements en attente, pour qui modère (JOURNAL 2026-09-28)
  | { t: "resize" }; // la taille du canvas a changé : chaque page reprend un snapshot (JOURNAL 2026-09-29)
export type LiveMessage = { e: Event } | { ctl: LiveControl };

export type Unsubscribe = () => Promise<void>;

export interface CanvasCore {
  createCanvas(canvasId: string, meta: CanvasMeta): Promise<void>;
  // Le miroir `user:<userId>` (§5.1), réécrit à chaque connexion : le gateway n'a pas le droit d'aller dans Convex.
  // Écart §5.1 (JOURNAL 2026-09-24) : `avatarUrl` aussi, quand Twitch en donne un.
  setUser(
    user: Pick<User, "userId" | "login" | "displayName"> & Partial<Pick<User, "avatarUrl">>,
  ): Promise<void>;
  getCanvas(canvasId: string): Promise<CanvasMeta | null>; // `null` si absent ou pas prêt (§5.5).
  isModerator(canvasId: string, userId: string): Promise<boolean>;
  getSnapshot(canvasId: string): Promise<Snapshot>; // État et version lus ensemble (§6.1).
  // Écart §5.6 (JOURNAL 2026-09-24) : lue sans être écrite, pour le `welcome`.
  getGauge(canvasId: string, userId: string, nowMs: Timestamp): Promise<AckFrame["gauge"]>;
  place(canvasId: string, placement: Placement): Promise<Result<AckFrame, "canvas_not_found">>;
  inspect(canvasId: string, x: number, y: number): Promise<InspectEntry | null>; // `null` : personne n'a posé ici
  moderate(
    canvasId: string,
    moderation: Moderation,
  ): Promise<Result<ModerationSlice, "canvas_not_found" | "forbidden">>;
  // Écart §5.6 (JOURNAL 2026-09-25) : l'état banni au `hello`, les pixels d'un auteur, et les bannis.
  isBanned(canvasId: string, userId: string): Promise<boolean>;
  listPixels(canvasId: string, userId: string): Promise<AuthoredPixel[]>; // un banni : sa preuve (§5.1)
  listBans(canvasId: string): Promise<BannedUser[]>;
  // Écart §5.4 (JOURNAL 2026-09-28) : `changed`, la case ne montre plus cette pose ; `forbidden`, elle ne se signale pas.
  report(
    canvasId: string,
    report: Report,
  ): Promise<Result<void, "canvas_not_found" | "changed" | "forbidden">>;
  canReport(canvasId: string, placement: PlacementRef, reporterId: string): Promise<boolean>; // ni signalée par lui, ni rétablie, ni lui banni
  listReports(canvasId: string): Promise<ReportedPlacement[]>; // du plus ancien signalement au plus récent
  // Écart §4.3 (JOURNAL 2026-09-29) : les pixels de l'auteur de la pose en (x, y). `null` : la case a changé.
  listAuthorPixels(
    canvasId: string,
    x: number,
    y: number,
    placementId: string,
  ): Promise<AuthoredPixel[] | null>;
  getReportCount(canvasId: string): Promise<number>;
  listOffStreamCells(canvasId: string): Promise<OffStreamCell[]>; // le snapshot d'une vue OBS qui arrive (§9.5)
  // Écart §5.3 (JOURNAL 2026-09-29) : le streamer seul. Publie le `ctl` `resize`.
  resizeCanvas(
    canvasId: string,
    resize: CanvasSize & { by: string },
  ): Promise<Result<void, "canvas_not_found" | "forbidden">>;
  // Le resync (§4.5) : les événements depuis `fromVersion`, ou `null` si le stream ne les a plus ou s'ils dépassent `maxCount`.
  listEvents(canvasId: string, fromVersion: number, maxCount: number): Promise<Event[] | null>;
  // Le `recent` de la vue OBS (§9.5) : les événements depuis `sinceMs`, du plus ancien au plus récent, 2000 au plus.
  listRecentEvents(canvasId: string, sinceMs: Timestamp): Promise<Event[]>;
  // Écart CDC v3 §1 (JOURNAL 2026-09-25) : `meta` et le `ctl` ensemble, sans version.
  setObsDelay(canvasId: string, obsDelayMs: number): Promise<void>;
  setObsBackground(canvasId: string, obsBackground: ObsBackground): Promise<void>; // JOURNAL 2026-09-29, comme le délai
  // Écart §5.1 (JOURNAL 2026-09-27) : sans version non plus, ce n'est pas un pixel. Publie le `ctl` `role`.
  setModerator(
    canvasId: string,
    change: ModeratorRole,
  ): Promise<Result<void, "canvas_not_found" | "forbidden">>;
  listModerators(canvasId: string): Promise<Moderator[]>;
  getTwitchSync(canvasId: string): Promise<TwitchSync | null>; // `null` : jamais synchronisé
  // `null` : pas modérateur. Pour la pill Inspection du streamer (JOURNAL 2026-09-27).
  getModeratorOrigin(canvasId: string, userId: string): Promise<ModeratorOrigin | null>;
  subscribe(canvasId: string, onMessage: (message: LiveMessage) => void): Promise<Unsubscribe>;
}

// Ce que le web écrit dans Redis à la connexion (§2) : jamais un pixel, donc jamais de script.
export type SignInWrites = Pick<CanvasCore, "createCanvas" | "setUser">;

// Un canvas vu de son propriétaire (§8.1) : `canvasId` est opaque (D-14).
export type OwnedCanvas = { canvasId: string; width: number; height: number };

// Ce que Twitch rend à la connexion : l'utilisateur, et son e-mail quand il en a un (JOURNAL 2026-09-27).
// L'e-mail ne va qu'à Convex : ni dans la session, ni dans le miroir `user:`.
export type SignedInUser = User & { email?: string };

// Le stockage durable (§8.2) : des fonctions Convex, toutes gardées par la clé du service.
export interface DurableStore {
  // Écart §8.1 (JOURNAL 2026-09-27) : `discoveredViaUserId` ne s'écrit qu'à la création du compte.
  upsertUserFromTwitch(user: SignedInUser, discoveredViaUserId?: string): Promise<void>;
  getUserByLogin(login: string): Promise<User | null>;
  // Rend le canvas actif s'il existe, sinon crée le candidat : seul le `canvasId` rendu fait foi.
  ensureCanvasForOwner(ownerId: string, candidate: OwnedCanvas): Promise<string>;
  getActiveCanvasForOwner(ownerId: string): Promise<OwnedCanvas | null>;
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

// Écart §2 (JOURNAL 2026-09-27) : un message de Twitch tel qu'il arrive sur `/twitch/eventsub`.
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

// Écart §10.1 (JOURNAL 2026-09-27) : les abonnements EventSub d'une chaîne, pris avec le jeton de l'application.
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
