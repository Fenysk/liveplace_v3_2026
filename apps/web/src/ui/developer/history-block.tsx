// Le bloc de l'historique des sections de la fenêtre Développeur (écart §4.3, JOURNAL 2026-10-06 et 2026-10-07) : le choix de
// la période, puis les courbes. Ce que les courbes montrent, tout LivePlace, un canvas ou la capacité, vient de `toChart`.

import type { ActivityPeriod } from "@liveplace/domain";
import type { ActivityHistory } from "@liveplace/domain/ports";
import { useMemo, useRef } from "react";
import { Segmented } from "../design/segmented";
import { type ChartSlot, type TimeChartLine, TimeCharts } from "../design/time-charts";
import { PERIOD_OPTIONS } from "./activity-labels";

export const LOADING = <span className="lp-type-caption lp-muted">Chargement…</span>;

// Ce que la section regarde : la période choisie, et l'historique qui en vient, en chargement, prêt ou en échec. Celui de
// l'activité et celui de la capacité ont cette forme, avec leurs propres points.
export type WatchedHistory<History> = {
  period: ActivityPeriod;
  history: { status: "loading" } | ({ status: "ready" } & Readonly<History>) | { status: "failed" };
};

// Les points montrés, avec la période dont ils viennent. `canvasPoints` à `undefined` : le gateway est d'avant.
export type ShownHistory<History = ActivityHistory> = { status: "ready" } & Readonly<History> & {
    period: ActivityPeriod;
  };

export type ShownChart = { lines: readonly TimeChartLine[]; slots: readonly ChartSlot[] };

// Pendant le chargement d'une autre période, les courbes d'avant restent, grisées : rien ne saute (dataviz).
const useShownHistory = <History,>(view: WatchedHistory<History>): ShownHistory<History> | null => {
  const shown = useRef<ShownHistory<History> | null>(null);
  const source = useRef<object | null>(null);
  if (view.history.status === "ready" && source.current !== view.history) {
    source.current = view.history;
    shown.current = { ...view.history, period: view.period };
  }
  return shown.current;
};

type HistoryBlockProps<History> = {
  view: WatchedHistory<History>;
  onSelectPeriod: (period: ActivityPeriod) => void;
  // L'axe se recalcule à chaque relecture, chaque minute : pas à chaque frame de l'instant. Une fonction stable, qui rend
  // `null` quand l'historique à montrer n'existe pas.
  toChart: (shown: ShownHistory<History>) => ShownChart | null;
  emptyText: string; // aucun point sur toute la période
  unavailableText: string; // `toChart` n'a rien à montrer
};

export const HistoryBlock = <History,>({
  view,
  onSelectPeriod,
  toChart,
  emptyText,
  unavailableText,
}: HistoryBlockProps<History>) => {
  const shown = useShownHistory(view);
  // Les courbes sont celles de la période des points montrés, pas de celle qu'on vient de choisir.
  const chart = useMemo(() => (shown ? toChart(shown) : null), [shown, toChart]);
  return (
    <>
      <Segmented label="Période" options={PERIOD_OPTIONS} value={view.period} onSelect={onSelectPeriod} />
      {view.history.status === "failed" && (
        <span className="lp-type-caption lp-danger">
          L'historique n'a pas pu se charger. Il se relit dans une minute.
        </span>
      )}
      {chart && (
        <TimeCharts
          lines={chart.lines}
          slots={chart.slots}
          emptyText={emptyText}
          isLoading={view.history.status !== "ready"}
        />
      )}
      {shown && !chart && <span className="lp-type-caption lp-muted">{unavailableText}</span>}
      {!shown && view.history.status === "loading" && LOADING}
    </>
  );
};
