// La section Tout LivePlace de la fenêtre Développeur (écart §4.3, JOURNAL 2026-10-06 et 2026-10-07), de haut en bas : le choix
// du jour (JOURNAL 2026-10-14), les chiffres de l'instant, l'audience, les canvas, puis l'historique. L'audience et les canvas se
// mettent côte à côte quand la place le permet. L'affichage seul : `LiveActivitySection` la branche sur le store.

import type { ActivityPeriod, Timestamp } from "@liveplace/domain";
import { useState } from "react";
import type { ActivityWatchView } from "../../state/activity-watch";
import { CanvasActivityCard } from "../design/canvas-activity-card";
import { SkeletonBlock, SkeletonSwap, SkeletonTiles } from "../design/skeleton";
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
import { toDayChoice } from "./day-choice";
import { DaySwitch } from "./day-switch";
import { HistoryBlock, type ShownChart, type ShownHistory } from "./history-block";
import { PastActivityDay } from "./past-activity-day";

export type ActivitySectionProps = {
  view: ActivityWatchView;
  nowMs: Timestamp; // « depuis 12 min »
  onSelectPeriod: (period: ActivityPeriod) => void;
  onSelectDay: (dayAt: Timestamp | undefined) => void; // `undefined` : aujourd'hui
};

const NowBlock = ({ view }: { view: ActivityWatchView }) => (
  <SkeletonSwap isLoading={!view.activity} skeleton={<SkeletonTiles />}>
    {view.activity && (
      <StatTiles>
        <StatTile
          label="Personnes connectées"
          value={formatCount(view.activity.now.people)}
          note={guestsNote(view.activity.now.guests)}
        />
        <StatTile label="Fresques streamées" value={formatCount(view.activity.now.streamed)} />
        <StatTile label="Pixels de la dernière minute" value={formatCount(view.activity.now.pixels)} />
        <StatTile label="Nouveaux comptes aujourd'hui" value={formatCount(view.activity.now.signups)} />
      </StatTiles>
    )}
  </SkeletonSwap>
);

const AudienceBlock = ({ view }: { view: ActivityWatchView }) => (
  <SkeletonSwap isLoading={!view.activity} skeleton={<SkeletonBlock shape="area" />}>
    {view.activity && (
      <StatTable
        caption="L'audience d'aujourd'hui et des 30 derniers jours"
        columns={AUDIENCE_COLUMNS}
        rows={toAudienceRows(view.activity.audience)}
      />
    )}
  </SkeletonSwap>
);

const CanvasesBlock = ({ view, nowMs }: Pick<ActivitySectionProps, "view" | "nowMs">) => {
  const [openCanvasIds, setOpenCanvasIds] = useState<ReadonlySet<string>>(new Set());
  const toggle = (canvasId: string) =>
    setOpenCanvasIds((shown) => {
      const next = new Set(shown);
      if (!next.delete(canvasId)) next.add(canvasId);
      return next;
    });
  return (
    <SkeletonSwap isLoading={!view.activity} skeleton={<SkeletonBlock shape="area" />} hasOwnArrival>
      {view.activity &&
        (view.activity.canvases.length === 0 ? (
          <span className="lp-type-body lp-muted">Personne sur LivePlace en ce moment.</span>
        ) : (
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
        ))}
    </SkeletonSwap>
  );
};

// Stable d'un rendu à l'autre : les courbes ne se recalculent qu'avec l'historique.
const toChart = ({ points, period }: ShownHistory): ShownChart => ({
  lines: chartLinesFor(period),
  slots: toActivitySlots(points, period, Date.now()),
});

// Aujourd'hui, en direct : les chiffres de l'instant, l'audience, les canvas, et les courbes de la période choisie.
const TodayBlocks = ({ view, nowMs, onSelectPeriod }: Omit<ActivitySectionProps, "onSelectDay">) => (
  <>
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
  </>
);

// JOURNAL 2026-10-14 : le choix du jour en tête ; un jour passé remplace l'instant et ses courbes glissantes.
export const ActivitySection = ({ view, nowMs, onSelectPeriod, onSelectDay }: ActivitySectionProps) => (
  <div className="lp-window-layout">
    <DaySwitch choice={toDayChoice(view.past?.dayAt, view.firstDayAt, nowMs)} onSelect={onSelectDay} />
    {view.past ? (
      <PastActivityDay past={view.past} nowMs={nowMs} />
    ) : (
      <TodayBlocks view={view} nowMs={nowMs} onSelectPeriod={onSelectPeriod} />
    )}
  </div>
);
