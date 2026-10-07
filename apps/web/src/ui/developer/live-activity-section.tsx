// La fenêtre Développeur branchée sur le store du canvas : le suivi s'ouvre avec la fenêtre et se ferme avec elle, une seule
// écoute pour ses deux sections (écart §4.2, JOURNAL 2026-10-06 et 2026-10-07). Montée pour le seul développeur.

import { useEffect, useState, useSyncExternalStore } from "react";
import { type ActivityClock, type ActivityWatch, createActivityWatch } from "../../state/activity-watch";
import type { CanvasStore } from "../../state/canvas-store";
import { ActivitySection } from "./activity-section";
import { CanvasSection } from "./canvas-section";
import type { DeveloperSectionId } from "./developer-window";

const browserClock: ActivityClock = {
  repeat: (ms, run) => {
    const timer = setInterval(run, ms);
    return () => clearInterval(timer);
  },
};

type WatchedSectionProps = { watch: ActivityWatch; sectionId: DeveloperSectionId };

const WatchedSection = ({ watch, sectionId }: WatchedSectionProps) => {
  const view = useSyncExternalStore(watch.subscribe, watch.getView, watch.getView);
  const Section = sectionId === "here" ? CanvasSection : ActivitySection;
  return <Section view={view} nowMs={Date.now()} onSelectPeriod={watch.selectPeriod} />;
};

type LiveActivitySectionProps = { canvas: CanvasStore; isOpen: boolean; sectionId: DeveloperSectionId };

export const LiveActivitySection = ({ canvas, isOpen, sectionId }: LiveActivitySectionProps) => {
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
  return watch && <WatchedSection watch={watch} sectionId={sectionId} />;
};
