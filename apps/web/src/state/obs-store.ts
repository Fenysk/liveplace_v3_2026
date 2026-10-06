// L'image du stream (§9.5) : ce que la vue OBS montre, nourri par les arrivées du store du canvas, vidé par un seul
// minuteur réglé sur la prochaine case. Le store du canvas garde l'état réel ; celui-ci, ce que les viewers voient.

import { OBS_BACKGROUND, type ObsBackground, type Timestamp } from "@liveplace/domain";
import type { CanvasStore } from "./canvas-store";
import {
  createObsQueue,
  nextShowAt,
  type ObsQueue,
  queueCells,
  queueRecent,
  showDueCells,
} from "./obs-delay";

// Injectée pour les tests : l'heure, et un minuteur qu'on peut annuler.
export type ObsClock = { now(): Timestamp; wait(ms: number, run: () => void): () => void };

export type ObsView = {
  isReady: boolean; // après le premier snapshot : avant, rien à montrer
  width: number;
  height: number;
  palette: readonly string[];
  pixels: Uint8Array; // modifiés sur place : chaque changement publie une nouvelle vue
  background: ObsBackground; // JOURNAL 2026-09-29 : blanc, la vue OBS le peint sous ses pixels
};

export type ObsStore = {
  subscribe(listener: () => void): () => void; // la forme qu'attend `useSyncExternalStore`
  getView(): ObsView;
  dispose(): void;
};

// Du store du canvas, ce que la vue OBS lit : un ajout au store n'a pas à toucher ses tests.
export type ObsCanvas = Pick<CanvasStore, "subscribe" | "getView" | "listenArrivals">;

export function createObsStore(canvas: ObsCanvas, clock: ObsClock): ObsStore {
  const backgroundOf = (): ObsBackground => canvas.getView().params?.obsBackground ?? OBS_BACKGROUND;
  let view: ObsView = {
    isReady: false,
    width: 0,
    height: 0,
    palette: [],
    pixels: new Uint8Array(0),
    background: backgroundOf(),
  };
  let queue: ObsQueue | null = null;
  let cancelTimer = (): void => undefined;
  const listeners = new Set<() => void>();

  // Le délai du moment, reçu au `welcome` puis par la frame `obsDelay` (JOURNAL 2026-09-25).
  const delayMs = (): number => canvas.getView().params?.obsDelayMs ?? 0;
  let knownDelayMs = delayMs();

  const publish = (next: Partial<ObsView>): void => {
    view = { ...view, ...next };
    for (const listener of listeners) listener();
  };

  // Vider ce qui est dû, publier l'image, puis se régler sur la prochaine case.
  const showDue = (): void => {
    if (!queue) return;
    cancelTimer();
    showDueCells(queue, clock.now(), delayMs());
    const { width, height, palette } = canvas.getView();
    publish({ isReady: true, width, height, palette, pixels: queue.shown, background: backgroundOf() });
    const next = nextShowAt(queue, delayMs());
    if (next !== null) cancelTimer = clock.wait(Math.max(0, next - clock.now()), showDue);
  };

  const unlistenArrivals = canvas.listenArrivals((arrival) => {
    if (arrival.kind === "snapshot") {
      // Un snapshot remplace l'image, et la file repart de son `recent` (§9.5, règle 3).
      queue = createObsQueue(canvas.getView().width, arrival.pixels.slice());
      if (arrival.recent) queueRecent(queue, arrival.recent, clock.now(), delayMs());
    } else if (queue) queueCells(queue, arrival.frame, clock.now(), delayMs());
    showDue();
  });

  // Le délai change à chaud : ce qui attend suit le nouveau, sans que le streamer recharge sa source. Le fond aussi.
  const unsubscribe = canvas.subscribe(() => {
    if (backgroundOf() !== view.background) publish({ background: backgroundOf() });
    if (delayMs() === knownDelayMs) return;
    knownDelayMs = delayMs();
    showDue();
  });

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getView: () => view,
    dispose() {
      cancelTimer();
      unlistenArrivals();
      unsubscribe();
    },
  };
}
