// Le cycle de vie d'une connexion (§6.1).

import {
  type CanvasMeta,
  type CanvasStatus,
  canModerate,
  type Device,
  PALETTE,
  type Role,
  reportThreshold,
  roleFor,
  type Session,
  type Timestamp,
  toStateOffset,
} from "@liveplace/domain";
import type {
  AckFrame,
  CanvasCore,
  ClientConnection,
  ClientSocket,
  InspectEntry,
  LiveControl,
  Moderation,
  OffStreamCell,
  TwitchLive,
} from "@liveplace/domain/ports";
import {
  type CellsFrame,
  type ClientFrame,
  decodeClientFrame,
  PROTOCOL_VERSION,
  type ServerFrame,
} from "@liveplace/protocol";
import type { Activity, ActivityMember } from "./activity";
import type {
  Broadcast,
  CellsListener,
  ControlListener,
  ControlMessage,
  ScoreboardControl,
  TwitchLiveControl,
} from "./broadcast";
import type { Capacity } from "./capacity";
import { toCellsFrame } from "./cells-frame";
import { type ScoreboardFrame, toScoreboardFrame } from "./scoreboard-frame";

// « policy violation » : la frame est refusée et la connexion fermée.
const CLOSE_POLICY = 1008;
// Au-delà, le snapshot est plus court à transmettre que le rattrapage (§4.5).
const RESYNC_MAX_VERSIONS = 2000;
// §4.3 : un humain n'y arrive jamais, un script ne balaie plus le canvas.
const INSPECT_MAX_PER_SECOND = 10;

type ErrorCode = Extract<ServerFrame, { t: "error" }>["code"];
type HelloFrame = Extract<ClientFrame, { t: "hello" }>;
type PlaceFrame = Extract<ClientFrame, { t: "place" }>;
type InspectFrame = Extract<ClientFrame, { t: "inspect" }>;
type ModerateFrame = Extract<ClientFrame, { t: "moderate" }>;
type ListPixelsFrame = Extract<ClientFrame, { t: "listPixels" }>;
type SetObsDelayFrame = Extract<ClientFrame, { t: "setObsDelay" }>;
type SetObsBackgroundFrame = Extract<ClientFrame, { t: "setObsBackground" }>;
type SetGaugeLimitsFrame = Extract<ClientFrame, { t: "setGaugeLimits" }>;
type SetModeratorFrame = Extract<ClientFrame, { t: "setModerator" }>;
type ReportFrame = Extract<ClientFrame, { t: "report" }>;
type ResizeCanvasFrame = Extract<ClientFrame, { t: "resizeCanvas" }>;
type ListAuthorPixelsFrame = Extract<ClientFrame, { t: "listAuthorPixels" }>;
type ListActivityHistoryFrame = Extract<ClientFrame, { t: "listActivityHistory" }>;
type ListCapacityHistoryFrame = Extract<ClientFrame, { t: "listCapacityHistory" }>;
type WelcomeFrame = Extract<ServerFrame, { t: "welcome" }>;
// Un message de contrôle devenu frame pour cette socket : son ban, le délai OBS du canvas, les signalements en
// attente et les listes périmées pour qui modère, le classement (JOURNAL 2026-09-28, 2026-10-06), le statut du
// canvas (Écart §15, JOURNAL 2026-10-06), ou le live du streamer ou de cette personne (Écart §4, JOURNAL 2026-10-07).
type ControlFrame = Extract<
  ServerFrame,
  {
    t:
      | "banned"
      | "unbanned"
      | "obsDelay"
      | "obsBackground"
      | "gaugeLimits"
      | "reportCount"
      | "staleList"
      | "scoreboard"
      | "canvasStatus"
      | "theme"
      | "twitchLive";
  }
>;

// Écart §4 (JOURNAL 2026-10-07) : le live du streamer du canvas et celui de la personne connectée.
type TwitchLives = { owner: TwitchLive | null; you: TwitchLive | null };

// L'arrivée d'une page : un resync depuis `lastVersion`, ou un snapshot (et son `recent` en vue OBS).
// `version` part dans le `welcome` ; `coveredVersion` est la dernière version déjà envoyée, pour dédupliquer (§6.1).
type Arrival = { version: number; coveredVersion: number } & (
  | { kind: "resync"; cells: CellsFrame | null }
  | { kind: "snapshot"; state: Uint8Array; recent: CellsFrame | null }
);

// `ready` garde la taille du canvas (une case hors bornes n'a pas de cellKey à elle) et le rôle, qui décide (§10.3).
// §10.3 : le rôle se relit en direct, d'où `ownerId`.
// Écart §15 (JOURNAL 2026-10-06) : `isArchived`, plus aucune écriture ; la connexion reste ouverte, pour qu'on y regarde.
type ReadyState = {
  status: "ready";
  canvasId: string;
  mode: HelloFrame["mode"]; // §6.1 : pour reprendre un snapshot à une nouvelle taille
  ownerId: string;
  width: number;
  height: number;
  role: Role;
  isArchived: boolean;
};
// `isRoleStale` : un `ctl` `role` est tombé pendant l'arrivée, le rôle lu au `hello` a pu vieillir.
// `isSizeStale` : un `ctl` `resize` aussi, la taille lue au `hello` a pu changer (JOURNAL 2026-09-29).
type State =
  | { status: "awaitingHello" }
  | {
      status: "joining";
      canvasId: string;
      mode: HelloFrame["mode"];
      ownerId: string; // le live d'un compte ne regarde que lui et ses pages (Écart §4, JOURNAL 2026-10-07)
      role: Role;
      pendingFrames: CellsFrame[];
      pendingControls: ControlFrame[];
      isRoleStale: boolean;
      isSizeStale: boolean;
    }
  | ReadyState;

