// La section Capacité branchée sur le store du canvas : le suivi s'ouvre avec la section et se ferme avec elle (écart §4.2,
// JOURNAL 2026-10-07). Montée pour le seul développeur, à la place du suivi d'activité tant que Capacité est la section ouverte.

import { useEffect, useState, useSyncExternalStore } from "react";
import type { CanvasStore } from "../../state/canvas-store";
import { type CapacityWatch, createCapacityWatch } from "../../state/capacity-watch";
import { CapacitySection } from "./capacity-section";
import { browserClock } from "./live-activity-section";

const WatchedSection = ({ watch }: { watch: CapacityWatch }) => {
  const view = useSyncExternalStore(watch.subscribe, watch.getView, watch.getView);
  return <CapacitySection view={view} nowMs={Date.now()} onSelectPeriod={watch.selectPeriod} />;
};

type LiveCapacitySectionProps = { canvas: CanvasStore; isOpen: boolean };

export const LiveCapacitySection = ({ canvas, isOpen }: LiveCapacitySectionProps) => {
  const [watch, setWatch] = useState<CapacityWatch | null>(null);
  useEffect(() => {
    const created = createCapacityWatch(canvas, browserClock);
    setWatch(created);
    return () => created.dispose();
  }, [canvas]);
  useEffect(() => {
    if (isOpen) watch?.open();
    else watch?.close();
  }, [watch, isOpen]);
  return watch && <WatchedSection watch={watch} />;
};
