// La pill Pratique (CDC 2026) : zoomer et dézoomer vers le centre de l'écran, recentrer comme à l'arrivée.

import type { CSSProperties } from "react";
import { Pill } from "../pill/pill";
import type { CanvasScene } from "./canvas-scene";

const ZOOM_STEP = 1.5;

const BUTTON_STYLE: CSSProperties = {
  display: "grid",
  placeItems: "center",
  width: 32,
  height: 32,
  padding: 0,
  border: "none",
  borderRadius: 999,
  background: "transparent",
  color: "inherit",
  fontSize: 20,
  lineHeight: 1,
  cursor: "pointer",
};

export const ViewportPill = ({ scene }: { scene: CanvasScene }) => (
  <Pill anchor="bottomRight" direction="column">
    <button
      type="button"
      aria-label="Dézoomer"
      style={BUTTON_STYLE}
      onClick={() => scene.zoomBy(1 / ZOOM_STEP)}
    >
      −
    </button>
    <button type="button" aria-label="Zoomer" style={BUTTON_STYLE} onClick={() => scene.zoomBy(ZOOM_STEP)}>
      +
    </button>
    <button type="button" aria-label="Recentrer" style={BUTTON_STYLE} onClick={() => scene.recenter()}>
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8 0v3.5M8 12.5V16M0 8h3.5M12.5 8H16" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    </button>
  </Pill>
);
