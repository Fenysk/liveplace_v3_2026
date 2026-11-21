// Le serveur WebSocket : upgrade sur /ws, /healthz, et les limites d'entrée (§6.1, §6.3).

import { createServer, type IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import type { Device, Session } from "@liveplace/domain";
import type { ClientConnection, ClientSocket, SessionVerifier } from "@liveplace/domain/ports";
import type { ServerFrame } from "@liveplace/protocol";
import { clientIpOf, ipKeyOf } from "@liveplace/shared";
import { type WebSocket, WebSocketServer } from "ws";

const MAX_PAYLOAD_BYTES = 8 * 1024;
const HELLO_TIMEOUT_MS = 5000;
const CLOSE_POLICY = 1008;
const CLOSE_INTERNAL = 1011;
// « try again later » : la page se reconnecte et reprend par `lastVersion`, on ne garde jamais de file qui grossit pour elle.
const CLOSE_TRY_AGAIN_LATER = 1013;
// §6.3 : 1 Mio de plus que la plus grosse frame déjà envoyée, que la page met le temps de vider.
export const MAX_BUFFERED_BYTES = 1024 * 1024;
// Une réponse HTTP brute : avant l'upgrade, la socket n'est encore qu'un flux TCP.
const FORBIDDEN_HANDSHAKE = ["HTTP/1.1 403 Forbidden", "Connection: close", "Content-Length: 0", "", ""].join(
  "\r\n",
);

// Un plafond de connexions ouvertes par adresse (audit de sécurité n°6, JOURNAL 2026-11-21). À RÉGLER ICI. Une page ouvre 1 connexion,
// la vue OBS 1 de plus : un streamer avec OBS et plusieurs onglets en tient ~6, une école de 30 élèves sur une même adresse, 30 à 60.
// 150 laisse cette marge et même deux écoles derrière un même réseau d'opérateur ; une seule adresse ne peut plus en tenir des milliers.
export const MAX_CONNECTIONS_PER_ADDRESS = 150;
const RETRY_AFTER_SECONDS = 10;
const TOO_MANY_HANDSHAKE = [
  "HTTP/1.1 429 Too Many Requests",
  `Retry-After: ${RETRY_AFTER_SECONDS}`,
  "Connection: close",
  "Content-Length: 0",
  "",
  "",
].join("\r\n");

export type GatewayServerDeps = {
  port: number;
  publicOrigin: string;
  verifier: SessionVerifier;
  openConnection: (socket: ClientSocket, session: Session | null, device: Device) => ClientConnection;
  onBytesSent: (bytes: number) => void; // §16.3 : le débit sortant, compté à chaque envoi
  onClosedBehind: () => void; // §16.3 : une connexion fermée en 1013, comptée une fois
  maxConnectionsPerAddress?: number; // par défaut `MAX_CONNECTIONS_PER_ADDRESS` ; les tests le baissent
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

// §16.2 : PC ou téléphone, pour le suivi d'activité. Sans `User-Agent`, un PC.
const PHONE_USER_AGENT = /Mobi|Android|iPhone|iPad|iPod/;

export function toDevice(userAgent: string | undefined): Device {
  return userAgent && PHONE_USER_AGENT.test(userAgent) ? "phone" : "desktop";
}

export function startGatewayServer(deps: GatewayServerDeps) {
  const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES });
  const maxPerAddress = deps.maxConnectionsPerAddress ?? MAX_CONNECTIONS_PER_ADDRESS;
  const openPerAddress = new Map<string, number>();

  // Une place se prend sans attendre (avant la vérification de session, qui est asynchrone) et se rend une seule fois, à la
  // fermeture de la socket brute : elle couvre un abandon pendant l'upgrade comme une fermeture normale.
  const takeSlot = (key: string): (() => void) | null => {
    const open = openPerAddress.get(key) ?? 0;
    if (open >= maxPerAddress) return null;
    openPerAddress.set(key, open + 1);
    let isReleased = false;
    return () => {
      if (isReleased) return;
      isReleased = true;
      const left = (openPerAddress.get(key) ?? 1) - 1;
      if (left > 0) openPerAddress.set(key, left);
      else openPerAddress.delete(key);
    };
  };

  // Derrière Traefik : l'entrée de droite de `X-Forwarded-For`, que Traefik ajoute ; celles de gauche, le client les écrit.
  // Faux : le plafond est atteint, la poignée de main est déjà refusée.
  const claimSlot = (request: IncomingMessage, socket: Duplex): boolean => {
    const forwardedFor = request.headers["x-forwarded-for"];
    const address = clientIpOf(
      Array.isArray(forwardedFor) ? forwardedFor.join(", ") : forwardedFor,
      request.socket.remoteAddress,
    );
    if (!address) return true;
    const release = takeSlot(ipKeyOf(address));
    if (!release) {
      socket.end(TOO_MANY_HANDSHAKE);
      return false;
    }
    socket.once("close", release);
    return true;
  };

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

    // Sans écouteur, une erreur de la socket (trame invalide, reset) fait tomber tout le processus.
    socket.on("error", (error) => {
      console.error("gateway: erreur de socket", error.message);
      socket.terminate();
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
    // Avant l'upgrade, une erreur sur la socket brute (reset) ferait tomber le processus : on la détruit ici, sans handler global.
    socket.on("error", (error) => {
      console.error("gateway: erreur d'upgrade", error.message);
      socket.destroy();
    });
    try {
      // Le chemin exact : `/ws_pseudo` est la page d'un streamer, pas le socket.
      if (request.url !== "/ws") {
        socket.destroy();
        return;
      }
      if (!isAllowedOrigin(request.headers.origin, deps.publicOrigin)) {
        socket.end(FORBIDDEN_HANDSHAKE);
        return;
      }
      if (!claimSlot(request, socket)) return;
      const session = await deps.verifier.verify(request.headers.cookie);
      const device = toDevice(request.headers["user-agent"]);
      sockets.handleUpgrade(request, socket, head, (opened) => serve(opened, session, device));
    } catch (error) {
      console.error("gateway: upgrade abandonné", error);
      socket.destroy();
    }
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
