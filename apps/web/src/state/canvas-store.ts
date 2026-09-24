// L'état local d'un canvas : la copie de `state`, sa version, la jauge, et le rôle et le nom donnés par le gateway (§9.2).

import { type Role, toStateOffset } from "@liveplace/domain";
import type { AckFrame, InspectEntry, Placement, Transport } from "@liveplace/domain/ports";
import { type CellsFrame, PROTOCOL_VERSION, type ServerFrame } from "@liveplace/protocol";
import type { Result } from "@liveplace/shared";

type ErrorCode = Extract<ServerFrame, { t: "error" }>["code"];
type WelcomeFrame = Extract<ServerFrame, { t: "welcome" }>;

export type Pixel = Placement["pixels"][number];
export type ServerGauge = AckFrame["gauge"];
// `closed` : la connexion est tombée avant l'ack.
export type PlaceResult = Result<AckFrame, ErrorCode | "closed">;

// La case inspectée (CDC 2026) : en attente de la réponse, avec son auteur, ou jamais posée.
export type Inspection =
  | { status: "loading"; x: number; y: number }
  | { status: "found"; x: number; y: number; entry: InspectEntry }
  | { status: "empty"; x: number; y: number };

export type CanvasView = {
  status: "connecting" | "live" | "closed";
  width: number;
  height: number;
  palette: readonly string[];
  version: number;
  role?: Role;
  userId?: string; // absent pour un invité
  displayName?: string; // absent pour un invité
  params?: WelcomeFrame["params"];
  gauge: ServerGauge | null; // `null` pour un invité
  lastError: ErrorCode | null;
  inspection: Inspection | null;
  pixels: Uint8Array; // un octet par case, l'index de palette (§4.3)
};

export type CanvasStore = {
  subscribe(listener: () => void): () => void; // la forme qu'attend `useSyncExternalStore`
  getView(): CanvasView;
  // Pose optimiste (§9.3) : les pixels changent tout de suite, et la promesse se résout sur l'ack du même `requestId`.
  placeBatch(pixels: readonly Pixel[]): Promise<PlaceResult>;
  inspect(x: number, y: number): void;
  closeInspection(): void;
  close(): void;
};

// Fourni aux routes par le contexte du routeur : `ui/` ouvre un canvas sans connaître `net/`.
export type CanvasOpener = (canvasId: string) => CanvasStore;

// Un lot envoyé, pas encore confirmé : de quoi rendre à chaque pixel sa couleur d'avant.
type PendingBatch = {
  offsets: number[];
  previousColorIndexes: number[];
  touched: Set<number>; // cases qu'une frame `cells` a écrites depuis : elle fait foi
  resolve(result: PlaceResult): void;
};

const toInspection = ({ x, y, entry }: Extract<ServerFrame, { t: "inspected" }>): Inspection =>
  entry ? { status: "found", x, y, entry } : { status: "empty", x, y };

