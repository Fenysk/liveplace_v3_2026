// Une bulle d'interface flottante, collée à un bord de l'écran (CDC 2026). Sans morphing : bloc 2.

import type { CSSProperties, ReactNode } from "react";

const EDGE_GAP = 12;
// Une pill en colonne (boutons de 32 px) fait 44 px de large : la pill du bas au centre lui laisse cette place de chaque côté.
const SIDE_ROOM = EDGE_GAP + 44 + EDGE_GAP;

const PILL_ANCHORS = {
  topLeft: { top: EDGE_GAP, left: EDGE_GAP },
  topRight: { top: EDGE_GAP, right: EDGE_GAP },
  bottomCenter: {
    bottom: EDGE_GAP,
    left: SIDE_ROOM,
    right: SIDE_ROOM,
    width: "fit-content",
    marginInline: "auto",
    whiteSpace: "normal",
    textAlign: "center",
  },
  bottomRight: { bottom: EDGE_GAP, right: EDGE_GAP },
  centerRight: { top: "50%", right: EDGE_GAP, transform: "translateY(-50%)" },
} satisfies Record<string, CSSProperties>;

const PILL_STYLE: CSSProperties = {
  position: "fixed",
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 14px",
  borderRadius: 999,
  background: "rgba(20, 21, 30, 0.88)",
  boxShadow: "0 4px 16px rgba(0, 0, 0, 0.35)",
  fontSize: 14,
  whiteSpace: "nowrap",
};

const COLUMN_STYLE: CSSProperties = { flexDirection: "column", gap: 4, padding: 6 };
// Une pill haute (la palette du mode Dessin) : des coins arrondis, pas une gélule.
const PANEL_STYLE: CSSProperties = { flexDirection: "column", gap: 8, padding: 10, borderRadius: 18 };

type PillProps = {
  anchor: keyof typeof PILL_ANCHORS;
  direction?: "row" | "column" | "panel";
  children: ReactNode;
};

const DIRECTION_STYLES = { row: {}, column: COLUMN_STYLE, panel: PANEL_STYLE } satisfies Record<
  NonNullable<PillProps["direction"]>,
  CSSProperties
>;

export const Pill = ({ anchor, direction = "row", children }: PillProps) => (
  <div style={{ ...PILL_STYLE, ...DIRECTION_STYLES[direction], ...PILL_ANCHORS[anchor] }}>{children}</div>
);
