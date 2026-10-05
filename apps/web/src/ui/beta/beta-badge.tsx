// Écart §11.1 (JOURNAL 2026-10-04) : le bandeau d'une bêta, la branche qui y tourne ; jamais en prod ni dans OBS.

import { Badge } from "../design/badge";

export const BetaBadge = ({ label }: { label: string | null }) =>
  label ? (
    <div className="lp-beta-badge" aria-hidden="true">
      <Badge label={`BÊTA · ${label}`} />
    </div>
  ) : null;
