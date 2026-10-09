// Ce que dit la pill Dessin aux bulles d'aide (Écart §8.1, JOURNAL 2026-10-08) : si elle est en Vue ou en Dessin, la jauge
// qu'elle montre, le +1 qui attend. Une reprise de connexion garde ce que la pill montrait : la bulle attend, elle n'est pas close.

import type { HelpFacts } from "../../state/help-bubbles";
import type { DraftPillState } from "../draft/draft-pill";

type PillFacts = Pick<HelpFacts, "pill" | "charges" | "canClaim" | "isTouchTracing">;

const WITHOUT_PILL: PillFacts = {
  pill: undefined,
  charges: undefined,
  canClaim: false,
  isTouchTracing: false,
};

export function toPillFacts(state: DraftPillState): PillFacts {
  switch (state.kind) {
    case "reconnecting":
      return toPillFacts(state.shown);
    case "view":
      return { pill: "view", charges: state.gauge.charges, canClaim: state.canClaim, isTouchTracing: false };
    case "draft":
      return {
        pill: "draft",
        charges: state.gauge.charges,
        canClaim: false,
        isTouchTracing: state.isTouchTracing,
      };
    default:
      return WITHOUT_PILL;
  }
}
