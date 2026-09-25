// La surface de la vue OBS (CDC 2026, Vue OBS) : les pixels seuls, sur fond transparent. Le canvas remplit la source
// sans se déformer, centré : une case peut faire 4 px et sa voisine 5 px (JOURNAL 2026-09-25). Ni geste, ni curseur.

import { useEffect, useRef } from "react";
import type { ObsStore } from "../../state/obs-store";
import { createCanvasImage } from "../canvas/canvas-image";

type ObsCanvasProps = { store: ObsStore };

export const ObsCanvas = ({ store }: ObsCanvasProps) => {
  const surface = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = surface.current;
    if (!element) return;
    const context = element.getContext("2d");
    if (!context) throw new Error("obs-canvas : contexte 2d indisponible");
    const image = createCanvasImage();
    let frame = 0;

    const paint = (): void => {
      frame = 0;
      const view = store.getView();
      if (!view.isReady) return;
      image.repaint(view);
      const ratio = window.devicePixelRatio || 1;
      const [width, height] = [
        Math.round(element.clientWidth * ratio),
        Math.round(element.clientHeight * ratio),
      ];
      if (element.width !== width) element.width = width;
      if (element.height !== height) element.height = height;
      const scale = Math.min(width / view.width, height / view.height);
      const [drawnWidth, drawnHeight] = [view.width * scale, view.height * scale];
      context.clearRect(0, 0, width, height);
      context.imageSmoothingEnabled = false;
      context.drawImage(
        image.source,
        (width - drawnWidth) / 2,
        (height - drawnHeight) / 2,
        drawnWidth,
        drawnHeight,
      );
    };
    // Une image par `requestAnimationFrame`, seulement quand quelque chose a changé (§9.3).
    const requestPaint = (): void => {
      if (!frame) frame = requestAnimationFrame(paint);
    };

    const unsubscribe = store.subscribe(requestPaint);
    // Le streamer change la taille de sa source : la surface suit.
    const resizeObserver = new ResizeObserver(requestPaint);
    resizeObserver.observe(element);
    requestPaint();
    return () => {
      unsubscribe();
      resizeObserver.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [store]);

  return (
    <canvas ref={surface} className="lp-obs-surface" aria-label="Le canvas, tel que le stream le montre" />
  );
};
