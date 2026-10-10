// La section Tout LivePlace de la fenêtre Développeur (écart §4.3, JOURNAL 2026-10-06 et 2026-10-07), de haut en bas : les
// chiffres de l'instant, l'audience, les canvas, puis l'historique. L'audience et les canvas se mettent côte à côte quand
// la place le permet. L'affichage seul : `LiveActivitySection` la branche sur le store.

import type { ActivityPeriod, Timestamp } from "@liveplace/domain";
import { useState } from "react";
import type { ActivityWatchView } from "../../state/activity-watch";
import { CanvasActivityCard } from "../design/canvas-activity-card";
import { StatTable } from "../design/stat-table";
import { StatTile, StatTiles } from "../design/stat-tile";
import {
  AUDIENCE_COLUMNS,
  formatCount,
  guestsNote,
  toAudienceRows,
  toCanvasActivityCard,
} from "./activity-labels";
import { chartLinesFor, toActivitySlots } from "./activity-slots";
import { HistoryBlock, LOADING, type ShownChart, type ShownHistory } from "./history-block";

export type ActivitySectionProps = {
  view: ActivityWatchView;
  nowMs: Timestamp; // « depuis 12 min »
  onSelectPeriod: (period: ActivityPeriod) => void;
};

const NowBlock = ({ view }: { view: ActivityWatchView }) => {
  if (!view.activity) return LOADING;
  const { people, guests, streamed, pixels, signups } = view.activity.now;
  return (
    <StatTiles>
      <StatTile label="Personnes connectées" value={formatCount(people)} note={guestsNote(guests)} />
      <StatTile label="Fresques streamées" value={formatCount(streamed)} />
      <StatTile label="Pixels de la dernière minute" value={formatCount(pixels)} />
      <StatTile label="Nouveaux comptes aujourd'hui" value={formatCount(signups)} />
    </StatTiles>
  );
};

const AudienceBlock = ({ view }: { view: ActivityWatchView }) =>
  view.activity ? (
    <StatTable
      caption="L'audience d'aujourd'hui et des 30 derniers jours"
      columns={AUDIENCE_COLUMNS}
      rows={toAudienceRows(view.activity.audience)}
    />
  ) : (
    LOADING
  );

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

// Stable d'un rendu à l'autre : les courbes ne se recalculent qu'avec l'historique.
const toChart = ({ points, period }: ShownHistory): ShownChart => ({
  lines: chartLinesFor(period),
  slots: toActivitySlots(points, period, Date.now()),
});

export const ActivitySection = ({ view, nowMs, onSelectPeriod }: ActivitySectionProps) => (
  <div className="lp-window-layout">
    <section className="lp-setting">
      <h3 className="lp-type-title lp-window-subhead">Maintenant</h3>
      <NowBlock view={view} />
    </section>
    <div className="lp-window-split">
      <section className="lp-setting">
        <h3 className="lp-type-title lp-window-subhead">L'audience</h3>
        <AudienceBlock view={view} />
      </section>
      <section className="lp-setting">
        <h3 className="lp-type-title lp-window-subhead">Les fresques</h3>
        <CanvasesBlock view={view} nowMs={nowMs} />
      </section>
    </div>
    <section className="lp-setting">
      <h3 className="lp-type-title lp-window-subhead">L'historique</h3>
      <HistoryBlock
        view={view}
        onSelectPeriod={onSelectPeriod}
        toChart={toChart}
        emptyText="Aucun point sur cette période."
        unavailableText="L'historique n'est pas disponible."
      />
    </section>
  </div>
);
