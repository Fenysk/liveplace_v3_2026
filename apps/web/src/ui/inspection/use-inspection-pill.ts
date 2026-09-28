// Ce que montre la pill Inspection : la case inspectée, seulement en mode Vue (CDC 2026), et Signaler sa pose quand
// le gateway le permet (JOURNAL 2026-09-28), par la fenêtre de `useReport` (JOURNAL 2026-09-29).

import { useSyncExternalStore } from "react";
import type { CanvasStore } from "../../state/canvas-store";
import type { DraftStore } from "../../state/draft-store";
import type { ModerationControls } from "../moderation/use-moderation";
import type { InspectionPillProps, ReportControl } from "./inspection-pill";

type InspectionPillStores = { canvas: CanvasStore; draft: DraftStore };

export function useInspectionPillProps(
  { canvas, draft }: InspectionPillStores,
  moderation: ModerationControls | undefined,
  report: ReportControl | undefined,
): InspectionPillProps {
  const { inspection, palette } = useSyncExternalStore(canvas.subscribe, canvas.getView, canvas.getView);
  const { mode } = useSyncExternalStore(draft.subscribe, draft.getView, draft.getView);
  return {
    inspection: mode === "view" ? inspection : null,
    palette,
    // Relue à chaque nouvelle inspection : la date relative n'a pas besoin de courir.
    nowMs: Date.now(),
    onClose: () => canvas.closeInspection(),
    report,
    moderation,
  };
}
