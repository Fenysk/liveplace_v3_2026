// Le canvas en plein écran, sous les pills (CDC 2026) : React le monte, la scène le fait vivre sans re-rendu.

import { useEffect, useRef, useState } from "react";
import type { CanvasStore } from "../../state/canvas-store";
import type { DraftStore } from "../../state/draft-store";
import { type CanvasScene, createCanvasScene } from "./canvas-scene";
import { createViewportSaver, getSavedViewport } from "./saved-viewport";
import { ViewportPill } from "./viewport-pill";

// Lu à chaque accès, dans un `try` : dans une fenêtre qui refuse le stockage, l'accès lui-même lève.
const getBrowserStorage = () => window.localStorage;

type PixelCanvasProps = { store: CanvasStore; draftStore: DraftStore; canvasId: string };

export const PixelCanvas = ({ store, draftStore, canvasId }: PixelCanvasProps) => {
  const surface = useRef<HTMLCanvasElement>(null);
  const [scene, setScene] = useState<CanvasScene>();

  // Le viewport sauvegardé se lit ici, jamais pendant le rendu : `localStorage` n'existe pas sur le serveur.
  useEffect(() => {
    if (!surface.current) return;
    const saver = createViewportSaver(getBrowserStorage, canvasId);
    const created = createCanvasScene(surface.current, store, draftStore, {
      initialViewport: getSavedViewport(getBrowserStorage, canvasId),
      onViewportMove: saver.save,
    });
    setScene(created);
    return () => {
      created.dispose();
      saver.cancel();
    };
  }, [store, draftStore, canvasId]);

  return (
    <>
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
      {scene && <ViewportPill scene={scene} />}
    </>
  );
};
