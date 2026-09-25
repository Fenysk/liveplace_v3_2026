// L'ensemble de diffusion d'un canvas et son tick (§6.2, §6.3).

import type { CanvasCore, LiveControl, Unsubscribe } from "@liveplace/domain/ports";
import type { CellsFrame, Event } from "@liveplace/protocol";
import { conflate } from "./conflate";

export type CellsListener = (frame: CellsFrame) => void;
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
  subscription: Promise<Unsubscribe>;
};

export function createBroadcast(core: Pick<CanvasCore, "subscribe">): Broadcast {
  const canvases = new Map<string, CanvasBroadcast>();

  const start = (canvasId: string): CanvasBroadcast => {
    const canvas: CanvasBroadcast = {
      listeners: new Map(),
      pendingEvents: [],
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
        const frame = conflate(canvas.pendingEvents);
        canvas.pendingEvents = [];
        if (!frame) continue;
        for (const listener of canvas.listeners.keys()) listener(frame);
      }
    },
  };
}
