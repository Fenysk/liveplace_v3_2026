// Ce que montre la pill Inspection : la case inspectée, seulement en mode Vue (CDC 2026).

import { useSyncExternalStore } from "react";
import type { CanvasStore } from "../../state/canvas-store";
import type { DraftStore } from "../../state/draft-store";
import type { InspectionPillProps } from "./inspection-pill";

type InspectionPillStores = { canvas: CanvasStore; draft: DraftStore };

export function useInspectionPillProps({ canvas, draft }: InspectionPillStores): InspectionPillProps {
  const { inspection, palette } = useSyncExternalStore(canvas.subscribe, canvas.getView, canvas.getView);
  const { mode } = useSyncExternalStore(draft.subscribe, draft.getView, draft.getView);
  return {
    inspection: mode === "view" ? inspection : null,
    palette,
    // Relue à chaque nouvelle inspection : la date relative n'a pas besoin de courir.
    nowMs: Date.now(),
    onClose: () => canvas.closeInspection(),
  };
}
