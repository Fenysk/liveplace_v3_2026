// L'état local d'un canvas : la copie de `state`, sa version, et le rôle et le nom donnés par le gateway (§9.2).

import { type Role, toStateOffset } from "@liveplace/domain";
import type { Transport } from "@liveplace/domain/ports";
import { type CellsFrame, PROTOCOL_VERSION, type ServerFrame } from "@liveplace/protocol";

type ErrorCode = Extract<ServerFrame, { t: "error" }>["code"];

export type CanvasView = {
  status: "connecting" | "live" | "closed";
  width: number;
  height: number;
  palette: readonly string[];
  version: number;
  role?: Role;
  displayName?: string; // absent pour un invité
  lastError?: ErrorCode;
  pixels: Uint8Array; // un octet par case, l'index de palette (§4.3)
};

export type CanvasStore = {
  subscribe(listener: () => void): () => void; // la forme qu'attend `useSyncExternalStore`
  getView(): CanvasView;
  place(x: number, y: number, colorIndex: number): void;
  close(): void;
};

// Fourni aux routes par le contexte du routeur : `ui/` ouvre un canvas sans connaître `net/`.
export type CanvasOpener = (canvasId: string) => CanvasStore;

export function createCanvasStore(canvasId: string, transport: Transport): CanvasStore {
  let view: CanvasView = {
    status: "connecting",
    width: 0,
    height: 0,
    palette: [],
    version: 0,
    pixels: new Uint8Array(0),
  };
  const listeners = new Set<() => void>();

  // Un nouvel objet à chaque changement : `useSyncExternalStore` compare les références.
  const publish = (next: Partial<CanvasView>): void => {
    view = { ...view, ...next };
    for (const listener of listeners) listener();
  };

  // Le seul chemin d'écriture des cases : flux live, et plus tard resync et vue OBS (§9.2).
  const apply = (frame: CellsFrame): void => {
    for (const cell of frame.cells) view.pixels[toStateOffset(cell.x, cell.y, view.width)] = cell.colorIndex;
    publish({ version: frame.toVersion });
  };

  const onFrame = (frame: ServerFrame): void => {
    switch (frame.t) {
      case "welcome": {
        const { width, height } = frame.canvas;
        const { palette, version } = frame;
        const { role, displayName } = frame.you;
        publish({
          status: "live",
          width,
          height,
          palette,
          version,
          role,
          ...(displayName ? { displayName } : {}),
          pixels: new Uint8Array(width * height),
        });
        break;
      }
      case "cells":
        apply(frame);
        break;
      case "error":
        publish({ lastError: frame.code });
        break;
      default:
      // `ack` : la jauge s'affichera au J10.
    }
  };

  transport.listen({
    onFrame,
    // Le snapshot suit le `welcome` : il remplace la copie entière (§6.1).
    onSnapshot: (state) => publish({ pixels: state.slice() }),
    onClose: () => publish({ status: "closed" }),
  });
  transport.send({ t: "hello", protocolVersion: PROTOCOL_VERSION, canvasId, mode: "ui" });

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getView: () => view,
    place(x, y, colorIndex) {
      transport.send({ t: "place", requestId: crypto.randomUUID(), pixels: [{ x, y, colorIndex }] });
    },
    close: () => transport.close(),
  };
}
