// Ce que montrent la pill et la section Classement : le classement du store, rangé pour l'écran, avec qui regarde.

import { useMemo, useSyncExternalStore } from "react";
import type { CanvasStore } from "../../state/canvas-store";
import { type ScoreboardRows, toScoreboardRows } from "../../state/scoreboard";

export function useScoreboardRows(canvas: CanvasStore): ScoreboardRows {
  const { scoreboard, login, displayName, avatarUrl } = useSyncExternalStore(
    canvas.subscribe,
    canvas.getView,
    canvas.getView,
  );
  return useMemo(
    () => toScoreboardRows(scoreboard, login && displayName ? { login, displayName, avatarUrl } : undefined),
    [scoreboard, login, displayName, avatarUrl],
  );
}
