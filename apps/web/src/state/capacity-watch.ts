// La section Capacité de la fenêtre Développeur (écart §4.2, JOURNAL 2026-10-07) : la capacité, que le gateway pousse toutes
// les 2 s tant qu'elle est ouverte, et l'historique d'une période, redemandé chaque minute. Le pendant de `activity-watch.ts`,
// avec ses propres frames. Le web affiche, le gateway décide : pour tout autre compte, rien ne revient.

import type { ActivityPeriod } from "@liveplace/domain";
import type { CapacityFrame, CapacityHistory } from "@liveplace/domain/ports";
import { type ActivityClock, HISTORY_REFRESH_MS } from "./activity-watch";
import type { CanvasStore } from "./canvas-store";

// Du store du canvas, ce que la section lit et appelle : un ajout au store n'a pas à toucher ses tests.
export type CapacityWatchCanvas = Pick<
  CanvasStore,
  "watchCapacity" | "listCapacityHistory" | "listenCapacity"
>;

export type CapacityHistoryView =
  | { status: "loading" }
  | ({ status: "ready" } & Readonly<CapacityHistory>)
  | { status: "failed" };

export type CapacityWatchView = {
  capacity: CapacityFrame | null; // `null` jusqu'à la première frame de chaque ouverture
  period: ActivityPeriod;
  history: CapacityHistoryView;
};

export type CapacityWatch = {
  subscribe(listener: () => void): () => void; // la forme qu'attend `useSyncExternalStore`
  getView(): CapacityWatchView;
  open(): void;
  close(): void;
  selectPeriod(period: ActivityPeriod): void;
  dispose(): void;
};

export function createCapacityWatch(canvas: CapacityWatchCanvas, clock: ActivityClock): CapacityWatch {
  let view: CapacityWatchView = { capacity: null, period: "day", history: { status: "loading" } };
  const listeners = new Set<() => void>();
  let isOpen = false;
  let stopRefresh = (): void => undefined;
  let lastRequest = 0; // seule la dernière demande d'historique se montre

  const publish = (next: Partial<CapacityWatchView>): void => {
    view = { ...view, ...next };
    for (const listener of listeners) listener();
  };

  // Une relecture qui échoue garde les courbes montrées : une coupure ne les efface pas.
  const listHistory = (): void => {
    const request = ++lastRequest;
    void canvas.listCapacityHistory(view.period).then((result) => {
      if (request !== lastRequest) return;
      if (result.ok) publish({ history: { status: "ready", ...result.value } });
      else if (view.history.status !== "ready") publish({ history: { status: "failed" } });
    });
  };

  const unlisten = canvas.listenCapacity((frame) => {
    if (isOpen) publish({ capacity: frame });
  });

  const close = (): void => {
    if (!isOpen) return;
    isOpen = false;
    stopRefresh();
    canvas.watchCapacity(false);
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getView: () => view,
    open() {
      if (isOpen) return;
      isOpen = true;
      publish({ capacity: null });
      canvas.watchCapacity(true);
      listHistory();
      stopRefresh = clock.repeat(HISTORY_REFRESH_MS, listHistory);
    },
    close,
    selectPeriod(period) {
      publish({ period, history: { status: "loading" } });
      if (isOpen) listHistory();
    },
    dispose() {
      close();
      unlisten();
    },
  };
}
