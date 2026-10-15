// Cette fresque un jour passé (JOURNAL 2026-10-14), de haut en bas : ses chiffres du jour, son audience, puis ses courbes de
// minuit à minuit. Pas de « Qui est là » : la liste des connectés n'est jamais gardée. Son streamer, en tête, est celui de
// l'instant (`CanvasSection`). L'affichage seul : `LiveActivitySection` la branche sur le store.

import type { Timestamp } from "@liveplace/domain";
import type { ActivityDay } from "@liveplace/domain/ports";
import { useMemo } from "react";
import { SkeletonBlock, SkeletonTiles } from "../design/skeleton";
import { StatTable } from "../design/stat-table";
import { StatTile, StatTiles } from "../design/stat-tile";
import { formatCount, formatDayDate, formatDuration, toCanvasDayAudienceRows } from "./activity-labels";
import { canvasChartLinesFor, toCanvasDaySlots } from "./activity-slots";
import { DayCharts, type PastDay, PastDayFrame, useShownDay } from "./past-day";

// Stable tant que le jour est le même : les courbes ne se recalculent qu'avec lui.
const DayHistory = ({ day }: { day: ActivityDay }) => {
  const { grain, points } = day.here;
  const slots = useMemo(() => toCanvasDaySlots(points, grain, day.dayAt), [points, grain, day.dayAt]);
  return (
    <DayCharts
      lines={canvasChartLinesFor("day")}
      slots={slots}
      grain={grain}
      emptyText="Aucune activité sur cette fresque ce jour-là."
    />
  );
};

type PastCanvasDayProps = {
  past: PastDay;
  nowMs: Timestamp; // l'année de la date
};

export const PastCanvasDay = ({ past, nowMs }: PastCanvasDayProps) => {
  const shown = useShownDay(past);
  return (
    <PastDayFrame
      past={past}
      shown={shown}
      skeleton={
        <>
          <SkeletonTiles />
          <SkeletonBlock shape="area" />
        </>
      }
    >
      {(day) => {
        const { point } = day.here;
        // Aucun point : rien ne s'est passé sur cette fresque ce jour-là, il n'y a rien à compter ni à tracer.
        if (!point)
          return <span className="lp-type-body lp-muted">Aucune activité sur cette fresque ce jour-là.</span>;
        return (
          <>
            <section className="lp-setting">
              <h3 className="lp-type-title lp-window-subhead">Ce jour-là</h3>
              <StatTiles>
                <StatTile label="Pic de personnes connectées" value={formatCount(point.people)} />
                <StatTile label="Minutes streamées" value={formatDuration(point.streamedMinutes)} />
                <StatTile label="Pixels posés" value={formatCount(point.pixels)} />
                <StatTile label="Nouveaux comptes venus de sa page" value={formatCount(point.signups)} />
              </StatTiles>
            </section>
            <div className="lp-window-split">
              <section className="lp-setting">
                <h3 className="lp-type-title lp-window-subhead">L'audience</h3>
                <StatTable
                  caption="L'audience de cette fresque ce jour-là"
                  columns={[formatDayDate(day.dayAt, nowMs)]}
                  rows={toCanvasDayAudienceRows(point)}
                />
              </section>
            </div>
            <section className="lp-setting">
              <h3 className="lp-type-title lp-window-subhead">L'historique</h3>
              <DayHistory day={day} />
            </section>
          </>
        );
      }}
    </PastDayFrame>
  );
};
