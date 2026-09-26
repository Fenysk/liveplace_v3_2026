// L'ensemble de diffusion d'un canvas et son tick (§6.2, §6.3).

import type { CanvasCore, LiveControl, Unsubscribe } from "@liveplace/domain/ports";
import type { Event, ServerFrame } from "@liveplace/protocol";
import { conflate } from "./conflate";

// La frame telle qu'elle part : construite une fois par tick, le même objet pour chaque client du canvas.
export type CellsListener = (frame: Extract<ServerFrame, { t: "cells" }>) => void;
// Un message de contrôle de moderate.lua (§5.4) : ni tick ni conflation, il n'a aucune case.
export type ControlListener = (control: LiveControl) => void;

export interface Broadcast {
  join(canvasId: string, listener: CellsListener, onControl: ControlListener): Promise<void>;
  leave(canvasId: string, listener: CellsListener): Promise<void>;
  tick(): void;
}

type CanvasBroadcast = {
  listeners: Map<CellsListener, ControlListener>;
  pendingEvents: Event[];
  ticksWaited: number;
  subscription: Promise<Unsubscribe>;
};

// Écart D-13 (JOURNAL 2026-09-26) : un canvas n'est vidé qu'un tick sur N, N = ⌈clients / 500⌉, au plus 3.
const CLIENTS_PER_TICK = 500;
const MAX_TICKS_BETWEEN_FRAMES = 3;

const ticksBetweenFrames = (clients: number): number =>
  Math.min(MAX_TICKS_BETWEEN_FRAMES, Math.max(1, Math.ceil(clients / CLIENTS_PER_TICK)));

export function createBroadcast(core: Pick<CanvasCore, "subscribe">): Broadcast {
  const canvases = new Map<string, CanvasBroadcast>();

  const start = (canvasId: string): CanvasBroadcast => {
    const canvas: CanvasBroadcast = {
      listeners: new Map(),
      pendingEvents: [],
      ticksWaited: 0,
      subscription: core.subscribe(canvasId, (message) => {
        if ("e" in message) canvas.pendingEvents.push(message.e);
        else for (const onControl of canvas.listeners.values()) onControl(message.ctl);
      }),
    };
    canvases.set(canvasId, canvas);
    return canvas;
  };

  return {
    // S'abonner avant que l'appelant lise l'état : le pub/sub n'a aucune mémoire (§6.1).
    async join(canvasId, listener, onControl) {
      const canvas = canvases.get(canvasId) ?? start(canvasId);
      canvas.listeners.set(listener, onControl);
      await canvas.subscription;
    },

    async leave(canvasId, listener) {
      const canvas = canvases.get(canvasId);
      if (!canvas) return;
      canvas.listeners.delete(listener);
      if (canvas.listeners.size > 0) return;
      // Retiré de la table avant l'attente : un client qui revient pendant le désabonnement repart sur un abonnement neuf.
      canvases.delete(canvasId);
      const unsubscribe = await canvas.subscription;
      await unsubscribe();
    },

    tick() {
      for (const canvas of canvases.values()) {
        canvas.ticksWaited += 1;
        if (canvas.ticksWaited < ticksBetweenFrames(canvas.listeners.size)) continue;
        canvas.ticksWaited = 0;
        const conflated = conflate(canvas.pendingEvents);
        canvas.pendingEvents = [];
        if (!conflated) continue;
        const frame = { t: "cells" as const, ...conflated };
        for (const listener of canvas.listeners.keys()) listener(frame);
      }
    },
  };
}
