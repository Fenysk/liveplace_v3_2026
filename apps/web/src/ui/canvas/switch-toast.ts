// Le toast des viewers quand le streamer change de canvas (Écart §15, JOURNAL 2026-10-06) : ils passent seuls sur le
// canvas actif, sans recharger, et un toast court le dit. Celui qui l'a demandé a son propre toast (« Fresque archivée »).

import type { CanvasView } from "../../state/canvas-store";
import type { Locale } from "../locale/locale";
import { CANVAS_TEXTS } from "./canvas-texts";

type Seen = Pick<CanvasView, "status" | "isArchived">;

// Seulement un changement vu en direct : une page qui arrive sur un canvas déjà archivé ne le « voit » pas changer.
export const shouldAnnounceSwitch = (before: Seen, after: Seen, hasAskedHere: boolean): boolean =>
  before.status === "live" &&
  after.status === "live" &&
  !before.isArchived &&
  after.isArchived &&
  !hasAskedHere;

// `draftSize` : ce que le viewer a dans son brouillon à cet instant, lu avant que son store se ferme. Un brouillon non
// vide ne suit pas : il reste sur l'ancien canvas, et le toast le dit.
type SwitchContext = { hasAskedHere: boolean; ownerName: string; draftSize: number };

// Vrai d'un archivage comme d'une réouverture : le streamer a changé de canvas, la phrase ne dit rien de plus.
export function switchToast(
  before: Seen,
  after: Seen,
  { hasAskedHere, ownerName, draftSize }: SwitchContext,
  locale: Locale,
): string | null {
  if (!shouldAnnounceSwitch(before, after, hasAskedHere)) return null;
  return CANVAS_TEXTS[locale].switched({ ownerName, hasDraft: draftSize > 0 });
}
