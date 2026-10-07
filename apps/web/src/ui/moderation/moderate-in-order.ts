// Chaque action attend sa dernière tranche avant la suivante, et la première qui échoue arrête tout : une ligne de
// signalements se règle pose par pose (JOURNAL 2026-10-07).

import type { CanvasStore, ModerationAction, RequestResult } from "../../state/canvas-store";

export const moderateInOrder = async (
  canvas: Pick<CanvasStore, "moderate">,
  actions: readonly ModerationAction[],
): Promise<RequestResult<{ cells: number }>> => {
  let cells = 0;
  for (const action of actions) {
    const done = await canvas.moderate(action);
    if (!done.ok) return done;
    cells += done.value.cells;
  }
  return { ok: true, value: { cells } };
};
