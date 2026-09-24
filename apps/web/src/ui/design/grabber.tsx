// La poignée d'une feuille, sur mobile (design system, Pill) : la feuille Dessin, la fenêtre.

import { useRef } from "react";
import { type GrabberGesture, grabberGesture } from "./grabber-gesture";

type GrabberProps = { label: string; onUp: () => void; onDown: () => void; onTap: () => void };

export const Grabber = ({ label, onUp, onDown, onTap }: GrabberProps) => {
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
      // Au clavier (`detail` à 0), Entrée ou Espace basculent, les flèches déplient et replient.
      onClick={(event) => {
        if (event.detail === 0) onTap();
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowUp") onUp();
        if (event.key === "ArrowDown") onDown();
      }}
    />
  );
};
