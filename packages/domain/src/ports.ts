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

// Une socket vue du gateway.
export interface ClientSocket {
  sendFrame(frame: ServerFrame): void;
  sendSnapshot(state: Uint8Array): void;
  close(code: number): void;
}
