// Ports du système (§3.3). Écart §12.1 (JOURNAL 2026-09-16) : `index.ts` ne l'importe jamais.

import type { ClientFrame, Event, ServerFrame } from "@liveplace/protocol";
import type { Result } from "@liveplace/shared";
import type { CanvasMeta, Session, Timestamp, User } from "./index";

export type Placement = {
  userId: string;
  requestId: string;
  nowMs: Timestamp;
  pixels: Extract<ClientFrame, { t: "place" }>["pixels"];
};

export type AckFrame = Extract<ServerFrame, { t: "ack" }>;

export type Pixel = Placement["pixels"][number];

// Une action de modération (§5.4), et la tranche demandée : `first` pose la pierre tombale, `next` continue.
export type Moderation = {
  by: string;
  nowMs: Timestamp;
  action: Extract<ClientFrame, { t: "moderate" }>["action"];
  slice: "first" | "next";
};

// Une tranche faite : sa version, les cases dont le pixel visible a changé, et s'il en reste.
export type ModerationSlice = { version: number; cells: number; isDone: boolean };

export type BannedUser = Extract<ServerFrame, { t: "bans" }>["users"][number];

// L'auteur du pixel visible d'une case (§4.3).
export type InspectEntry = NonNullable<Extract<ServerFrame, { t: "inspected" }>["entry"]>;

export type Snapshot = { state: Uint8Array; version: number };

// Canal `cv:<id>:live` : les événements, et les messages de contrôle de moderate.lua (§5.4).
// Un ban pour les sockets d'une personne, ou le délai OBS pour toutes celles du canvas (JOURNAL 2026-09-25).
export type LiveControl =
  | { t: "banned" | "unbanned"; userId: string }
  | { t: "obsDelay"; obsDelayMs: number };
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
  listPixels(canvasId: string, userId: string): Promise<Pixel[]>; // un banni : sa preuve (§5.1)
  listBans(canvasId: string): Promise<BannedUser[]>;
  // Le resync (§4.5) : les événements depuis `fromVersion`, ou `null` si le stream ne les a plus ou s'ils dépassent `maxCount`.
  listEvents(canvasId: string, fromVersion: number, maxCount: number): Promise<Event[] | null>;
  // Le `recent` de la vue OBS (§9.5) : les événements depuis `sinceMs`, du plus ancien au plus récent, 2000 au plus.
  listRecentEvents(canvasId: string, sinceMs: Timestamp): Promise<Event[]>;
  // Écart CDC v3 §1 (JOURNAL 2026-09-25) : `meta` et le `ctl` ensemble, sans version.
  setObsDelay(canvasId: string, obsDelayMs: number): Promise<void>;
  subscribe(canvasId: string, onMessage: (message: LiveMessage) => void): Promise<Unsubscribe>;
}

// Ce que le web écrit dans Redis à la connexion (§2) : jamais un pixel, donc jamais de script.
export type SignInWrites = Pick<CanvasCore, "createCanvas" | "setUser">;

// Un canvas vu de son propriétaire (§8.1) : `canvasId` est opaque (D-14).
export type OwnedCanvas = { canvasId: string; width: number; height: number };

// Le stockage durable (§8.2) : des fonctions Convex, toutes gardées par la clé du service.
export interface DurableStore {
  upsertUserFromTwitch(user: User): Promise<void>;
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

// Twitch (§10.1) : le token ne sort jamais de l'adaptateur, il n'est ni gardé ni logué.
export interface TwitchAuth {
  authorizeUrl(state: string): string;
  getUserFromCode(code: string): Promise<User>;
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
