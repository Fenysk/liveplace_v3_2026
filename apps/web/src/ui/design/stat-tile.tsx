// Un chiffre de l'instant sous son libellé, avec une précision facultative (la section Activité, écart §4.3, JOURNAL 2026-10-06).

import type { ReactNode } from "react";

type StatTileProps = { label: string; value: string; note?: string | undefined };

export const StatTile = ({ label, value, note }: StatTileProps) => (
  <div className="lp-stat-tile">
    <span className="lp-type-caption lp-muted">{label}</span>
    <span className="lp-stat-tile-value lp-type-heading">{value}</span>
    {note && <span className="lp-type-caption lp-muted">{note}</span>}
  </div>
);

// Quatre sur une ligne, deux sur mobile.
export const StatTiles = ({ children }: { children: ReactNode }) => (
  <div className="lp-stat-tiles">{children}</div>
);
