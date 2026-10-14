// Les actions de modération d'une pose (Écart §8.1, JOURNAL 2026-10-12) : jamais sur les poses du streamer ni sur les siennes
// (maquette), ni sans identifiant (§4.3). La pill Inspection et la bulle d'aide qui les désigne lisent la même règle.

import type { InspectEntry } from "@liveplace/domain/ports";
import type { ModerationControls } from "./use-moderation";

// L'auteur de la pose quand on peut le modérer ; `undefined` sinon.
export const moderableUserId = (
  moderation: Pick<ModerationControls, "isProtected">,
  { userId }: Pick<InspectEntry, "userId">,
): string | undefined => (userId && !moderation.isProtected(userId) ? userId : undefined);
