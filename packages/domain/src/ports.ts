// Ports du système (§3.3). Écart §12.1 (JOURNAL 2026-09-16) : `index.ts` ne l'importe jamais.

import type { ClientFrame, Event, ServerFrame } from "@liveplace/protocol";
import type { Result } from "@liveplace/shared";
import type { CanvasMeta, Session, Timestamp } from "./index";

export type Placement = {
  userId: string;
  requestId: string;
  nowMs: Timestamp;
  pixels: Extract<ClientFrame, { t: "place" }>["pixels"];
};

export type AckFrame = Extract<ServerFrame, { t: "ack" }>;

export type Snapshot = { state: Uint8Array; version: number };

// Canal `cv:<id>:live`. La variante `ctl` arrive avec moderate.lua (§5.4).
export type LiveMessage = { e: Event };

export type Unsubscribe = () => Promise<void>;

export interface CanvasCore {
  createCanvas(canvasId: string, meta: CanvasMeta): Promise<void>;
  getCanvas(canvasId: string): Promise<CanvasMeta | null>; // `null` si absent ou pas prêt (§5.5).
  isModerator(canvasId: string, userId: string): Promise<boolean>;
  getSnapshot(canvasId: string): Promise<Snapshot>; // État et version lus ensemble (§6.1).
  place(canvasId: string, placement: Placement): Promise<Result<AckFrame, "canvas_not_found">>;
  subscribe(canvasId: string, onMessage: (message: LiveMessage) => void): Promise<Unsubscribe>;
}

// `null` = invité (§10.2).
export interface SessionVerifier {
  verify(cookieHeader: string | undefined): Promise<Session | null>;
}

// Une connexion vue de la socket : le pendant de `ClientSocket`, pour que l'infra n'importe pas le usecase.
export interface ClientConnection {
  receive(text: string): Promise<void>;
  close(): Promise<void>;
}

// Une socket vue du gateway.
export interface ClientSocket {
  sendFrame(frame: ServerFrame): void;
  sendSnapshot(state: Uint8Array): void;
  close(code: number): void;
}

// Ce que le gateway renvoie au web : les frames JSON, et le snapshot en binaire (§4.3).
export type TransportListeners = {
  onFrame(frame: ServerFrame): void;
  onSnapshot(state: Uint8Array): void;
  onClose(code: number): void;
};

// Le lien du web vers le gateway, vu du store : `net/` l'implémente, `state/` le reçoit (§9.2).
export interface Transport {
  send(frame: ClientFrame): void; // mis en attente tant que la connexion s'ouvre
  listen(listeners: TransportListeners): void;
  close(): void;
}
