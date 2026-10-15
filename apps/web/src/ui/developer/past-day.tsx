// Ce que les jours passés de Cette fresque et de Tout LivePlace ont en commun (JOURNAL 2026-10-14) : le jour qui reste, grisé,
// pendant qu'un autre se charge, le squelette du premier chargement, l'échec, et les courbes d'un jour de minuit à minuit.

import type { ActivityDayGrain } from "@liveplace/domain";
import type { ActivityDay } from "@liveplace/domain/ports";
import { type ReactNode, useRef } from "react";
import type { ActivityWatchView } from "../../state/activity-watch";
import { classNames } from "../design/class-names";
import { SkeletonSwap } from "../design/skeleton";
import { type ChartSlot, type TimeChartLine, TimeCharts } from "../design/time-charts";
import { DAY_CURVES_GONE } from "./activity-labels";

export type PastDay = NonNullable<ActivityWatchView["past"]>;

// Pendant le chargement d'un autre jour, le jour d'avant reste, grisé : rien ne saute (comme les courbes d'une autre période).
export const pickShownDay = (shown: ActivityDay | null, past: PastDay): ActivityDay | null =>
  past.day.status === "ready" ? past.day : shown;

export const useShownDay = (past: PastDay): ActivityDay | null => {
  const shown = useRef<ActivityDay | null>(null);
  shown.current = pickShownDay(shown.current, past);
  return shown.current;
};

type PastDayFrameProps = {
  past: PastDay;
  shown: ActivityDay | null;
  skeleton: ReactNode; // la forme de ce qui vient, au premier chargement
  children: (shown: ActivityDay) => ReactNode;
};

export const PastDayFrame = ({ past, shown, skeleton, children }: PastDayFrameProps) => {
  const isStale = past.day.status !== "ready"; // un autre jour se charge, ou n'a pas pu l'être : celui d'avant reste
  return (
    <>
      {past.day.status === "failed" && (
        <span className="lp-type-caption lp-danger">
          Ce jour n'a pas pu se charger. Il se relit quand on y revient.
        </span>
      )}
      <SkeletonSwap isLoading={!shown && past.day.status === "loading"} skeleton={skeleton}>
        {shown && (
          <div
            className={classNames("lp-window-layout lp-day-content", isStale && "is-stale")}
            aria-busy={isStale}
          >
            {children(shown)}
          </div>
        )}
      </SkeletonSwap>
    </>
  );
};

type DayChartsProps = {
  lines: readonly TimeChartLine[];
  slots: readonly ChartSlot[]; // de minuit à minuit
  grain: ActivityDayGrain;
  emptyText: string; // aucun point ce jour-là
};

// Sans courbes gardées, la phrase le dit : seuls les totaux du jour restent.
export const DayCharts = ({ lines, slots, grain, emptyText }: DayChartsProps) =>
  grain === "none" ? (
    <span className="lp-type-caption lp-muted">{DAY_CURVES_GONE}</span>
  ) : (
    <TimeCharts lines={lines} slots={slots} emptyText={emptyText} />
  );
