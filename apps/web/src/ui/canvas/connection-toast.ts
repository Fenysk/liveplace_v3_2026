// Le toast de la connexion de la page (CDC 2026, Toasts) : perdue, puis revenue.

import type { CanvasView } from "../../state/canvas-store";
import type { ToastTone } from "../design/toast";
import type { Locale } from "../locale/locale";
import { CANVAS_TEXTS } from "./canvas-texts";

type Connection = Pick<CanvasView, "status">;

// `isDeletingAccount` (CDC §8) : l'effacement du compte est lancé, le gateway ferme la socket (4001) et la page redevient celle
// d'un invité le temps de rentrer à l'accueil : une connexion perdue puis revenue serait un toast parasite.
export function connectionToast(
  before: Connection,
  after: Connection,
  locale: Locale,
  { isDeletingAccount }: { isDeletingAccount: boolean } = { isDeletingAccount: false },
): { tone: ToastTone; text: string } | null {
  if (isDeletingAccount) return null;
  if (before.status === "live" && after.status === "reconnecting")
    return { tone: "error", text: CANVAS_TEXTS[locale].connectionLost };
  if (before.status === "reconnecting" && after.status === "live")
    return { tone: "success", text: CANVAS_TEXTS[locale].reconnected };
  return null;
}
