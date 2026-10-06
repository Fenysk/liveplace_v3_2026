// La section Activité de la fenêtre Développeur (écart §4.3, JOURNAL 2026-10-06), de haut en bas : les chiffres de
// l'instant, les canvas, puis l'historique. L'affichage seul : `LiveActivitySection` la branche sur le store.

import type { ActivityPeriod, Timestamp } from "@liveplace/domain";
import type { ActivityPoint } from "@liveplace/domain/ports";
import { useMemo, useRef, useState } from "react";
import type { ActivityWatchView } from "../../state/activity-watch";
import { CanvasActivityCard } from "../design/canvas-activity-card";
import { Segmented } from "../design/segmented";
import { StatTile, StatTiles } from "../design/stat-tile";
import { TimeCharts } from "../design/time-charts";
import { formatCount, guestsNote, PERIOD_OPTIONS, toCanvasActivityCard } from "./activity-labels";
import { CHART_LINES, toActivitySlots } from "./activity-slots";

export type ActivitySectionProps = {
  view: ActivityWatchView;
  nowMs: Timestamp; // « depuis 12 min »
  onSelectPeriod: (period: ActivityPeriod) => void;
};

const LOADING = <span className="lp-type-caption lp-muted">Chargement…</span>;

type ShownHistory = { points: readonly ActivityPoint[]; period: ActivityPeriod };

// Pendant le chargement d'une autre période, les courbes d'avant restent, grisées : rien ne saute (dataviz).
const useShownHistory = (view: ActivityWatchView): ShownHistory | null => {
  const shown = useRef<ShownHistory | null>(null);
  if (view.history.status === "ready" && shown.current?.points !== view.history.points)
    shown.current = { points: view.history.points, period: view.period };
  return shown.current;
};

const NowBlock = ({ view }: { view: ActivityWatchView }) => {
  if (!view.activity) return LOADING;
  const { people, guests, streamed, pixels, signups } = view.activity.now;
  return (
    <StatTiles>
      <StatTile label="Personnes connectées" value={formatCount(people)} note={guestsNote(guests)} />
      <StatTile label="Canvas streamés" value={formatCount(streamed)} />
      <StatTile label="Pixels de la dernière minute" value={formatCount(pixels)} />
      <StatTile label="Nouveaux comptes aujourd'hui" value={formatCount(signups)} />
    </StatTiles>
  );
};

const CanvasesBlock = ({ view, nowMs }: Pick<ActivitySectionProps, "view" | "nowMs">) => {
  const [openCanvasIds, setOpenCanvasIds] = useState<ReadonlySet<string>>(new Set());
  const toggle = (canvasId: string) =>
    setOpenCanvasIds((shown) => {
      const next = new Set(shown);
      if (!next.delete(canvasId)) next.add(canvasId);
      return next;
    });
  if (!view.activity) return LOADING;
  if (view.activity.canvases.length === 0)
    return <span className="lp-type-body lp-muted">Personne sur LivePlace en ce moment.</span>;
  return (
    <div>
      {view.activity.canvases.map((canvas) => (
        <CanvasActivityCard
          key={canvas.canvasId}
          {...toCanvasActivityCard(canvas, nowMs)}
          isOpen={openCanvasIds.has(canvas.canvasId)}
          onToggle={() => toggle(canvas.canvasId)}
        />
      ))}
    </div>
  );
};

const HistoryBlock = ({ view, onSelectPeriod }: Pick<ActivitySectionProps, "view" | "onSelectPeriod">) => {
  const shown = useShownHistory(view);
  // L'axe se recalcule à chaque relecture, chaque minute : pas à chaque frame de l'instant.
  const slots = useMemo(
    () => (shown ? toActivitySlots(shown.points, shown.period, Date.now()) : null),
    [shown],
  );
  return (
    <>
      <Segmented label="Période" options={PERIOD_OPTIONS} value={view.period} onSelect={onSelectPeriod} />
      {view.history.status === "failed" && (
        <span className="lp-type-caption lp-danger">
          L'historique n'a pas pu se charger. Il se relit dans une minute.
        </span>
      )}
      {slots && (
        <TimeCharts
          lines={CHART_LINES}
          slots={slots}
          emptyText="Aucun point sur cette période."
          isLoading={view.history.status !== "ready"}
        />
      )}
      {!slots && view.history.status === "loading" && LOADING}
    </>
  );
};

export const ActivitySection = ({ view, nowMs, onSelectPeriod }: ActivitySectionProps) => (
  <>
    <section className="lp-setting">
      <h3 className="lp-type-title lp-window-subhead">Maintenant</h3>
      <NowBlock view={view} />
    </section>
    <section className="lp-setting">
      <h3 className="lp-type-title lp-window-subhead">Les canvas</h3>
      <CanvasesBlock view={view} nowMs={nowMs} />
    </section>
    <section className="lp-setting">
      <h3 className="lp-type-title lp-window-subhead">L'historique</h3>
      <HistoryBlock view={view} onSelectPeriod={onSelectPeriod} />
    </section>
  </>
);
