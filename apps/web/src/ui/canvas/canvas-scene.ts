// Le canvas vivant (§9.3) : sa taille, son viewport, son image hors écran, et un dessin seulement quand quelque chose a changé.
// Créé dans un `useEffect` : la taille de l'écran, `window` et `ResizeObserver` n'existent que dans le navigateur.

import type { CanvasStore } from "../../state/canvas-store";
import { createCanvasImage } from "./canvas-image";
import { createChecker, renderScene } from "./render-scene";
import { fitViewport, type Size, type Viewport } from "./viewport";

export type CanvasScene = { dispose(): void };

export function createCanvasScene(surface: HTMLCanvasElement, store: CanvasStore): CanvasScene {
  const context = surface.getContext("2d");
  if (!context) throw new Error("canvas-scene : contexte 2d indisponible");
  const image = createCanvasImage();
  let screen: Size = { width: 0, height: 0 };
  let pixelRatio = 1;
  let checker: CanvasPattern | null = null;
  let viewport: Viewport | null = null;
  let isImageStale = true;
  let frameRequest = 0;

  const render = () => {
    frameRequest = 0;
    const view = store.getView();
    if (!checker || view.width === 0 || screen.width === 0) return;
    const canvas = { width: view.width, height: view.height };
    viewport ??= fitViewport(screen, canvas);
    if (isImageStale) {
      image.repaint(view);
      isImageStale = false;
    }
    renderScene(context, {
      screen,
      pixelRatio,
      viewport,
      canvas,
      image: image.source,
      checker,
      targetCell: null,
    });
  };

  // Au plus un dessin par rafraîchissement de l'écran, et aucun si rien n'a bougé.
  const requestRender = () => {
    if (frameRequest === 0) frameRequest = requestAnimationFrame(render);
  };

  const resizeObserver = new ResizeObserver(([entry]) => {
    if (!entry) return;
    screen = { width: entry.contentRect.width, height: entry.contentRect.height };
    pixelRatio = window.devicePixelRatio;
    surface.width = Math.round(screen.width * pixelRatio);
    surface.height = Math.round(screen.height * pixelRatio);
    checker = createChecker(context, screen, pixelRatio);
    requestRender();
  });
  resizeObserver.observe(surface);

  const unsubscribe = store.subscribe(() => {
    isImageStale = true;
    requestRender();
  });

  return {
    dispose() {
      cancelAnimationFrame(frameRequest);
      resizeObserver.disconnect();
      unsubscribe();
    },
  };
}
