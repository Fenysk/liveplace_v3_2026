// Écart §11.1 (JOURNAL 2026-10-04) : le bandeau d'une bêta, la branche qui y tourne ; jamais en prod ni dans OBS.

import { Badge } from "../design/badge";
import { useTexts } from "../locale/use-locale";
import { BETA_TEXTS } from "./beta-texts";

export const BetaBadge = ({ label }: { label: string | null }) => {
  const t = useTexts(BETA_TEXTS);
  return label ? (
    <div className="lp-beta-badge" aria-hidden="true">
      <Badge label={t.badge(label)} />
    </div>
  ) : null;
};
