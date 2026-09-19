// Le Transport du web : une WebSocket sur `/ws`, à l'origine de la page (D-09, §9.2).

import type { Transport, TransportListeners } from "@liveplace/domain/ports";
import { decodeServerFrame } from "@liveplace/protocol";

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
  const socket = new WebSocket(socketUrl());
  socket.binaryType = "arraybuffer"; // le snapshot arrive en binaire (§4.3)
  const waiting: string[] = [];
  let listeners: TransportListeners | undefined;

  socket.addEventListener("open", () => {
    for (const text of waiting.splice(0)) socket.send(text);
  });

  socket.addEventListener("message", (message) => {
    if (message.data instanceof ArrayBuffer) return listeners?.onSnapshot(new Uint8Array(message.data));
    const decoded = decodeText(String(message.data));
    if (decoded.ok) listeners?.onFrame(decoded.value);
    else console.error("ws: frame serveur illisible", decoded.error);
  });

  socket.addEventListener("close", (closed) => listeners?.onClose(closed.code));

  return {
    send(frame) {
      const text = JSON.stringify(frame);
      if (socket.readyState === WebSocket.OPEN) socket.send(text);
      else waiting.push(text);
    },
    listen(next) {
      listeners = next;
    },
    close() {
      socket.close(1000);
    },
  };
}
