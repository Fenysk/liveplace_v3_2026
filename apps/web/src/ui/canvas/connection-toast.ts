// Le toast de la connexion de la page (CDC 2026, Toasts) : perdue, puis revenue.

import type { CanvasView } from "../../state/canvas-store";
import type { ToastTone } from "../design/toast";

export const CONNECTION_LOST_TOAST = "Connexion perdue : la page se reconnecte.";
export const RECONNECTED_TOAST = "Reconnecté";

type Connection = Pick<CanvasView, "status">;

export function connectionToast(
  before: Connection,
  after: Connection,
): { tone: ToastTone; text: string } | null {
  if (before.status === "live" && after.status === "reconnecting")
    return { tone: "error", text: CONNECTION_LOST_TOAST };
  if (before.status === "reconnecting" && after.status === "live")
    return { tone: "success", text: RECONNECTED_TOAST };
  return null;
}
