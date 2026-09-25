// Le cycle de vie d'une connexion (§6.1).

import {
  type CanvasMeta,
  canModerate,
  PALETTE,
  type Role,
  roleFor,
  type Session,
  type Timestamp,
} from "@liveplace/domain";
import type {
  AckFrame,
  CanvasCore,
  ClientConnection,
  ClientSocket,
  LiveControl,
  Moderation,
} from "@liveplace/domain/ports";
import {
  type CellsFrame,
  type ClientFrame,
  decodeClientFrame,
  PROTOCOL_VERSION,
  type ServerFrame,
} from "@liveplace/protocol";
import type { Broadcast, CellsListener, ControlListener } from "./broadcast";
import { toCellsFrame } from "./cells-frame";

// « policy violation » : la frame est refusée et la connexion fermée.
const CLOSE_POLICY = 1008;
// Au-delà, le snapshot est plus court à transmettre que le rattrapage (§4.5).
const RESYNC_MAX_VERSIONS = 2000;

type ErrorCode = Extract<ServerFrame, { t: "error" }>["code"];
type HelloFrame = Extract<ClientFrame, { t: "hello" }>;
type PlaceFrame = Extract<ClientFrame, { t: "place" }>;
type InspectFrame = Extract<ClientFrame, { t: "inspect" }>;
type ModerateFrame = Extract<ClientFrame, { t: "moderate" }>;
type ListPixelsFrame = Extract<ClientFrame, { t: "listPixels" }>;
type SetObsDelayFrame = Extract<ClientFrame, { t: "setObsDelay" }>;
type WelcomeFrame = Extract<ServerFrame, { t: "welcome" }>;
// Un message de contrôle devenu frame pour cette socket : son ban, ou le délai OBS du canvas.
type ControlFrame = Extract<ServerFrame, { t: "banned" | "unbanned" | "obsDelay" }>;

// L'arrivée d'une page : un resync depuis `lastVersion`, ou un snapshot (et son `recent` en vue OBS).
// `version` part dans le `welcome` ; `coveredVersion` est la dernière version déjà envoyée, pour dédupliquer (§6.1).
type Arrival = { version: number; coveredVersion: number } & (
  | { kind: "resync"; cells: CellsFrame | null }
  | { kind: "snapshot"; state: Uint8Array; recent: CellsFrame | null }
);

// `ready` garde la taille du canvas (une case hors bornes n'a pas de cellKey à elle) et le rôle, qui décide (§10.3).
type ReadyState = { status: "ready"; canvasId: string; width: number; height: number; role: Role };
type State =
  | { status: "awaitingHello" }
  | { status: "joining"; canvasId: string; pendingFrames: CellsFrame[]; pendingControls: ControlFrame[] }
  | ReadyState;

