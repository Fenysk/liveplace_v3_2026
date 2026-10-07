// La fenêtre Développeur (écart §4.2, JOURNAL 2026-10-06 et 2026-10-07) : les chiffres de l'instant, que le gateway
// pousse toutes les 2 s tant qu'elle est ouverte, et l'historique d'une période, redemandé chaque minute. Une seule
// écoute pour ses deux sections : Ce canvas et Tout LivePlace lisent la même vue.
// Le web affiche, le gateway décide : pour tout autre compte, rien ne revient.

import type { ActivityPeriod } from "@liveplace/domain";
import type { ActivityFrame, ActivityHistory } from "@liveplace/domain/ports";
import type { CanvasStore } from "./canvas-store";

export const HISTORY_REFRESH_MS = 60_000; // la capacité relit son historique à la même cadence

// Du store du canvas, ce que la section lit et appelle : un ajout au store n'a pas à toucher ses tests.
export type ActivityWatchCanvas = Pick<
  CanvasStore,
  "watchActivity" | "listActivityHistory" | "listenActivity"
>;

// Injectée pour les tests : un minuteur qu'on peut arrêter.
export type ActivityClock = { repeat(ms: number, run: () => void): () => void };

// `canvasPoints` : ceux du canvas de la socket ; absents, le gateway est d'avant.
export type ActivityHistoryView =
  | { status: "loading" }
  | ({ status: "ready" } & Readonly<ActivityHistory>)
  | { status: "failed" };

export type ActivityWatchView = {
  activity: ActivityFrame | null; // `null` jusqu'à la première frame de chaque ouverture
  period: ActivityPeriod;
  history: ActivityHistoryView;
};

export type ActivityWatch = {
  subscribe(listener: () => void): () => void; // la forme qu'attend `useSyncExternalStore`
  getView(): ActivityWatchView;
  open(): void;
  close(): void;
  selectPeriod(period: ActivityPeriod): void;
  dispose(): void;
};

export function createActivityWatch(canvas: ActivityWatchCanvas, clock: ActivityClock): ActivityWatch {
  let view: ActivityWatchView = { activity: null, period: "day", history: { status: "loading" } };
  const listeners = new Set<() => void>();
  let isOpen = false;
  let stopRefresh = (): void => undefined;
  let lastRequest = 0; // seule la dernière demande d'historique se montre

  const publish = (next: Partial<ActivityWatchView>): void => {
    view = { ...view, ...next };
    for (const listener of listeners) listener();
  };

  // Une relecture qui échoue garde les courbes montrées : une coupure ne les efface pas.
  const listHistory = (): void => {
    const request = ++lastRequest;
    void canvas.listActivityHistory(view.period).then((result) => {
      if (request !== lastRequest) return;
      if (result.ok) publish({ history: { status: "ready", ...result.value } });
      else if (view.history.status !== "ready") publish({ history: { status: "failed" } });
    });
  };

  const unlisten = canvas.listenActivity((frame) => {
    if (isOpen) publish({ activity: frame });
  });

  const close = (): void => {
    if (!isOpen) return;
    isOpen = false;
    stopRefresh();
    canvas.watchActivity(false);
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
      publish({ activity: null });
      canvas.watchActivity(true);
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
