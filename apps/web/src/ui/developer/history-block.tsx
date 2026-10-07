// Le bloc de l'historique des deux sections de la fenêtre Développeur (écart §4.3, JOURNAL 2026-10-06 et 2026-10-07) : le
// choix de la période, puis les courbes. Ce que les courbes montrent, tout LivePlace ou un canvas, vient de `toChart`.

import type { ActivityPeriod } from "@liveplace/domain";
import type { ActivityPoint, CanvasActivityPoint } from "@liveplace/domain/ports";
import { useMemo, useRef } from "react";
import type { ActivityWatchView } from "../../state/activity-watch";
import { Segmented } from "../design/segmented";
import { type ChartSlot, type TimeChartLine, TimeCharts } from "../design/time-charts";
import { PERIOD_OPTIONS } from "./activity-labels";

export const LOADING = <span className="lp-type-caption lp-muted">Chargement…</span>;

export type ShownHistory = {
  points: readonly ActivityPoint[];
  canvasPoints: readonly CanvasActivityPoint[] | undefined; // `undefined` : le gateway est d'avant
  period: ActivityPeriod;
};

export type ShownChart = { lines: readonly TimeChartLine[]; slots: readonly ChartSlot[] };

// Pendant le chargement d'une autre période, les courbes d'avant restent, grisées : rien ne saute (dataviz).
const useShownHistory = (view: ActivityWatchView): ShownHistory | null => {
  const shown = useRef<ShownHistory | null>(null);
  if (view.history.status === "ready" && shown.current?.points !== view.history.points)
    shown.current = {
      points: view.history.points,
      canvasPoints: view.history.canvasPoints,
      period: view.period,
    };
  return shown.current;
};

type HistoryBlockProps = {
  view: ActivityWatchView;
  onSelectPeriod: (period: ActivityPeriod) => void;
  // L'axe se recalcule à chaque relecture, chaque minute : pas à chaque frame de l'instant. Une fonction stable, qui rend
  // `null` quand l'historique à montrer n'existe pas.
  toChart: (shown: ShownHistory) => ShownChart | null;
  emptyText: string; // aucun point sur toute la période
  unavailableText: string; // `toChart` n'a rien à montrer
};

export const HistoryBlock = ({
  view,
  onSelectPeriod,
  toChart,
  emptyText,
  unavailableText,
}: HistoryBlockProps) => {
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