export type ConnectionDeps = {
  core: Pick<
    CanvasCore,
    | "getCanvas"
    | "isModerator"
    | "isBanned"
    | "getSnapshot"
    | "getGauge"
    | "place"
    | "inspect"
    | "moderate"
    | "listPixels"
    | "listBans"
    | "listEvents"
    | "listRecentEvents"
    | "setObsDelay"
  >;
  broadcast: Broadcast;
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

// Écart §4.3 (JOURNAL 2026-09-24) : la photo Twitch de la session, quand le cookie la porte.
const youOf = ({ userId, login, displayName, avatarUrl }: Session) => ({
  userId,
  login,
  displayName,
  ...(avatarUrl ? { avatarUrl } : {}),
});

const buildWelcome = (
  canvasId: string,
  meta: CanvasMeta,
  version: number,
  role: Role,
  session: Session | null,
  gauge: AckFrame["gauge"] | null,
): WelcomeFrame => ({
  t: "welcome",
  canvas: { canvasId, width: meta.width, height: meta.height, ownerId: meta.ownerId },
  params: {
    gaugeMax: meta.gaugeMax,
    refillMs: meta.refillMs,
    refillCharges: meta.refillCharges,
    obsDelayMs: meta.obsDelayMs,
  },
  palette: [...PALETTE],
  version,
  you: session ? { ...youOf(session), role } : { role },
  ...(gauge ? { gauge } : {}),
});

// Un ban ne regarde que les sockets de la cible (JOURNAL 2026-09-25) ; le délai OBS, toutes celles du canvas.
const controlFrameOf = (control: LiveControl, session: Session | null): ControlFrame | null => {
  if (control.t === "obsDelay") return { t: "obsDelay", obsDelayMs: control.obsDelayMs };
  return control.userId === session?.userId ? { t: control.t } : null;
};

export function createConnection(
  deps: ConnectionDeps,
  socket: ClientSocket,
  session: Session | null,
): ClientConnection {
  let state: State = { status: "awaitingHello" };
  let queue: Promise<void> = Promise.resolve();

  const listener: CellsListener = (frame) => {
    if (state.status === "joining") state.pendingFrames.push(frame);
    else if (state.status === "ready") socket.sendFrame({ t: "cells", ...frame });
  };

  // Écart §10.2 et CDC v3 §1 (JOURNAL 2026-09-25) : le ban de cette personne, le délai OBS de ce canvas.
  const onControl: ControlListener = (control) => {
    const frame = controlFrameOf(control, session);
    if (!frame) return;
    if (state.status === "joining") state.pendingControls.push(frame);
    else if (state.status === "ready") socket.sendFrame(frame);
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
    const recent =
      frame.mode === "obs" ? await deps.core.listRecentEvents(canvasId, deps.now() - meta.obsDelayMs) : [];
    const covered = recent.filter((event) => event.version <= version);
    return {
      kind: "snapshot",
      version,
      coveredVersion: version,
      state: pixels,
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

  // Ce qui est tombé pendant l'arrivée : un ban l'emporte sur celui qu'on a lu, un délai part après le `welcome`.
  const sendHeldControls = (held: ControlFrame[], wasBanned: boolean): void => {
    const lastBan = held.filter((frame) => frame.t !== "obsDelay").at(-1);
    if (lastBan ? lastBan.t === "banned" : wasBanned) socket.sendFrame({ t: "banned" });
    for (const frame of held) if (frame.t === "obsDelay") socket.sendFrame(frame);
  };

  // S'abonner avant de lire l'état, et garder ce qui arrive pendant la lecture (§6.1). Le ban et le délai aussi.
  const joinCanvas = async (
    frame: HelloFrame,
    meta: CanvasMeta,
    role: Role,
    gauge: AckFrame["gauge"] | null,
  ) => {
    const { canvasId } = frame;
    state = { status: "joining", canvasId, pendingFrames: [], pendingControls: [] };
    await deps.broadcast.join(canvasId, listener, onControl);
    const [arrival, wasBanned] = await Promise.all([
      getArrival(frame, meta),
      session ? deps.core.isBanned(canvasId, session.userId) : false,
    ]);

    sendArrival(arrival, buildWelcome(canvasId, meta, arrival.version, role, session, gauge));

    const held = state.status === "joining" ? state : { pendingFrames: [], pendingControls: [] };
    state = { status: "ready", canvasId, width: meta.width, height: meta.height, role };
    sendHeld(held.pendingFrames, arrival.coveredVersion);
    sendHeldControls(held.pendingControls, wasBanned);
  };

  const greet = async (frame: HelloFrame): Promise<void> => {
    const meta = await deps.core.getCanvas(frame.canvasId);
    if (!meta) return refuse("canvas_not_found");
    const isModerator = session ? await deps.core.isModerator(frame.canvasId, session.userId) : false;
    // Écart §5.6 (JOURNAL 2026-09-24) : la jauge dès l'arrivée. Un invité n'en a pas.
    const gauge = session ? await deps.core.getGauge(frame.canvasId, session.userId, deps.now()) : null;
    await joinCanvas(frame, meta, roleFor(session, meta, isModerator), gauge);
  };

  const placePixels = async (frame: PlaceFrame, canvasId: string): Promise<void> => {
    // Un invité reste connecté : il regarde, il ne pose pas (§10.2).
    if (!session) return socket.sendFrame({ t: "error", code: "unauthenticated" });
    const result = await deps.core.place(canvasId, {
      userId: session.userId,
      requestId: frame.requestId,
      nowMs: deps.now(),
      pixels: frame.pixels,
    });
    if (!result.ok) return refuse("canvas_not_found");
    socket.sendFrame(result.value);
  };

  // Ouverte à tous, invités compris : l'auteur d'un pixel est public (CDC 2026).
  const inspectCell = async ({ requestId, x, y }: InspectFrame, ready: ReadyState): Promise<void> => {
    const isInside = x < ready.width && y < ready.height;
    const entry = isInside ? await deps.core.inspect(ready.canvasId, x, y) : null;
    socket.sendFrame({ t: "inspected", requestId, x, y, ...(entry ? { entry } : {}) });
  };

  const forbid = (): void => socket.sendFrame({ t: "error", code: "forbidden" });

  // Le gateway enchaîne les tranches jusqu'à la fin (§4.3), même si la socket se ferme : l'action était confirmée.
  const moderateSlices = async (
    canvasId: string,
    requestId: string,
    moderation: Omit<Moderation, "nowMs">,
  ) => {
    const result = await deps.core.moderate(canvasId, { ...moderation, nowMs: deps.now() });
    if (!result.ok) return result.error === "forbidden" ? forbid() : refuse(result.error);
    const { version, cells, isDone } = result.value;
    socket.sendFrame({ t: "moderated", requestId, version, cells, done: isDone });
    if (!isDone) await moderateSlices(canvasId, requestId, { ...moderation, slice: "next" });
  };

  const moderateCanvas = async ({ requestId, action }: ModerateFrame, ready: ReadyState): Promise<void> => {
    if (!session || !canModerate(ready.role)) return forbid();
    await moderateSlices(ready.canvasId, requestId, { by: session.userId, action, slice: "first" });
  };

  // Écart §4.2 (JOURNAL 2026-09-25) : les pixels d'un auteur, pour qui modère ou pour l'auteur lui-même.
  const listPixels = async ({ requestId, userId }: ListPixelsFrame, ready: ReadyState): Promise<void> => {
    if (!canModerate(ready.role) && userId !== session?.userId) return forbid();
    const pixels = await deps.core.listPixels(ready.canvasId, userId);
    socket.sendFrame({ t: "pixels", requestId, userId, pixels });
  };

  const listBans = async (requestId: string, ready: ReadyState): Promise<void> => {
    if (!canModerate(ready.role)) return forbid();
    socket.sendFrame({ t: "bans", requestId, users: await deps.core.listBans(ready.canvasId) });
  };

  // Écart CDC v3 §1 (JOURNAL 2026-09-25) : le streamer seul. Le schéma n'a laissé passer qu'un cran.
  const setObsDelay = async ({ obsDelayMs }: SetObsDelayFrame, ready: ReadyState): Promise<void> => {
    if (ready.role !== "owner") return forbid();
    await deps.core.setObsDelay(ready.canvasId, obsDelayMs);
  };

  const route = async (frame: Exclude<ClientFrame, HelloFrame>, ready: ReadyState): Promise<void> => {
    if (frame.t === "place") return placePixels(frame, ready.canvasId);
    if (frame.t === "inspect") return inspectCell(frame, ready);
    if (frame.t === "moderate") return moderateCanvas(frame, ready);
    if (frame.t === "listPixels") return listPixels(frame, ready);
    if (frame.t === "listBans") return listBans(frame.requestId, ready);
    if (frame.t === "setObsDelay") return setObsDelay(frame, ready);
    socket.sendFrame({ t: "pong" });
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
      if (state.status !== "awaitingHello") await deps.broadcast.leave(state.canvasId, listener);
    },
  };
}
