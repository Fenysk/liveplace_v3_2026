// Le Transport du web : une WebSocket sur `/ws`, à l'origine de la page (D-09, §9.2), qui se rouvre seule (§4.5).

import type { Transport, TransportListeners } from "@liveplace/domain/ports";
import { decodeServerFrame } from "@liveplace/protocol";
import { MISSED_PONGS_LIMIT, PING_INTERVAL_MS, reconnectDelayMs } from "./reconnect";

const CLOSE_NORMAL = 1000;
// Fermée de notre côté faute de `pong` : le navigateur peut mettre longtemps à le voir sur un réseau coupé.
const CLOSE_NO_PONG = 4000;

// Même origine en dev (proxy Vite) et en production (Traefik) : le cookie de session suit.
const socketUrl = (): string => {
  const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${window.location.host}/ws`;
};

const decodeText = (text: string) => {
  try {
    return decodeServerFrame(JSON.parse(text));
  } catch {
    return decodeServerFrame(undefined); // JSON cassé : le décodage le refuse comme le reste
  }
};

export function createWsClient(): Transport {
  let socket: WebSocket | null = null;
  let listeners: TransportListeners | undefined;
  let attempt = 0;
  let missedPongs = 0;
  let isClosedForGood = false;
  let pingTimer: ReturnType<typeof setInterval> | undefined;
  let reopenTimer: ReturnType<typeof setTimeout> | undefined;

  // Une seule fois par socket : sa fin prévient le store, puis la reprise se programme.
  const drop = (dropped: WebSocket, code: number): void => {
    if (dropped !== socket) return;
    socket = null;
    clearInterval(pingTimer);
    listeners?.onClose(code);
    if (isClosedForGood) return;
    reopenTimer = setTimeout(connect, reconnectDelayMs(attempt, Math.random));
    attempt += 1;
  };

  const ping = (opened: WebSocket): void => {
    if (missedPongs >= MISSED_PONGS_LIMIT) {
      opened.close(CLOSE_NO_PONG);
      drop(opened, CLOSE_NO_PONG);
      return;
    }
    missedPongs += 1;
    opened.send(JSON.stringify({ t: "ping" }));
  };

  function connect(): void {
    const opened = new WebSocket(socketUrl());
    opened.binaryType = "arraybuffer"; // le snapshot arrive en binaire (§4.3)
    socket = opened;

    opened.addEventListener("open", () => {
      attempt = 0;
      missedPongs = 0;
      pingTimer = setInterval(() => ping(opened), PING_INTERVAL_MS);
      listeners?.onOpen();
    });

    opened.addEventListener("message", (message) => {
      if (message.data instanceof ArrayBuffer) return listeners?.onSnapshot(new Uint8Array(message.data));
      const decoded = decodeText(String(message.data));
      if (!decoded.ok) return console.error("ws: frame serveur illisible", decoded.error);
      if (decoded.value.t === "pong") missedPongs = 0;
      listeners?.onFrame(decoded.value);
    });

    opened.addEventListener("close", (closed) => drop(opened, closed.code));
  }

  return {
    send(frame) {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(frame));
    },
    listen(next) {
      listeners = next;
      connect();
    },
    close() {
      isClosedForGood = true;
      clearTimeout(reopenTimer);
      clearInterval(pingTimer);
      socket?.close(CLOSE_NORMAL);
    },
  };
}
