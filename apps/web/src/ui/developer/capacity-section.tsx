// La section Capacité de la fenêtre Développeur (cahier des charges de la capacité, §1 ; JOURNAL 2026-10-07), de haut en bas :
// la saturation, les ressources rangées par maillon, puis l'historique. L'affichage seul : `LiveCapacitySection` la branche
// sur le store. Le web affiche, le gateway décide.

import type { ActivityPeriod, Timestamp } from "@liveplace/domain";
import type { CapacityFrame, CapacityHistory } from "@liveplace/domain/ports";
import type { CapacityWatchView } from "../../state/capacity-watch";
import { CapacityLinkRows, CapacityRow } from "../design/capacity-row";
import { SaturationFigure } from "../design/saturation-figure";
import { SkeletonBar, SkeletonBlock, SkeletonSwap } from "../design/skeleton";
import { toCapacityLinks, toSaturationView } from "./capacity-labels";
import { CAPACITY_LINES, toCapacitySlots } from "./capacity-slots";
import { HistoryBlock, type ShownChart, type ShownHistory } from "./history-block";

export type CapacitySectionProps = {
  view: CapacityWatchView;
  nowMs: Timestamp; // le mois d'un quota projeté
  onSelectPeriod: (period: ActivityPeriod) => void;
};

// Stable d'un rendu à l'autre : les courbes ne se recalculent qu'avec l'historique.
const toChart = ({ points, period }: ShownHistory<CapacityHistory>): ShownChart => ({
  lines: CAPACITY_LINES,
  slots: toCapacitySlots(points, period, Date.now()),
});

const LiveBlocks = ({ capacity, nowMs }: { capacity: CapacityFrame; nowMs: Timestamp }) => (
  <>
    <SaturationFigure {...toSaturationView(capacity.saturation, capacity.resources)} />
    <div className="lp-capacity-links">
      {toCapacityLinks(capacity.resources, nowMs, capacity.guards).map(({ link, title, detail, rows }) => (
        <CapacityLinkRows key={link} title={title} detail={detail}>
          {rows.map(({ id, name, note, state }) => (
            <CapacityRow key={id} name={name} note={note} state={state} />
          ))}
        </CapacityLinkRows>
      ))}
    </div>
  </>
);

// Le grand pourcentage de la saturation, puis la place des ressources.
const CapacitySkeleton = () => (
  <>
    <SkeletonBar text="display" width="short" />
    <SkeletonBlock shape="area" />
  </>
);

export const CapacitySection = ({ view, nowMs, onSelectPeriod }: CapacitySectionProps) => (
  <div className="lp-window-layout">
    <SkeletonSwap isLoading={!view.capacity} skeleton={<CapacitySkeleton />}>
      {view.capacity && <LiveBlocks capacity={view.capacity} nowMs={nowMs} />}
    </SkeletonSwap>
    <section className="lp-setting">
      <h3 className="lp-type-title lp-window-subhead">Historique</h3>
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
