// Le serveur WebSocket : upgrade sur /ws, /healthz, et les limites d'entrée (§6.1, §6.3).

import { createServer } from "node:http";
import type { Device, Session } from "@liveplace/domain";
import type { ClientConnection, ClientSocket, SessionVerifier } from "@liveplace/domain/ports";
import type { ServerFrame } from "@liveplace/protocol";
import { type WebSocket, WebSocketServer } from "ws";

const MAX_PAYLOAD_BYTES = 8 * 1024;
const HELLO_TIMEOUT_MS = 5000;
const CLOSE_POLICY = 1008;
const CLOSE_INTERNAL = 1011;
// « try again later » : la page se reconnecte et reprend par `lastVersion`, on ne garde jamais de file qui grossit pour elle.
const CLOSE_TRY_AGAIN_LATER = 1013;
// §6.3, Écart §6.3 (JOURNAL 2026-10-09) : 1 Mio de plus que la plus grosse frame déjà envoyée, que la page met le temps de vider.
export const MAX_BUFFERED_BYTES = 1024 * 1024;
// Une réponse HTTP brute : avant l'upgrade, la socket n'est encore qu'un flux TCP.
const FORBIDDEN_HANDSHAKE = ["HTTP/1.1 403 Forbidden", "Connection: close", "Content-Length: 0", "", ""].join(
  "\r\n",
);

export type GatewayServerDeps = {
  port: number;
  publicOrigin: string;
  verifier: SessionVerifier;
  openConnection: (socket: ClientSocket, session: Session | null, device: Device) => ClientConnection;
  onBytesSent: (bytes: number) => void; // Écart §5.1 (JOURNAL 2026-10-07) : le débit sortant, compté à chaque envoi
  onClosedBehind: () => void; // Écart §4.3 et §5.1 (JOURNAL 2026-10-09) : une connexion fermée en 1013, comptée une fois
};

// Une frame partagée par tout un canvas (le tick) n'est sérialisée qu'une fois (JOURNAL 2026-09-26).
const encodedFrames = new WeakMap<ServerFrame, Buffer>();

const encode = (frame: ServerFrame): Buffer => {
  const known = encodedFrames.get(frame);
  if (known) return known;
  const encoded = Buffer.from(JSON.stringify(frame));
  encodedFrames.set(frame, encoded);
  return encoded;
};

// Les octets comptés sont ceux des frames et des snapshots, sans l'en-tête WebSocket ni TLS : pour chaque socket, même quand
// la frame est partagée.
export const toClientSocket = (
  socket: Pick<WebSocket, "send" | "close" | "bufferedAmount">,
  onBytesSent: (bytes: number) => void,
  onClosedBehind: () => void,
): ClientSocket => {
  let largestSent = 0;
  let isBehind = false;

  // Vérifié avant chaque envoi : une page qui ne suit pas est fermée en 1013, puis plus rien ne part vers elle.
  const deliver = (payload: Uint8Array, isBinary: boolean): void => {
    if (isBehind) return;
    if (socket.bufferedAmount > MAX_BUFFERED_BYTES + largestSent) {
      isBehind = true;
      socket.close(CLOSE_TRY_AGAIN_LATER);
      onClosedBehind();
      return;
    }
    largestSent = Math.max(largestSent, payload.length);
    onBytesSent(payload.length);
    socket.send(payload, { binary: isBinary });
  };

  return {
    sendFrame: (frame) => deliver(encode(frame), false),
    sendSnapshot: (state) => deliver(state, true),
    close: (code) => socket.close(code),
  };
};

// JOURNAL 2026-09-29 : une page d'une autre origine n'ouvre pas le WebSocket au nom d'un viewer connecté.
// Sans `Origin`, ce n'est pas un navigateur : les bots des preuves et le test de charge passent.
export function isAllowedOrigin(origin: string | undefined, publicOrigin: string): boolean {
  return origin === undefined || origin === publicOrigin;
}

// Écart §4.3 (JOURNAL 2026-10-06) : PC ou téléphone, pour le suivi d'activité. Sans `User-Agent`, un PC.
const PHONE_USER_AGENT = /Mobi|Android|iPhone|iPad|iPod/;

export function toDevice(userAgent: string | undefined): Device {
  return userAgent && PHONE_USER_AGENT.test(userAgent) ? "phone" : "desktop";
}

export function startGatewayServer(deps: GatewayServerDeps) {
  const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES });

  const serve = (socket: WebSocket, session: Session | null, device: Device): void => {
    const connection = deps.openConnection(
      toClientSocket(socket, deps.onBytesSent, deps.onClosedBehind),
      session,
      device,
    );
    // `hello` attendu dans les 5 s (§6.3) : le compte à rebours s'arrête à la première frame.
    const greeting = setTimeout(() => socket.close(CLOSE_POLICY), HELLO_TIMEOUT_MS);

    socket.on("message", (raw, isBinary) => {
      clearTimeout(greeting);
      if (isBinary) return socket.close(CLOSE_POLICY);
      connection.receive(raw.toString()).catch((error: unknown) => {
        console.error("gateway: frame abandonnée", error);
        socket.close(CLOSE_INTERNAL);
      });
    });

    socket.on("close", () => {
      clearTimeout(greeting);
      connection.close().catch((error: unknown) => console.error("gateway: fermeture incomplète", error));
    });
  };

  const server = createServer((request, response) => {
    const found = request.url === "/healthz";
    response.writeHead(found ? 200 : 404);
    response.end(found ? "ok" : undefined);
  });

  // La session est vérifiée avant l'upgrade : après, une frame pourrait arriver sans personne pour l'écouter.
  server.on("upgrade", async (request, socket, head) => {
    // Le chemin exact : `/ws_pseudo` est la page d'un streamer, pas le socket.
    if (request.url !== "/ws") {
      socket.destroy();
      return;
    }
    if (!isAllowedOrigin(request.headers.origin, deps.publicOrigin)) {
      socket.end(FORBIDDEN_HANDSHAKE);
      return;
    }
    const session = await deps.verifier.verify(request.headers.cookie);
    const device = toDevice(request.headers["user-agent"]);
    sockets.handleUpgrade(request, socket, head, (opened) => serve(opened, session, device));
  });

  server.listen(deps.port);
  return {
    // Au redéploiement (§6.3) : `1012`, « service restart », et les pages se reconnectent seules.
    closeSockets: (code: number) => {
      for (const socket of sockets.clients) socket.close(code);
    },
    close: () =>
      new Promise<void>((resolve) => {
        sockets.close();
        server.close(() => resolve());
      }),
  };
}
