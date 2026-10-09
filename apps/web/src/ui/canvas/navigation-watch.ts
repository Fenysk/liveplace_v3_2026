// Ce que l'utilisateur fait de la vue (Écart §8.1, JOURNAL 2026-10-08) : un déplacement ou un zoom réussi, pas un tremblement.
// Sans DOM : la scène lui donne les gestes et le moment où le dernier doigt se lève.

import type { Gesture } from "./gestures";

export type NavigationKind = "pan" | "zoom";

export type NavigationWatch = {
  watch(gesture: Gesture): void;
  end(): void; // le dernier doigt s'est levé
};

// Un glissement cumule au moins ce chemin (px), un pincement au moins ce rapport d'écart entre les doigts, dans un sens ou l'autre.
export const PAN_MIN_DISTANCE = 48;
export const PINCH_MIN_RATIO = 1.3;

const MIN_PINCH_LOG = Math.log(PINCH_MIN_RATIO);

export function createNavigationWatch(onNavigate: (kind: NavigationKind) => void): NavigationWatch {
  let panDistance = 0;
  let pinchLog = 0;
  return {
    watch(gesture) {
      if (gesture.kind === "pan") panDistance += Math.hypot(gesture.dx, gesture.dy);
      else if (gesture.kind === "pinch" && gesture.factor > 0) pinchLog += Math.log(gesture.factor);
      // La molette et les boutons Zoomer arrivent d'un coup : ils n'ont pas de doigt à lever.
      else if (gesture.kind === "zoom") onNavigate("zoom");
    },
    // Rapporté au dernier doigt levé : rien ne s'écrit dans le navigateur pendant le geste.
    end() {
      if (Math.abs(pinchLog) >= MIN_PINCH_LOG) onNavigate("zoom");
      if (panDistance >= PAN_MIN_DISTANCE) onNavigate("pan");
      panDistance = 0;
      pinchLog = 0;
    },
  };
}
