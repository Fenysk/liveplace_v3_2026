// Tout LivePlace un jour passé (JOURNAL 2026-10-14), de haut en bas : les chiffres du jour, l'audience, les fresques actives
// ce jour-là avec leur streamer, puis ses courbes de minuit à minuit. Tout vient de ce que l'activité garde déjà : aucune liste de
// connectés, aucun live. L'affichage seul : `LiveActivitySection` la branche sur le store.

import type { Timestamp } from "@liveplace/domain";
import type { ActivityDay } from "@liveplace/domain/ports";
import { useMemo } from "react";
import { CanvasActivityCard } from "../design/canvas-activity-card";
import { SkeletonBlock, SkeletonTiles } from "../design/skeleton";
import { StatTable } from "../design/stat-table";
import { StatTile, StatTiles } from "../design/stat-tile";
import {
  formatCount,
  formatDayDate,
  sortDayCanvases,
  toDayAudienceRows,
  toDayCanvasCard,
} from "./activity-labels";
import { chartLinesFor, toDaySlots } from "./activity-slots";
import { DayCharts, type PastDay, PastDayFrame, useShownDay } from "./past-day";

const DayCanvases = ({ canvases }: Pick<ActivityDay, "canvases">) =>
  canvases.length === 0 ? (
    <span className="lp-type-body lp-muted">Aucune fresque active ce jour-là.</span>
  ) : (
    <div>
      {sortDayCanvases(canvases).map((canvas) => (
        <CanvasActivityCard key={canvas.canvasId} {...toDayCanvasCard(canvas)} />
      ))}
    </div>
  );

// Stable tant que le jour est le même : les courbes ne se recalculent qu'avec lui.
const DayHistory = ({ day }: { day: ActivityDay }) => {
  const slots = useMemo(() => toDaySlots(day.points, day.grain, day.dayAt), [day]);
  return (
    <DayCharts
      lines={chartLinesFor("day")}
      slots={slots}
      grain={day.grain}
      emptyText="Aucun point ce jour-là."
    />
  );
};

type PastActivityDayProps = {
  past: PastDay;
  nowMs: Timestamp; // l'année de la date
};

export const PastActivityDay = ({ past, nowMs }: PastActivityDayProps) => {
  const shown = useShownDay(past);
  return (
    <PastDayFrame
      past={past}
      shown={shown}
      skeleton={
        <>
          <SkeletonTiles />
          <SkeletonBlock shape="area" />
          <SkeletonBlock shape="area" />
        </>
      }
    >
      {(day) => (
        <>
          <section className="lp-setting">
            <h3 className="lp-type-title lp-window-subhead">Ce jour-là</h3>
            <StatTiles>
              <StatTile label="Pic de personnes connectées" value={formatCount(day.day?.people ?? 0)} />
              <StatTile label="Pic de fresques streamées" value={formatCount(day.day?.streamed ?? 0)} />
              <StatTile label="Pixels posés" value={formatCount(day.day?.pixels ?? 0)} />
              <StatTile label="Nouveaux comptes" value={formatCount(day.day?.signups ?? 0)} />
            </StatTiles>
          </section>
          <div className="lp-window-split">
            <section className="lp-setting">
              <h3 className="lp-type-title lp-window-subhead">L'audience</h3>
              <StatTable
                caption="L'audience de ce jour-là"
                columns={[formatDayDate(day.dayAt, nowMs)]}
                rows={toDayAudienceRows(day.day)}
              />
            </section>
            <section className="lp-setting">
              <h3 className="lp-type-title lp-window-subhead">Les fresques</h3>
              <DayCanvases canvases={day.canvases} />
            </section>
          </div>
          <section className="lp-setting">
            <h3 className="lp-type-title lp-window-subhead">L'historique</h3>
            <DayHistory day={day} />
          </section>
        </>
      )}
    </PastDayFrame>
  );
};
