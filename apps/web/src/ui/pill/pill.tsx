// Une bulle d'interface flottante, collée à un bord de l'écran (CDC 2026). Sans morphing jusqu'au J10.

import type { CSSProperties, ReactNode } from "react";

const EDGE_GAP = 12;

const PILL_ANCHORS = {
  topLeft: { top: EDGE_GAP, left: EDGE_GAP },
  topRight: { top: EDGE_GAP, right: EDGE_GAP },
  bottomCenter: { bottom: EDGE_GAP, left: "50%", transform: "translateX(-50%)" },
  bottomRight: { bottom: EDGE_GAP, right: EDGE_GAP },
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

type PillProps = { anchor: keyof typeof PILL_ANCHORS; children: ReactNode };

export const Pill = ({ anchor, children }: PillProps) => (
  <div style={{ ...PILL_STYLE, ...PILL_ANCHORS[anchor] }}>{children}</div>
);
