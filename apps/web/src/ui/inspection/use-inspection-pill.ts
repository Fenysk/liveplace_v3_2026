// Ce que montre la pill Inspection : la case inspectée, seulement en mode Vue (CDC 2026), et Signaler sa pose quand
// le gateway le permet (JOURNAL 2026-09-28).

import { useState, useSyncExternalStore } from "react";
import type { CanvasStore, Inspection } from "../../state/canvas-store";
import type { DraftStore } from "../../state/draft-store";
import type { ModerationControls } from "../moderation/use-moderation";
import type { InspectionPillProps, ReportControl } from "./inspection-pill";

type InspectionPillStores = { canvas: CanvasStore; draft: DraftStore };

type SentReport = Exclude<ReportControl["status"], "available">;

// Les poses signalées pendant la session, par `placementId` : la pill le dit en y revenant.
const useReports = (canvas: CanvasStore, inspection: Inspection | null): ReportControl | undefined => {
  const [sent, setSent] = useState<ReadonlyMap<string, SentReport>>(new Map());
  if (inspection?.status !== "found") return undefined;
  const { x, y, entry } = inspection;
  const status = sent.get(entry.placementId);
  if (!status && !entry.canReport) return undefined;
  const mark = (placementId: string, next: SentReport | null) =>
    setSent((shown) => {
      const marked = new Map(shown);
      if (next) marked.set(placementId, next);
      else marked.delete(placementId);
      return marked;
    });
  const onReport = () => {
    if (status) return;
    mark(entry.placementId, "sending");
    // Refusé (la case a changé, ou la pose ne se signale plus) : le bouton revient.
    void canvas
      .report(x, y, entry.placementId)
      .then((result) => mark(entry.placementId, result.ok ? "reported" : null));
  };
  return { status: status ?? "available", onReport };
};

export function useInspectionPillProps(
  { canvas, draft }: InspectionPillStores,
  moderation: ModerationControls | undefined,
): InspectionPillProps {
  const { inspection, palette } = useSyncExternalStore(canvas.subscribe, canvas.getView, canvas.getView);
  const { mode } = useSyncExternalStore(draft.subscribe, draft.getView, draft.getView);
  const shown = mode === "view" ? inspection : null;
  return {
    inspection: shown,
    palette,
    // Relue à chaque nouvelle inspection : la date relative n'a pas besoin de courir.
    nowMs: Date.now(),
    onClose: () => canvas.closeInspection(),
    report: useReports(canvas, shown),
    moderation,
  };
}
