// Le bandeau d'un emplacement de bêta (JOURNAL 2026-10-04) : quelle branche tourne ici, jamais sur la prod ni dans OBS.

import { Badge } from "../design/badge";

export const BetaBadge = ({ label }: { label: string | null }) =>
  label ? (
    <div className="lp-beta-badge" aria-hidden="true">
      <Badge label={`BÊTA · ${label}`} />
    </div>
  ) : null;
