// La section Activité branchée sur le store du canvas : le suivi s'ouvre avec la fenêtre et se ferme avec elle
// (écart §4.2, JOURNAL 2026-10-06). Montée pour le seul développeur.

import { useEffect, useState, useSyncExternalStore } from "react";
import { type ActivityClock, type ActivityWatch, createActivityWatch } from "../../state/activity-watch";
import type { CanvasStore } from "../../state/canvas-store";
import { ActivitySection } from "./activity-section";

const browserClock: ActivityClock = {
  repeat: (ms, run) => {
    const timer = setInterval(run, ms);
    return () => clearInterval(timer);
  },
};

const WatchedSection = ({ watch }: { watch: ActivityWatch }) => {
  const view = useSyncExternalStore(watch.subscribe, watch.getView, watch.getView);
  return <ActivitySection view={view} nowMs={Date.now()} onSelectPeriod={watch.selectPeriod} />;
};

type LiveActivitySectionProps = { canvas: CanvasStore; isOpen: boolean };

export const LiveActivitySection = ({ canvas, isOpen }: LiveActivitySectionProps) => {
  const [watch, setWatch] = useState<ActivityWatch | null>(null);
  useEffect(() => {
    const created = createActivityWatch(canvas, browserClock);
    setWatch(created);
    return () => created.dispose();
  }, [canvas]);
  useEffect(() => {
    if (isOpen) watch?.open();
    else watch?.close();
  }, [watch, isOpen]);
  return watch && <WatchedSection watch={watch} />;
};