export function createCanvasStore(canvasId: string, transport: Transport): CanvasStore {
  let view: CanvasView = {
    status: "connecting",
    width: 0,
    height: 0,
    palette: [],
    version: 0,
    gauge: null,
    lastError: null,
    inspection: null,
    pixels: new Uint8Array(0),
  };
  const listeners = new Set<() => void>();
  const pending = new Map<string, PendingBatch>();
  let inspectRequestId: string | null = null; // seule la dernière inspection attend sa réponse

  // Un nouvel objet à chaque changement : `useSyncExternalStore` compare les références.
  const publish = (next: Partial<CanvasView>): void => {
    view = { ...view, ...next };
    for (const listener of listeners) listener();
  };

  // Le seul chemin d'écriture des cases venues du serveur : flux live, et plus tard resync et vue OBS (§9.2).
  const apply = (frame: CellsFrame): void => {
    for (const cell of frame.cells) {
      const offset = toStateOffset(cell.x, cell.y, view.width);
      view.pixels[offset] = cell.colorIndex;
      for (const batch of pending.values()) if (batch.offsets.includes(offset)) batch.touched.add(offset);
    }
    publish({ version: frame.toVersion });
  };

  const restore = (batch: PendingBatch, indexes: readonly number[]): void => {
    for (const index of indexes) {
      const offset = batch.offsets[index];
      const previous = batch.previousColorIndexes[index];
      if (offset !== undefined && previous !== undefined && !batch.touched.has(offset))
        view.pixels[offset] = previous;
    }
  };

  // Sans ack (erreur ou coupure), aucun pixel n'est confirmé : tous reprennent leur couleur.
  const settleAllPending = (result: PlaceResult): void => {
    for (const batch of pending.values()) {
      restore(
        batch,
        batch.offsets.map((_, index) => index),
      );
      batch.resolve(result);
    }
    pending.clear();
  };

  const acknowledge = (ack: AckFrame): void => {
    const batch = pending.get(ack.requestId);
    if (batch) {
      pending.delete(ack.requestId);
      restore(
        batch,
        ack.rejected.map((rejected) => rejected.index),
      );
      batch.resolve({ ok: true, value: ack });
    }
    publish({ gauge: ack.gauge, lastError: null });
  };

  const welcomeView = (frame: WelcomeFrame): Partial<CanvasView> => {
    const { width, height } = frame.canvas;
    const { userId, displayName, role } = frame.you;
    return {
      status: "live",
      width,
      height,
      palette: frame.palette,
      version: frame.version,
      role,
      params: frame.params,
      gauge: frame.gauge ?? null,
      ...(userId ? { userId } : {}),
      ...(displayName ? { displayName } : {}),
      pixels: new Uint8Array(width * height),
    };
  };

  const onFrame = (frame: ServerFrame): void => {
    switch (frame.t) {
      case "welcome":
        publish(welcomeView(frame));
        break;
      case "cells":
        apply(frame);
        break;
      case "ack":
        acknowledge(frame);
        break;
      case "gauge":
        publish({ gauge: { charges: frame.charges, max: frame.max, nextRefillAt: frame.nextRefillAt } });
        break;
      case "inspected":
        if (frame.requestId !== inspectRequestId) break;
        inspectRequestId = null;
        publish({ inspection: toInspection(frame) });
        break;
      case "error":
        settleAllPending({ ok: false, error: frame.code });
        publish({ lastError: frame.code });
        break;
      default:
    }
  };

  transport.listen({
    onFrame,
    // Le snapshot suit le `welcome` : il remplace la copie entière (§6.1).
    onSnapshot: (state) => publish({ pixels: state.slice() }),
    onClose: () => {
      settleAllPending({ ok: false, error: "closed" });
      publish({ status: "closed" });
    },
  });
  transport.send({ t: "hello", protocolVersion: PROTOCOL_VERSION, canvasId, mode: "ui" });

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getView: () => view,
    placeBatch(pixels) {
      const requestId = crypto.randomUUID();
      const offsets = pixels.map(({ x, y }) => toStateOffset(x, y, view.width));
      const previousColorIndexes = offsets.map((offset) => view.pixels[offset] ?? 0);
      pixels.forEach(({ colorIndex }, index) => {
        const offset = offsets[index];
        if (offset !== undefined) view.pixels[offset] = colorIndex;
      });
      const placed = new Promise<PlaceResult>((resolve) => {
        pending.set(requestId, { offsets, previousColorIndexes, touched: new Set(), resolve });
      });
      publish({});
      transport.send({ t: "place", requestId, pixels: [...pixels] });
      return placed;
    },
    inspect(x, y) {
      inspectRequestId = crypto.randomUUID();
      publish({ inspection: { status: "loading", x, y } });
      transport.send({ t: "inspect", requestId: inspectRequestId, x, y });
    },
    closeInspection() {
      inspectRequestId = null;
      publish({ inspection: null });
    },
    close: () => transport.close(),
  };
}
