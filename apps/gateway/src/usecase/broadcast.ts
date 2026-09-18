// L'ensemble de diffusion d'un canvas et son tick (§6.2, §6.3).

import type { CanvasCore, Unsubscribe } from "@liveplace/domain/ports";
import type { CellsFrame, Event } from "@liveplace/protocol";
import { conflate } from "./conflate";

export type CellsListener = (frame: CellsFrame) => void;

export interface Broadcast {
  join(canvasId: string, listener: CellsListener): Promise<void>;
  leave(canvasId: string, listener: CellsListener): Promise<void>;
  tick(): void;
}

type CanvasBroadcast = {
  listeners: Set<CellsListener>;
  pendingEvents: Event[];
  subscription: Promise<Unsubscribe>;
};

export function createBroadcast(core: Pick<CanvasCore, "subscribe">): Broadcast {
  const canvases = new Map<string, CanvasBroadcast>();

  const start = (canvasId: string): CanvasBroadcast => {
    const canvas: CanvasBroadcast = {
      listeners: new Set(),
      pendingEvents: [],
      subscription: core.subscribe(canvasId, (message) => canvas.pendingEvents.push(message.e)),
    };
    canvases.set(canvasId, canvas);
    return canvas;
  };

  return {
    // S'abonner avant que l'appelant lise l'état : le pub/sub n'a aucune mémoire (§6.1).
    async join(canvasId, listener) {
      const canvas = canvases.get(canvasId) ?? start(canvasId);
      canvas.listeners.add(listener);
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
        const frame = conflate(canvas.pendingEvents);
        canvas.pendingEvents = [];
        if (!frame) continue;
        for (const listener of canvas.listeners) listener(frame);
      }
    },
  };
}
