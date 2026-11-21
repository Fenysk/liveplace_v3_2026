// Le toast d'un dessin fermé à un viewer (JOURNAL 2026-11-12, 2026-11-21) : l'événement dit son début ou sa fin, sinon le live du streamer.

import { charityGate } from "@liveplace/domain/charity-event";
import type { CharityEventState } from "@liveplace/domain/ports";
import { DRAFT_TEXTS } from "../draft/draft-texts";
import type { Locale } from "../locale/locale";

export function closedToast(
  charity: CharityEventState | undefined,
  ownerName: string,
  locale: Locale,
  nowMs: number,
): string {
  const gate = charityGate(charity, "viewer", nowMs);
  const texts = DRAFT_TEXTS[locale];
  if (!gate.isClosed) return texts.waitingForLive(ownerName);
  return gate.opensAt === undefined ? texts.eventOver : texts.waitingForEvent;
}