export type ConnectionDeps = {
  // Tout le noyau, sauf ce qu'écrit le web à la connexion, l'abonnement que tient `broadcast`, et ce que suivent les
  // actions Twitch (`twitch-commands.ts`).
  core: Omit<CanvasCore, "createCanvas" | "setUser" | "subscribe" | "copyTwitchUsers">;
  broadcast: Broadcast;
  activity: Omit<Activity, "tick" | "start">; // écart §4.3 (JOURNAL 2026-10-06) : le gateway décide, et ne dit rien aux autres
  capacity: Pick<Capacity, "watch" | "listHistory">; // écart §4.3 (JOURNAL 2026-10-07) : de même
  now: () => Timestamp;
};

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined; // le décodage juste après en fait une frame invalide
  }
};

const isOtherProtocolVersion = (raw: unknown): boolean =>
  typeof raw === "object" &&
  raw !== null &&
  "t" in raw &&
  raw.t === "hello" &&
  "protocolVersion" in raw &&
  raw.protocolVersion !== PROTOCOL_VERSION;

// §4.3 : la photo Twitch de la session, quand le cookie la porte.
const youOf = ({ userId, login, displayName, avatarUrl }: Session) => ({
  userId,
  login,
  displayName,
  ...(avatarUrl ? { avatarUrl } : {}),
});

const withoutUserId = ({ userId, ...entry }: InspectEntry): InspectEntry => entry;

// Le statut le plus récent l'emporte sur ce que `meta` disait au `hello` ; `discarded` n'y change rien : le canvas part.
const isArchivedAfter = (status: CanvasStatus | undefined, wasArchived: boolean): boolean =>
  status === undefined || status === "discarded" ? wasArchived : status === "archived";

// Un statut tombé pendant l'arrivée est plus récent que le `meta` lu avant elle.
const lastStatusOf = (controls: readonly ControlFrame[]): CanvasStatus | undefined =>
  controls.flatMap((control) => (control.t === "canvasStatus" ? [control.status] : [])).at(-1);

const buildWelcome = (
  canvasId: string,
  meta: CanvasMeta,
  version: number,
  role: Role,
  session: Session | null,
  gauge: AckFrame["gauge"] | null,
  lives: TwitchLives,
): WelcomeFrame => ({
  t: "welcome",
  canvas: {
    canvasId,
    width: meta.width,
    height: meta.height,
    ownerId: meta.ownerId,
    ...(meta.archivedAt === undefined ? {} : { archivedAt: meta.archivedAt }),
    ...(lives.owner ? { ownerTwitchLive: lives.owner } : {}),
  },
  params: {
    gaugeMaxStart: meta.gaugeMaxStart,
    gaugeMaxCeiling: meta.gaugeMaxCeiling,
    refillMs: meta.refillMs,
    refillCharges: meta.refillCharges,
    obsDelayMs: meta.obsDelayMs,
    obsBackground: meta.obsBackground,
    ...(meta.theme === undefined ? {} : { theme: meta.theme }), // Écart §8.1 (JOURNAL 2026-10-07)
  },
  palette: [...PALETTE],
  version,
  you: session ? { ...youOf(session), ...(lives.you ? { twitchLive: lives.you } : {}), role } : { role },
  ...(gauge ? { gauge } : {}),
});

// La page à qui un message de contrôle s'adresse : son rôle, son mode, et le streamer du canvas.
type Page = { role: Role; mode: HelloFrame["mode"]; ownerId: string };

// Écart §4 (JOURNAL 2026-10-07) : le live du streamer de la page ou de cette personne, jamais en vue OBS, qui n'a pas de profil.
const twitchLiveFrameOf = (
  { userId, twitchLive }: TwitchLiveControl,
  session: Session | null,
  { mode, ownerId }: Page,
): ControlFrame | null =>
  mode === "ui" && (userId === ownerId || userId === session?.userId)
    ? { t: "twitchLive", userId, ...(twitchLive ? { twitchLive } : {}) }
    : null;

// Un ban ne regarde que les sockets de la cible (JOURNAL 2026-09-25) ; le délai OBS, toutes celles du canvas ; les
// signalements, celles qui modèrent. Le `ctl` `role` est traité à part : il se relit dans Redis avant de partir.
const controlFrameOf = (
  control: Exclude<LiveControl, { t: "role" | "resize" | "gaugeLimits" }> | TwitchLiveControl,
  session: Session | null,
  page: Page,
): ControlFrame | null => {
  if (control.t === "obsDelay") return { t: "obsDelay", obsDelayMs: control.obsDelayMs };
  if (control.t === "obsBackground") return { t: "obsBackground", obsBackground: control.obsBackground };
  if (control.t === "reports")
    return canModerate(page.role) ? { t: "reportCount", count: control.count } : null;
  if (control.t === "canvasStatus") return { t: "canvasStatus", status: control.status };
  if (control.t === "theme") return { t: "theme", theme: control.theme };
  if (control.t === "twitchLive") return twitchLiveFrameOf(control, session, page);
  return control.userId === session?.userId ? { t: control.t } : null;
};

