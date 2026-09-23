// Le canvas en plein écran, sous les pills (CDC 2026) : React le monte, la scène le fait vivre sans re-rendu.

import { useEffect, useRef } from "react";
import type { CanvasStore } from "../../state/canvas-store";
import { createCanvasScene } from "./canvas-scene";

export const PixelCanvas = ({ store }: { store: CanvasStore }) => {
  const surface = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!surface.current) return;
    const scene = createCanvasScene(surface.current, store);
    return () => scene.dispose();
  }, [store]);

  return (
    <canvas
      ref={surface}
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        display: "block",
        touchAction: "none",
      }}
    />
  );
};
