// Le serveur WebSocket : upgrade sur /ws, /healthz, et les limites d'entrée (§6.1, §6.3).

import { createServer } from "node:http";
import type { Session } from "@liveplace/domain";
import type { ClientConnection, ClientSocket, SessionVerifier } from "@liveplace/domain/ports";
import { type WebSocket, WebSocketServer } from "ws";

const MAX_PAYLOAD_BYTES = 8 * 1024;
const HELLO_TIMEOUT_MS = 5000;
const CLOSE_POLICY = 1008;
const CLOSE_INTERNAL = 1011;

export type GatewayServerDeps = {
  port: number;
  verifier: SessionVerifier;
  openConnection: (socket: ClientSocket, session: Session | null) => ClientConnection;
};

const toClientSocket = (socket: WebSocket): ClientSocket => ({
  sendFrame: (frame) => socket.send(JSON.stringify(frame)),
  sendSnapshot: (state) => socket.send(state, { binary: true }),
  close: (code) => socket.close(code),
});

export function startGatewayServer(deps: GatewayServerDeps) {
  const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES });

  const serve = (socket: WebSocket, session: Session | null): void => {
    const connection = deps.openConnection(toClientSocket(socket), session);
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
    const session = await deps.verifier.verify(request.headers.cookie);
    sockets.handleUpgrade(request, socket, head, (opened) => serve(opened, session));
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