// §9.5 : une vue OBS arrive sur l'image du stream, jamais sur une pose cachée (piège 1).
const toStreamState = (state: Uint8Array, cells: OffStreamCell[], width: number): Uint8Array => {
  if (cells.length === 0) return state;
  const shown = state.slice();
  for (const { x, y, colorIndex } of cells) shown[toStateOffset(x, y, width)] = colorIndex;
  return shown;
};

// `device` : lu au `User-Agent` du handshake, pour le suivi d'activité (écart §4.3, JOURNAL 2026-10-06).
export function createConnection(
  deps: ConnectionDeps,
  socket: ClientSocket,
  session: Session | null,
  device: Device,
): ClientConnection {
  let state: State = { status: "awaitingHello" };
  let member: ActivityMember | null = null;
  let queue: Promise<void> = Promise.resolve();
  const inspectedAt: Timestamp[] = []; // les dernières inspections acceptées, la plus ancienne en tête

  const listener: CellsListener = (frame) => {
    if (state.status === "joining") state.pendingFrames.push(frame);
    else if (state.status === "ready") socket.sendFrame(frame); // le même objet pour tout le canvas : un seul JSON (ws-server)
  };

  // §10.3 : ses droits ont changé, le rôle se relit et la page l'apprend. Sur une archive, plus personne ne modère.
  const refreshRole = async (): Promise<void> => {
    if (state.status !== "ready" || state.isArchived || !session) return;
    const ready = state;
    const isModerator = await deps.core.isModerator(ready.canvasId, session.userId);
    const role = roleFor(session, ready, isModerator);
    if (state !== ready || role === ready.role) return;
    state = { ...ready, role };
    member?.setRole(role);
    socket.sendFrame({ t: "role", role });
    if (canModerate(role))
      socket.sendFrame({ t: "reportCount", count: await deps.core.getReportCount(ready.canvasId) });
  };

  const onRoleControl = (userId: string): void => {
    if (userId !== session?.userId) return;
    if (state.status === "joining") state.isRoleStale = true;
    else void refreshRole().catch((error: unknown) => console.error("rôle non relu", error));
  };

  // JOURNAL 2026-10-06 : un ban, un déban ou un rôle, de qui que ce soit, périme la liste de qui modère.
  const tellStaleList = (control: Exclude<ControlMessage, ScoreboardControl>): void => {
    if (state.status === "awaitingHello" || !canModerate(state.role)) return;
    if (control.t === "banned" || control.t === "unbanned") deliverControl({ t: "staleList", list: "bans" });
    if (control.t === "role") deliverControl({ t: "staleList", list: "moderators" });
  };

  // Écart §10.3 (JOURNAL 2026-10-08) : un banni ne modère plus, son déban lui rend son rôle ; la frame `banned` part ensuite.
  const rereadRoleOnBan = (control: Exclude<ControlMessage, ScoreboardControl>): void => {
    if (control.t === "banned" || control.t === "unbanned") onRoleControl(control.userId);
  };

  // §10.2 et CDC 2026 §1 : le ban de cette personne, le délai OBS de ce canvas.
  const onControl: ControlListener = (control) => {
    if (control.t === "scoreboard") return onScoreboardControl(control);
    tellStaleList(control);
    rereadRoleOnBan(control);
    if (control.t === "role") return onRoleControl(control.userId);
    if (control.t === "resize") return onResizeControl();
    if (control.t === "gaugeLimits") return onGaugeLimitsControl(control);
    if (state.status === "awaitingHello") return;
    const frame = controlFrameOf(control, session, state);
    if (frame) deliverControl(frame);
  };

  // Écart §15 (JOURNAL 2026-10-06) : le statut du canvas dit aussi si la connexion accepte encore des écritures.
  const deliverControl = (frame: ControlFrame): void => {
    if (state.status === "joining") state.pendingControls.push(frame);
    else if (state.status === "ready") {
      if (frame.t === "canvasStatus")
        state = { ...state, isArchived: isArchivedAfter(frame.status, state.isArchived) };
      socket.sendFrame(frame);
    }
  };

  // JOURNAL 2026-10-06 : le classement de cette page, jamais en vue OBS.
  const onScoreboardControl = ({ frame }: ScoreboardControl): void => {
    if (state.status !== "awaitingHello" && state.mode === "ui") deliverControl(frame);
  };

  // JOURNAL 2026-09-30 : de nouvelles bornes changent la jauge max de chaque compte.
  const onGaugeLimitsControl = (limits: Extract<LiveControl, { t: "gaugeLimits" }>): void => {
    deliverControl(limits);
    if (state.status !== "ready" || !session) return;
    const { userId } = session;
    void deps.core
      .getGauge(state.canvasId, userId, deps.now())
      .then((gauge) => socket.sendFrame({ t: "gauge", ...gauge }))
      .catch((error: unknown) => console.error("jauge non relue", error));
  };

  const refuse = (code: ErrorCode): void => {
    socket.sendFrame({ t: "error", code });
    socket.close(CLOSE_POLICY);
  };

  // La version fait la déduplication : les cases du snapshot ne repartent pas (§6.1).
  const sendHeld = (held: CellsFrame[], snapshotVersion: number): void => {
    for (const frame of held) {
      const cells = frame.cells.filter((changed) => changed.version > snapshotVersion);
      if (cells.length > 0) socket.sendFrame({ t: "cells", toVersion: frame.toVersion, cells });
    }
  };

  // Le client annonce, le serveur choisit (§4.5). Le `recent` ne suit qu'un snapshot, jamais plus récent que lui (§9.5).
  const getArrival = async (frame: HelloFrame, meta: CanvasMeta): Promise<Arrival> => {
    const { canvasId, lastVersion } = frame;
    const missed =
      lastVersion === undefined
        ? null
        : await deps.core.listEvents(canvasId, lastVersion + 1, RESYNC_MAX_VERSIONS);
    if (missed && lastVersion !== undefined) {
      const cells = toCellsFrame(missed);
      return { kind: "resync", version: lastVersion, coveredVersion: cells?.toVersion ?? lastVersion, cells };
    }
    const { version, state: pixels } = await deps.core.getSnapshot(canvasId);
    if (frame.mode !== "obs")
      return { kind: "snapshot", version, coveredVersion: version, state: pixels, recent: null };
    const [recent, offStream] = await Promise.all([
      deps.core.listRecentEvents(canvasId, deps.now() - meta.obsDelayMs),
      deps.core.listOffStreamCells(canvasId),
    ]);
    const covered = recent.filter((event) => event.version <= version);
    return {
      kind: "snapshot",
      version,
      coveredVersion: version,
      state: toStreamState(pixels, offStream, meta.width),
      recent: toCellsFrame(covered),
    };
  };

  const sendArrival = (arrival: Arrival, welcome: WelcomeFrame): void => {
    if (arrival.kind === "resync") {
      socket.sendFrame(welcome);
      if (arrival.cells) socket.sendFrame({ t: "cells", ...arrival.cells });
      return;
    }
    socket.sendFrame(arrival.recent ? { ...welcome, recent: arrival.recent } : welcome);
    socket.sendSnapshot(arrival.state);
  };

  // Après le snapshot : les signalements en attente pour qui modère, le classement pour tous (JOURNAL 2026-10-06).
  const sendAfterArrival = (reportCount: number | null, scoreboard: ScoreboardFrame | null): void => {
    if (reportCount !== null) socket.sendFrame({ t: "reportCount", count: reportCount });
    if (scoreboard) socket.sendFrame(scoreboard);
  };

  // Ce qui est tombé pendant l'arrivée : un ban l'emporte sur celui qu'on a lu, le reste part après le `welcome`.
  const sendHeldControls = (held: ControlFrame[], wasBanned: boolean): void => {
    const lastBan = held.filter((frame) => frame.t === "banned" || frame.t === "unbanned").at(-1);
    if (lastBan ? lastBan.t === "banned" : wasBanned) socket.sendFrame({ t: "banned" });
    for (const frame of held) if (frame.t !== "banned" && frame.t !== "unbanned") socket.sendFrame(frame);
  };

  // S'abonner avant de lire l'état, et garder ce qui arrive pendant la lecture (§6.1). Le ban et le délai aussi.
  // Ce qui arrive pendant la lecture de l'état est gardé, puis envoyé après le snapshot.
  const startJoining = (canvasId: string, mode: HelloFrame["mode"], ownerId: string, role: Role): void => {
    state = {
      status: "joining",
      canvasId,
      mode,
      ownerId,
      role,
      pendingFrames: [],
      pendingControls: [],
      isRoleStale: false,
      isSizeStale: false,
    };
  };

  const joinCanvas = async (
    frame: HelloFrame,
    meta: CanvasMeta,
    role: Role,
    gauge: AckFrame["gauge"] | null,
    scoreboard: ScoreboardFrame | null,
  ) => {
    startJoining(frame.canvasId, frame.mode, meta.ownerId, role);
    // §8 : le seuil de signalement se compte en comptes, jamais un invité ni la vue OBS.
    const accountId = frame.mode === "ui" ? session?.userId : undefined;
    await deps.broadcast.join(frame.canvasId, listener, onControl, accountId);
    const { canvasId, mode } = frame;
    const isResumed = frame.lastVersion !== undefined; // la même page qui reprend, JOURNAL 2026-10-07
    member = deps.activity.join({ canvasId, ownerId: meta.ownerId, mode, session, role, device, isResumed });
    await arrive(frame, meta, role, gauge, scoreboard);
  };

  // Écart §4 (JOURNAL 2026-10-07) : le live du streamer et celui de la personne connectée, lus une fois joint : un live annoncé
  // pendant la lecture est gardé, puis envoyé après le welcome. Aucun profil en vue OBS, aucune lecture.
  const getTwitchLives = async (mode: HelloFrame["mode"], ownerId: string): Promise<TwitchLives> => {
    if (mode === "obs") return { owner: null, you: null };
    const isOwner = session?.userId === ownerId;
    const [owner, you] = await Promise.all([
      deps.core.getTwitchLive(ownerId),
      session && !isOwner ? deps.core.getTwitchLive(session.userId) : null,
    ]);
    return { owner, you: isOwner ? owner : you };
  };

  // Ce que l'arrivée lit avec l'état : le ban, les signalements en attente, le live.
  // Écart §15 (JOURNAL 2026-10-06) : une archive n'en a pas à dire, personne n'y pose.
  const getArrivalParts = (frame: HelloFrame, meta: CanvasMeta, role: Role) => {
    const isArchived = meta.archivedAt !== undefined;
    return Promise.all([
      getArrival(frame, meta),
      session && !isArchived ? deps.core.isBanned(frame.canvasId, session.userId) : false,
      canModerate(role) && !isArchived ? deps.core.getReportCount(frame.canvasId) : null,
      getTwitchLives(frame.mode, meta.ownerId),
    ]);
  };

  // Le `welcome`, le snapshot (ou le resync), puis ce qui est tombé entre-temps.
  const arrive = async (
    frame: HelloFrame,
    meta: CanvasMeta,
    role: Role,
    gauge: AckFrame["gauge"] | null,
    scoreboard: ScoreboardFrame | null,
  ) => {
    const { canvasId } = frame;
    const [arrival, wasBanned, reportCount, lives] = await getArrivalParts(frame, meta, role);

    sendArrival(arrival, buildWelcome(canvasId, meta, arrival.version, role, session, gauge, lives));
    sendAfterArrival(reportCount, scoreboard);

    const held =
      state.status === "joining"
        ? state
        : { pendingFrames: [], pendingControls: [], isRoleStale: false, isSizeStale: false };
    state = {
      status: "ready",
      canvasId,
      mode: frame.mode,
      ownerId: meta.ownerId,
      width: meta.width,
      height: meta.height,
      role,
      isArchived: isArchivedAfter(lastStatusOf(held.pendingControls), meta.archivedAt !== undefined),
    };
    sendHeld(held.pendingFrames, arrival.coveredVersion);
    sendHeldControls(held.pendingControls, wasBanned);
    if (held.isRoleStale) await refreshRole();
    if (held.isSizeStale) await rearrive();
  };

  // §6.1 : la taille a changé, la page reprend un snapshot sans se reconnecter.
  const rearrive = async (): Promise<void> => {
    if (state.status !== "ready") return;
    const { canvasId, mode, ownerId, role } = state;
    startJoining(canvasId, mode, ownerId, role);
    const meta = await deps.core.getCanvas(canvasId);
    if (!meta) return refuse("canvas_not_found");
    const gauge = await getGaugeFor(canvasId, meta);
    await arrive({ t: "hello", protocolVersion: PROTOCOL_VERSION, canvasId, mode }, meta, role, gauge, null);
  };

  const onResizeControl = (): void => {
    if (state.status === "joining") state.isSizeStale = true;
    else void rearrive().catch((error: unknown) => console.error("nouvelle taille non reprise", error));
  };

  // §5.6 : la jauge dès l'arrivée. Un invité n'en a pas, ni une archive (Écart §15, JOURNAL 2026-10-06) : personne n'y pose.
  const getGaugeFor = async (canvasId: string, meta: CanvasMeta): Promise<AckFrame["gauge"] | null> =>
    session && meta.archivedAt === undefined
      ? deps.core.getGauge(canvasId, session.userId, deps.now())
      : null;

  // JOURNAL 2026-10-06 : le classement à l'arrivée, lu avant de s'abonner comme la jauge, donc plus ancien que tout ce
  // qui tombe ensuite. Rien en vue OBS, rien non plus sans pose : une page qui se coupe efface le sien. Écart §15
  // (JOURNAL 2026-10-06) : ni sur une archive, qui n'en montre pas et n'a rien à lire.
  const getScoreboardFrame = async ({ canvasId, mode }: HelloFrame, meta: CanvasMeta) => {
    if (mode === "obs" || meta.archivedAt !== undefined) return null;
    const [top, ranks] = await Promise.all([
      deps.core.listScoreboard(canvasId),
      deps.core.listScoreboardRanks(canvasId, session ? [session.userId] : []),
    ]);
    if (top.length === 0) return null;
    return toScoreboardFrame(top, session ? ranks.get(session.userId) : undefined);
  };

  const greet = async (frame: HelloFrame): Promise<void> => {
    const meta = await deps.core.getCanvas(frame.canvasId);
    if (!meta) return refuse("canvas_not_found");
    const isModerator = session ? await deps.core.isModerator(frame.canvasId, session.userId) : false;
    const [gauge, scoreboard] = await Promise.all([
      getGaugeFor(frame.canvasId, meta),
      getScoreboardFrame(frame, meta),
    ]);
    await joinCanvas(frame, meta, roleFor(session, meta, isModerator), gauge, scoreboard);
  };

  // Écart §15 (JOURNAL 2026-10-06) : une archive refuse sans fermer la connexion. Un script qui la refuse apprend aussi
  // à la connexion qu'elle en est une : le gateway n'a pas encore reçu le statut.
  const refuseArchived = (requestId: string): void => {
    if (state.status === "ready") state = { ...state, isArchived: true };
    socket.sendFrame({ t: "error", code: "canvas_archived", requestId });
  };

  const placePixels = async (frame: PlaceFrame, canvasId: string): Promise<void> => {
    // Un invité reste connecté : il regarde, il ne pose pas (§10.2).
    if (!session) return socket.sendFrame({ t: "error", code: "unauthenticated" });
    const result = await deps.core.place(canvasId, {
      userId: session.userId,
      requestId: frame.requestId,
      placementId: frame.placementId,
      nowMs: deps.now(),
      pixels: frame.pixels,
    });
    if (!result.ok)
      return result.error === "canvas_archived" ? refuseArchived(frame.requestId) : refuse(result.error);
    deps.activity.countPixels(canvasId, session.userId, result.value.accepted);
    socket.sendFrame(result.value);
  };

  // JOURNAL 2026-09-30 : un +1 de jauge max, refusé par claim.lua s'il n'y a rien à réclamer.
  const claimGauge = async (requestId: string, canvasId: string): Promise<void> => {
    if (!session) return socket.sendFrame({ t: "error", code: "unauthenticated", requestId });
    const result = await deps.core.claimGauge(canvasId, {
      userId: session.userId,
      requestId,
      nowMs: deps.now(),
    });
    if (!result.ok)
      return result.error === "canvas_archived" ? refuseArchived(requestId) : refuse(result.error);
    socket.sendFrame(result.value);
  };

  // Une fenêtre glissante d'une seconde : la plus ancienne des dernières inspections doit en être sortie.
  const isInspectAllowed = (nowMs: Timestamp): boolean => {
    const oldest = inspectedAt.length < INSPECT_MAX_PER_SECOND ? undefined : inspectedAt[0];
    if (oldest !== undefined && nowMs - oldest < 1000) return false;
    inspectedAt.push(nowMs);
    if (inspectedAt.length > INSPECT_MAX_PER_SECOND) inspectedAt.shift();
    return true;
  };

  // Ouverte à tous, invités compris : l'auteur d'un pixel est public (CDC 2026).
  // §4.3 : son identifiant ne part qu'à qui modère, et le débit est plafonné.
  // §4.3 : un compte signale la pose d'un autre que lui et que le streamer, une fois.
  const canReport = async ({ userId, placementId }: InspectEntry, ready: ReadyState): Promise<boolean> => {
    if (!session || !userId || userId === session.userId || userId === ready.ownerId) return false;
    return deps.core.canReport(ready.canvasId, { authorId: userId, placementId }, session.userId);
  };

  // Ce que ce rôle voit de l'auteur : sans identifiant hors modération. JOURNAL 2026-09-27 : qui modère apprend en plus s'il
  // est modérateur, le streamer pour le nommer ou le retirer. Écart §4.3 (JOURNAL 2026-10-08) : tout modérateur, pour
  // que Bannir se cache sur un modérateur nommé ici.
  const entryFor = async (inspected: InspectEntry, ready: ReadyState): Promise<InspectEntry> => {
    // Écart §15 (JOURNAL 2026-10-06) : sur une archive, ni identifiant, ni signalement, ni origine : personne n'y modère.
    if (ready.isArchived) return withoutUserId(inspected);
    const found = session ? { ...inspected, canReport: await canReport(inspected, ready) } : inspected;
    if (!canModerate(ready.role)) return withoutUserId(found);
    if (!found.userId) return found;
    const moderatorOrigin = await deps.core.getModeratorOrigin(ready.canvasId, found.userId);
    return moderatorOrigin ? { ...found, moderatorOrigin } : found;
  };

  const inspectCell = async ({ requestId, x, y }: InspectFrame, ready: ReadyState): Promise<void> => {
    if (!isInspectAllowed(deps.now()))
      return socket.sendFrame({ t: "error", code: "rate_limited", requestId });
    const isInside = x < ready.width && y < ready.height;
    const found = isInside ? await deps.core.inspect(ready.canvasId, x, y) : null;
    const entry = found ? await entryFor(await withTwitchLive(found), ready) : null;
    socket.sendFrame({ t: "inspected", requestId, x, y, ...(entry ? { entry } : {}) });
  };

  // Écart §4 (JOURNAL 2026-10-07) : l'auteur est-il en live ? Une lecture Redis, au débit déjà plafonné de l'inspection.
  const withTwitchLive = async (inspected: InspectEntry): Promise<InspectEntry> => {
    const twitchLive = inspected.userId ? await deps.core.getTwitchLive(inspected.userId) : null;
    return twitchLive ? { ...inspected, twitchLive } : inspected;
  };

  const forbid = (): void => socket.sendFrame({ t: "error", code: "forbidden" });

  // Le gateway enchaîne les tranches jusqu'à la fin (§4.3), même si la socket se ferme : l'action était confirmée.
  const moderateSlices = async (
    canvasId: string,
    requestId: string,
    moderation: Omit<Moderation, "nowMs">,
  ) => {
    const result = await deps.core.moderate(canvasId, { ...moderation, nowMs: deps.now() });
    if (!result.ok) {
      if (result.error === "forbidden") return forbid();
      return result.error === "canvas_archived" ? refuseArchived(requestId) : refuse(result.error);
    }
    const { version, cells, isDone } = result.value;
    socket.sendFrame({ t: "moderated", requestId, version, cells, done: isDone });
    if (!isDone) await moderateSlices(canvasId, requestId, { ...moderation, slice: "next" });
  };

  const moderateCanvas = async ({ requestId, action }: ModerateFrame, ready: ReadyState): Promise<void> => {
    if (!session || !canModerate(ready.role)) return forbid();
    await moderateSlices(ready.canvasId, requestId, { by: session.userId, action, slice: "first" });
  };

  // §4.2 : les pixels d'un auteur, pour qui modère ou pour l'auteur lui-même.
  const listPixels = async ({ requestId, userId }: ListPixelsFrame, ready: ReadyState): Promise<void> => {
    if (!canModerate(ready.role) && userId !== session?.userId) return forbid();
    const pixels = await deps.core.listPixels(ready.canvasId, userId);
    socket.sendFrame({ t: "pixels", requestId, userId, pixels });
  };

  const listBans = async (requestId: string, ready: ReadyState): Promise<void> => {
    if (!canModerate(ready.role)) return forbid();
    socket.sendFrame({ t: "bans", requestId, users: await deps.core.listBans(ready.canvasId) });
  };

  // §4.2 : pour qui modère, comme la liste des bannis, avec l'état de la synchro Twitch.
  const listModerators = async (requestId: string, ready: ReadyState): Promise<void> => {
    if (!canModerate(ready.role)) return forbid();
    const [users, twitchSync] = await Promise.all([
      deps.core.listModerators(ready.canvasId),
      deps.core.getTwitchSync(ready.canvasId),
    ]);
    socket.sendFrame({ t: "moderators", requestId, users, ...(twitchSync ? { twitchSync } : {}) });
  };

  // JOURNAL 2026-09-27 : le streamer seul, et l'origine LivePlace seule : un rôle venu de Twitch se retire sur Twitch.
  const setModerator = async ({ requestId, userId, isModerator }: SetModeratorFrame, ready: ReadyState) => {
    if (ready.role !== "owner") return forbid();
    const result = await deps.core.setModerator(ready.canvasId, { userId, source: "liveplace", isModerator });
    if (!result.ok) return result.error === "canvas_archived" ? refuseArchived(requestId) : forbid();
    await listModerators(requestId, ready);
  };

  // §4.2 : tout compte connecté signale ; le seuil suit les comptes connectés au canvas.
  const reportPlacement = async ({ requestId, x, y, placementId, range }: ReportFrame, ready: ReadyState) => {
    if (!session) return socket.sendFrame({ t: "error", code: "unauthenticated", requestId });
    if (x >= ready.width || y >= ready.height)
      return socket.sendFrame({ t: "error", code: "forbidden", requestId });
    const result = await deps.core.report(ready.canvasId, {
      reporterId: session.userId,
      x,
      y,
      placementId,
      range,
      threshold: reportThreshold(deps.broadcast.countAccounts(ready.canvasId)),
      nowMs: deps.now(),
    });
    if (result.ok) return socket.sendFrame({ t: "reported", requestId });
    if (result.error === "canvas_archived") return refuseArchived(requestId);
    if (result.error === "canvas_not_found") return refuse("canvas_not_found");
    socket.sendFrame({ t: "error", code: "forbidden", requestId });
  };

  // §4.2 : pour choisir la plage à signaler. Sans identifiant, au débit d'`inspect`.
  const listAuthorPixels = async (
    { requestId, x, y, placementId }: ListAuthorPixelsFrame,
    ready: ReadyState,
  ) => {
    if (!session) return socket.sendFrame({ t: "error", code: "unauthenticated", requestId });
    if (!isInspectAllowed(deps.now()))
      return socket.sendFrame({ t: "error", code: "rate_limited", requestId });
    const isInside = x < ready.width && y < ready.height;
    const pixels = isInside ? await deps.core.listAuthorPixels(ready.canvasId, x, y, placementId) : null;
    if (!pixels) return socket.sendFrame({ t: "error", code: "forbidden", requestId });
    socket.sendFrame({ t: "authorPixels", requestId, pixels });
  };

  // §4.2 : le streamer seul ; les pages l'apprennent par le `ctl` `resize`.
  const resizeCanvas = async ({ requestId, width, height }: ResizeCanvasFrame, ready: ReadyState) => {
    const result =
      ready.role === "owner" && session
        ? await deps.core.resizeCanvas(ready.canvasId, { by: session.userId, width, height })
        : null;
    if (result && !result.ok && result.error === "canvas_archived") return refuseArchived(requestId);
    if (!result?.ok) return socket.sendFrame({ t: "error", code: "forbidden", requestId });
    socket.sendFrame({ t: "resized", requestId });
  };

  const listReports = async (requestId: string, ready: ReadyState): Promise<void> => {
    if (!canModerate(ready.role)) return forbid();
    socket.sendFrame({ t: "reports", requestId, reports: await deps.core.listReports(ready.canvasId) });
  };

  // CDC 2026 §1 : le streamer seul. Le schéma n'a laissé passer qu'un cran.
  const setObsDelay = async ({ obsDelayMs }: SetObsDelayFrame, ready: ReadyState): Promise<void> => {
    if (ready.role !== "owner") return forbid();
    await deps.core.setObsDelay(ready.canvasId, obsDelayMs);
  };

  // CDC 2026 §1 : le streamer seul, comme le délai.
  const setObsBackground = async ({ obsBackground }: SetObsBackgroundFrame, ready: ReadyState) => {
    if (ready.role !== "owner") return forbid();
    await deps.core.setObsBackground(ready.canvasId, obsBackground);
  };

  // JOURNAL 2026-09-30 : le streamer seul. Le schéma n'a laissé passer que des bornes valides.
  const setGaugeLimits = async (
    { gaugeMaxStart, gaugeMaxCeiling }: SetGaugeLimitsFrame,
    ready: ReadyState,
  ) => {
    if (ready.role !== "owner") return forbid();
    await deps.core.setGaugeLimits(ready.canvasId, { gaugeMaxStart, gaugeMaxCeiling });
  };

  // Écart §4.2 (JOURNAL 2026-10-06) : le développeur seul ; pour les autres, rien, pas même un refus. L'historique du canvas
  // est celui de cette socket (JOURNAL 2026-10-07).
  const listActivityHistory = async (
    { requestId, period }: ListActivityHistoryFrame,
    ready: ReadyState,
  ): Promise<void> => {
    const history = await deps.activity.listHistory(session, period, ready.canvasId);
    if (history) socket.sendFrame({ t: "activityHistory", requestId, ...history });
  };

  // Écart §4.2 (JOURNAL 2026-10-07) : de même pour la capacité, qui n'a rien de propre au canvas de la socket.
  const listCapacityHistory = async ({ requestId, period }: ListCapacityHistoryFrame): Promise<void> => {
    const history = await deps.capacity.listHistory(session, period);
    if (history) socket.sendFrame({ t: "capacityHistory", requestId, ...history });
  };

  // Un `switch` exhaustif : le compilateur signale toute frame du protocole laissée sans route.
  const route = async (frame: Exclude<ClientFrame, HelloFrame>, ready: ReadyState): Promise<void> => {
    // Écart §15 (JOURNAL 2026-10-06) : une archive se regarde (`inspect`) et se tient en vie (`ping`) ; le reste est refusé,
    // sauf le suivi d'activité et de capacité (écart §4.2), qui ne touchent pas au canvas.
    if (
      ready.isArchived &&
      frame.t !== "inspect" &&
      frame.t !== "ping" &&
      frame.t !== "watchActivity" &&
      frame.t !== "listActivityHistory" &&
      frame.t !== "watchCapacity" &&
      frame.t !== "listCapacityHistory"
    )
      return refuseArchived(frame.requestId);
    switch (frame.t) {
      case "place":
        return placePixels(frame, ready.canvasId);
      case "inspect":
        return inspectCell(frame, ready);
      case "moderate":
        return moderateCanvas(frame, ready);
      case "listPixels":
        return listPixels(frame, ready);
      case "listBans":
        return listBans(frame.requestId, ready);
      case "listModerators":
        return listModerators(frame.requestId, ready);
      case "setObsDelay":
        return setObsDelay(frame, ready);
      case "setObsBackground":
        return setObsBackground(frame, ready);
      case "claimGauge":
        return claimGauge(frame.requestId, ready.canvasId);
      case "setGaugeLimits":
        return setGaugeLimits(frame, ready);
      case "setModerator":
        return setModerator(frame, ready);
      case "report":
        return reportPlacement(frame, ready);
      case "listAuthorPixels":
        return listAuthorPixels(frame, ready);
      case "resizeCanvas":
        return resizeCanvas(frame, ready);
      case "listReports":
        return listReports(frame.requestId, ready);
      case "watchActivity":
        return deps.activity.watch(socket, session, frame.isWatching, ready.canvasId);
      case "listActivityHistory":
        return listActivityHistory(frame, ready);
      case "watchCapacity":
        return deps.capacity.watch(socket, session, frame.isWatching);
      case "listCapacityHistory":
        return listCapacityHistory(frame);
      case "ping":
        return socket.sendFrame({ t: "pong" });
    }
  };

  const onFrame = async (text: string): Promise<void> => {
    const raw = parseJson(text);
    const decoded = decodeClientFrame(raw);
    if (!decoded.ok) return refuse(isOtherProtocolVersion(raw) ? "protocol_version" : "invalid_frame");
    const frame = decoded.value;
    if (frame.t === "hello") return state.status === "awaitingHello" ? greet(frame) : refuse("invalid_frame");
    if (state.status !== "ready") return refuse("invalid_frame");
    return route(frame, state);
  };

  return {
    // Une frame à la fois : une pose envoyée juste après le hello attend le welcome.
    receive(text) {
      const done = queue.then(() => onFrame(text));
      queue = done.catch(() => undefined); // l'échec remonte à l'appelant, la file continue
      return done;
    },

    async close() {
      member?.leave();
      deps.activity.watch(socket, session, false);
      deps.capacity.watch(socket, session, false);
      if (state.status !== "awaitingHello") await deps.broadcast.leave(state.canvasId, listener);
    },
  };
}
