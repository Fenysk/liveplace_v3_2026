// Le cycle de vie d'une connexion (§6.1).

import {
  type CanvasMeta,
  PALETTE,
  type Role,
  roleFor,
  type Session,
  type Timestamp,
} from "@liveplace/domain";
import type { CanvasCore, ClientSocket } from "@liveplace/domain/ports";
import {
  type CellsFrame,
  type ClientFrame,
  decodeClientFrame,
  PROTOCOL_VERSION,
  type ServerFrame,
} from "@liveplace/protocol";
import type { Broadcast, CellsListener } from "./broadcast";

// « policy violation » : la frame est refusée et la connexion fermée.
const CLOSE_POLICY = 1008;

type ErrorCode = Extract<ServerFrame, { t: "error" }>["code"];
type HelloFrame = Extract<ClientFrame, { t: "hello" }>;
type PlaceFrame = Extract<ClientFrame, { t: "place" }>;
type WelcomeFrame = Extract<ServerFrame, { t: "welcome" }>;

type State =
  | { status: "awaitingHello" }
  | { status: "joining"; canvasId: string; pendingFrames: CellsFrame[] }
  | { status: "ready"; canvasId: string };

export type ConnectionDeps = {
  core: Pick<CanvasCore, "getCanvas" | "isModerator" | "getSnapshot" | "place">;
  broadcast: Broadcast;
  now: () => Timestamp;
};

export interface Connection {
  receive(text: string): Promise<void>;
  close(): Promise<void>;
}

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

const buildWelcome = (
  canvasId: string,
  meta: CanvasMeta,
  version: number,
  role: Role,
  session: Session | null,
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
  you: session
    ? { userId: session.userId, login: session.login, displayName: session.displayName, role }
    : { role },
});

export function createConnection(
  deps: ConnectionDeps,
  socket: ClientSocket,
  session: Session | null,
): Connection {
  let state: State = { status: "awaitingHello" };
  let queue: Promise<void> = Promise.resolve();

  const listener: CellsListener = (frame) => {
    if (state.status === "joining") state.pendingFrames.push(frame);
    else if (state.status === "ready") socket.sendFrame({ t: "cells", ...frame });
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

  const greet = async (frame: HelloFrame): Promise<void> => {
    const meta = await deps.core.getCanvas(frame.canvasId);
    if (!meta) return refuse("canvas_not_found");
    const isModerator = session ? await deps.core.isModerator(frame.canvasId, session.userId) : false;

    // S'abonner avant de lire l'état, et garder ce qui arrive pendant la lecture (§6.1).
    state = { status: "joining", canvasId: frame.canvasId, pendingFrames: [] };
    await deps.broadcast.join(frame.canvasId, listener);
    const snapshot = await deps.core.getSnapshot(frame.canvasId);

    socket.sendFrame(
      buildWelcome(frame.canvasId, meta, snapshot.version, roleFor(session, meta, isModerator), session),
    );
    socket.sendSnapshot(snapshot.state);

    const held = state.status === "joining" ? state.pendingFrames : [];
    state = { status: "ready", canvasId: frame.canvasId };
    sendHeld(held, snapshot.version);
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

  const route = async (frame: Exclude<ClientFrame, HelloFrame>, canvasId: string): Promise<void> => {
    if (frame.t === "place") return placePixels(frame, canvasId);
    if (frame.t === "ping") return socket.sendFrame({ t: "pong" });
    // `inspect` (J7+) et `moderate` (J15) : la frame est valide, le service n'existe pas encore.
    socket.sendFrame({ t: "error", code: "invalid_frame", message: "pas encore pris en charge" });
  };

  const onFrame = async (text: string): Promise<void> => {
    const raw = parseJson(text);
    const decoded = decodeClientFrame(raw);
    if (!decoded.ok) return refuse(isOtherProtocolVersion(raw) ? "protocol_version" : "invalid_frame");
    const frame = decoded.value;
    if (frame.t === "hello") return state.status === "awaitingHello" ? greet(frame) : refuse("invalid_frame");
    if (state.status !== "ready") return refuse("invalid_frame");
    return route(frame, state.canvasId);
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
