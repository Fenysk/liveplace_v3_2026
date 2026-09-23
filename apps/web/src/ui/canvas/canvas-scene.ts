// Le canvas vivant (§9.3) : sa taille, son viewport, la case visée, les gestes, et un dessin seulement quand quelque chose a changé.
// Créé dans un `useEffect` : la taille de l'écran, `window` et `ResizeObserver` n'existent que dans le navigateur.

import type { CanvasStore } from "../../state/canvas-store";
import { createCanvasImage } from "./canvas-image";
import { createGestureTracker, type Gesture, type PointerInput, wheelFactor } from "./gestures";
import { createChecker, renderScene } from "./render-scene";
import {
  type Cell,
  fitViewport,
  panBy,
  type Size,
  type Viewport,
  viewportToCell,
  zoomAt,
  zoomLimits,
} from "./viewport";

export type CanvasScene = { dispose(): void };

const MIDDLE_BUTTON = 1;

const toPointerInput = (event: PointerEvent): PointerInput => ({
  pointerId: event.pointerId,
  pointerType: event.pointerType,
  button: event.button,
  point: { x: event.clientX, y: event.clientY },
});

const isSameCell = (a: Cell | null, b: Cell | null) => a?.x === b?.x && a?.y === b?.y;

export function createCanvasScene(surface: HTMLCanvasElement, store: CanvasStore): CanvasScene {
  const context = surface.getContext("2d");
  if (!context) throw new Error("canvas-scene : contexte 2d indisponible");
  const image = createCanvasImage();
  const tracker = createGestureTracker();
  let screen: Size = { width: 0, height: 0 };
  let pixelRatio = 1;
  let checker: CanvasPattern | null = null;
  let viewport: Viewport | null = null;
  let targetCell: Cell | null = null;
  let isImageStale = true;
  let frameRequest = 0;

  const canvasSize = (): Size => {
    const { width, height } = store.getView();
    return { width, height };
  };

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
    renderScene(context, { screen, pixelRatio, viewport, canvas, image: image.source, checker, targetCell });
  };

  // Au plus un dessin par rafraîchissement de l'écran, et aucun si rien n'a bougé.
  const requestRender = () => {
    if (frameRequest === 0) frameRequest = requestAnimationFrame(render);
  };

  const moveViewport = (next: Viewport) => {
    viewport = next;
    requestRender();
  };

  const setTargetCell = (cell: Cell | null) => {
    if (isSameCell(cell, targetCell)) return;
    targetCell = cell;
    requestRender();
  };

  const apply = (gesture: Gesture) => {
    if (!viewport) return;
    switch (gesture.kind) {
      case "pan":
        moveViewport(panBy(viewport, gesture.dx, gesture.dy));
        break;
      case "zoom":
        moveViewport(zoomAt(viewport, gesture.point, gesture.factor, zoomLimits(screen, canvasSize())));
        break;
      case "pinch": {
        const panned = panBy(viewport, gesture.dx, gesture.dy);
        moveViewport(zoomAt(panned, gesture.point, gesture.factor, zoomLimits(screen, canvasSize())));
        break;
      }
      case "target":
        setTargetCell(viewportToCell(viewport, gesture.point, canvasSize()));
        break;
      default:
    }
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

  const listening = new AbortController();
  const { signal } = listening;
  surface.addEventListener(
    "pointerdown",
    (event) => {
      // Le glissement continue même quand la souris sort de la fenêtre.
      surface.setPointerCapture(event.pointerId);
      apply(tracker.press(toPointerInput(event)));
    },
    { signal },
  );
  surface.addEventListener("pointermove", (event) => apply(tracker.move(toPointerInput(event))), { signal });
  surface.addEventListener("pointerup", (event) => apply(tracker.release(toPointerInput(event))), { signal });
  surface.addEventListener("pointercancel", (event) => tracker.cancel(event.pointerId), { signal });
  surface.addEventListener(
    "pointerleave",
    (event) => {
      if (event.pointerType !== "touch") setTargetCell(null);
    },
    { signal },
  );
  // Sous Windows, le clic molette lance sinon le défilement automatique du navigateur.
  surface.addEventListener(
    "mousedown",
    (event) => {
      if (event.button === MIDDLE_BUTTON) event.preventDefault();
    },
    { signal },
  );
  // Non passif : sans `preventDefault()`, Ctrl + molette (et le pincement du trackpad) zoomerait toute la page.
  surface.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const factor = wheelFactor(event.deltaY, event.deltaMode, event.ctrlKey);
      apply({ kind: "zoom", point: { x: event.clientX, y: event.clientY }, factor });
    },
    { passive: false, signal },
  );

  return {
    dispose() {
      cancelAnimationFrame(frameRequest);
      resizeObserver.disconnect();
      unsubscribe();
      listening.abort();
    },
  };
}
