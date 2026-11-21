// La poignée d'une feuille, sur mobile (design system, Pill) : la feuille Dessin, la fenêtre.

import { useRef } from "react";
import { type GrabberGesture, grabberActivation, grabberGesture } from "./grabber-gesture";

// `onActivate` : ce que font Entrée et Espace. Absent, le clavier fait comme le toucher (`onTap`).
type GrabberProps = {
  label: string;
  onUp: () => void;
  onDown: () => void;
  onTap: () => void;
  onActivate?: () => void;
};

export const Grabber = ({ label, onUp, onDown, onTap, onActivate }: GrabberProps) => {
  const startY = useRef<number | null>(null);
  const gestures: Record<GrabberGesture, () => void> = { up: onUp, down: onDown, tap: onTap };
  return (
    <button
      type="button"
      className="lp-grabber"
      aria-label={label}
      onPointerDown={(event) => {
        startY.current = event.clientY;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerUp={(event) => {
        if (startY.current === null) return;
        const gesture = grabberGesture(event.clientY - startY.current);
        startY.current = null;
        gestures[gesture]();
      }}
      // Au clavier (`detail` à 0), Entrée ou Espace activent (`onActivate`, sinon `onTap`), les flèches déplient et replient.
      onClick={(event) => grabberActivation(event.detail, onTap, onActivate)?.()}
      onKeyDown={(event) => {
        if (event.key === "ArrowUp") onUp();
        if (event.key === "ArrowDown") onDown();
      }}
    />
  );
};
