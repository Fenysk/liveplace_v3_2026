// La fenêtre Développeur (écart §4.2, JOURNAL 2026-10-06 et 2026-10-07) : les chiffres de l'instant, que le gateway
// pousse toutes les 2 s tant qu'elle est ouverte, et l'historique d'une période, redemandé chaque minute. Une seule
// écoute pour ses deux sections : Ce canvas et Tout LivePlace lisent la même vue.
// Le web affiche, le gateway décide : pour tout autre compte, rien ne revient.

import type { ActivityPeriod, Timestamp } from "@liveplace/domain";
import type { ActivityDay, ActivityFrame, ActivityHistory } from "@liveplace/domain/ports";
import type { CanvasStore } from "./canvas-store";

export const HISTORY_REFRESH_MS = 60_000; // la capacité relit son historique à la même cadence

// Du store du canvas, ce que la section lit et appelle : un ajout au store n'a pas à toucher ses tests.
export type ActivityWatchCanvas = Pick<
  CanvasStore,
  "watchActivity" | "listActivityHistory" | "listActivityDay" | "listenActivity"
>;

// Injectée pour les tests : un minuteur qu'on peut arrêter.
export type ActivityClock = { repeat(ms: number, run: () => void): () => void };

// `canvasPoints` : ceux du canvas de la socket ; absents, le gateway est d'avant.
export type ActivityHistoryView =
  | { status: "loading" }
  | ({ status: "ready" } & Readonly<ActivityHistory>)
  | { status: "failed" };

// Un jour passé (JOURNAL 2026-10-14), lu une fois à son choix : ses nombres ne bougent plus.
export type ActivityDayView =
  | { status: "loading" }
  | ({ status: "ready" } & Readonly<ActivityDay>)
  | { status: "failed" };

export type ActivityWatchView = {
  activity: ActivityFrame | null; // `null` jusqu'à la première frame de chaque ouverture
  period: ActivityPeriod;
  history: ActivityHistoryView;
  firstDayAt?: Timestamp | undefined; // le plus ancien jour gardé, connu avec le premier historique
  // Le jour passé choisi, par le début de son jour de Paris, et sa lecture ; absent : aujourd'hui, en direct. Partagé par les
  // sections Cette fresque et Tout LivePlace, et remis à aujourd'hui à la fermeture.
  past?: { dayAt: Timestamp; day: ActivityDayView } | undefined;
};

export type ActivityWatch = {
  subscribe(listener: () => void): () => void; // la forme qu'attend `useSyncExternalStore`
  getView(): ActivityWatchView;
  open(): void;
  close(): void;
  selectPeriod(period: ActivityPeriod): void;
  selectDay(dayAt: Timestamp | undefined): void; // `undefined` : aujourd'hui
  dispose(): void;
};

export function createActivityWatch(canvas: ActivityWatchCanvas, clock: ActivityClock): ActivityWatch {
  let view: ActivityWatchView = { activity: null, period: "day", history: { status: "loading" } };
  const listeners = new Set<() => void>();
  let isOpen = false;
  let stopRefresh = (): void => undefined;
  let lastRequest = 0; // seule la dernière demande d'historique se montre
  let lastDayRequest = 0; // de même pour le jour passé

  const publish = (next: Partial<ActivityWatchView>): void => {
    view = { ...view, ...next };
    for (const listener of listeners) listener();
  };

  // Le plus ancien jour gardé vient avec l'historique et lui survit : il n'est pas dans les courbes montrées (JOURNAL 2026-10-14).
  const publishHistory = ({ firstDayAt, ...history }: ActivityHistory): void =>
    publish({
      history: { status: "ready", ...history },
      ...(firstDayAt === undefined ? {} : { firstDayAt }),
    });

  // Une relecture qui échoue garde les courbes montrées : une coupure ne les efface pas.
  const listHistory = (): void => {
    const request = ++lastRequest;
    void canvas.listActivityHistory(view.period).then((result) => {
      if (request !== lastRequest) return;
      if (result.ok) publishHistory(result.value);
      else if (view.history.status !== "ready") publish({ history: { status: "failed" } });
    });
  };

  // Un jour passé ne se relit pas à la minute : une fois, à son choix, et de nouveau quand on y revient.
  const listDay = (dayAt: Timestamp): void => {
    const request = ++lastDayRequest;
    void canvas.listActivityDay(dayAt).then((result) => {
      if (request !== lastDayRequest) return;
      publish({
        past: { dayAt, day: result.ok ? { status: "ready", ...result.value } : { status: "failed" } },
      });
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
    lastDayRequest++;
    publish({ past: undefined });
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
      if (view.past) listDay(view.past.dayAt);
    },
    close,
    selectPeriod(period) {
      publish({ period, history: { status: "loading" } });
      if (isOpen) listHistory();
    },
    selectDay(dayAt) {
      lastDayRequest++;
      publish({ past: dayAt === undefined ? undefined : { dayAt, day: { status: "loading" } } });
      if (dayAt !== undefined && isOpen) listDay(dayAt);
    },
    dispose() {
      close();
      unlisten();
    },
  };
}
