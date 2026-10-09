// L'exemple du geste de vue sur mobile (Écart §8.1, JOURNAL 2026-10-09) : le haut s'efface tant qu'on glisse sur le canvas et
// revient au doigt levé, sans délai. Comme le jeu (canvas-scene.ts), un attribut suit le geste et le CSS le lit, sur un faux canvas.

import { type PointerEvent, type ReactNode, useRef, useState } from "react";

export const PanFadeDemo = ({ children }: { children: ReactNode }) => {
  const [isPanning, setIsPanning] = useState(false);
  const isPressed = useRef(false);
  const press = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    isPressed.current = true;
  };
  const move = () => {
    if (isPressed.current) setIsPanning(true);
  };
  const lift = () => {
    isPressed.current = false;
    setIsPanning(false);
  };
  return (
    <div className="design-pan-demo">
      <div className="design-pan-top" data-panning={isPanning ? "" : undefined}>
        {children}
      </div>
      <div
        className="design-pan-canvas lp-type-caption"
        onPointerDown={press}
        onPointerMove={move}
        onPointerUp={lift}
        onPointerCancel={lift}
      >
        Glisse ici, comme sur le canvas
      </div>
    </div>
  );
};
