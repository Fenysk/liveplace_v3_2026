// La poignée d'une feuille (design system, Pill) : glisser vers le haut déplie, vers le bas replie, toucher bascule.

export type GrabberGesture = "up" | "down" | "tap";

const DRAG_THRESHOLD = 24; // pixels CSS : en deçà, c'est un toucher

export function grabberGesture(verticalDrag: number): GrabberGesture {
  if (verticalDrag < -DRAG_THRESHOLD) return "up";
  if (verticalDrag > DRAG_THRESHOLD) return "down";
  return "tap";
}

// Un clic sans pointeur (`detail` à 0) est Entrée ou Espace : l'action d'activation, sinon celle du toucher.
export function grabberActivation(
  detail: number,
  onTap: () => void,
  onActivate: (() => void) | undefined,
): (() => void) | undefined {
  return detail === 0 ? (onActivate ?? onTap) : undefined;
}
