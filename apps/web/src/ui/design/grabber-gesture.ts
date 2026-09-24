// La poignée d'une feuille (design system, Pill) : glisser vers le haut déplie, vers le bas replie, toucher bascule.

export type GrabberGesture = "up" | "down" | "tap";

const DRAG_THRESHOLD = 24; // pixels CSS : en deçà, c'est un toucher

export function grabberGesture(verticalDrag: number): GrabberGesture {
  if (verticalDrag < -DRAG_THRESHOLD) return "up";
  if (verticalDrag > DRAG_THRESHOLD) return "down";
  return "tap";
}
