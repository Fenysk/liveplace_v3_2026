// Le canvas vivant (§9.3) : sa taille, son viewport, la case visée, les gestes, le brouillon, et un dessin seulement quand quelque chose a changé.
// Créé dans un `useEffect` : la taille de l'écran, `window` et `ResizeObserver` n'existent que dans le navigateur.

import { TRANSPARENT_COLOR_INDEX, toStateOffset } from "@liveplace/domain";
import type { CanvasStore } from "../../state/canvas-store";
import type { DraftStore } from "../../state/draft-store";
import { createCanvasImage } from "./canvas-image";
import { cellLine } from "./cell-line";
import { createGestureTracker, type Gesture, type PointerInput, wheelFactor } from "./gestures";
import { renderScene } from "./render-scene";
import { getSceneShades } from "./scene-shades";
import {
  type Cell,
  type Framing,
  fitViewport,
  isArrivalView,
  panBy,
  type ScreenPoint,
  type Size,
  type Viewport,
  viewportToCell,
  zoomAt,
  zoomLimits,
  zoomPercent,
} from "./viewport";

export type CanvasScene = { zoomBy(factor: number): void; recenter(): void; dispose(): void };

// `initialViewport` : le viewport retrouvé après F5, ou `null` pour l'arrivée.
// `onFraming` : à chaque changement du pourcentage de zoom ou du « la vue a bougé », pour la pill Pratique.
// `checker` : la couche CSS du damier, sous le canvas. La scène lui donne le rectangle du canvas et la taille des cases,
// et fait dériver son motif (`checkerTiles`).
type SceneOptions = {
  initialViewport: Viewport | null;
  onViewportMove(viewport: Viewport): void;
  onFraming(framing: Framing): void;
  checker: HTMLElement;
  checkerTiles: HTMLElement;
};

// Les cases du damier, en pixels CSS : leur taille suit l'écran, jamais le zoom (CDC 2026).
const CHECKER_DIVISOR = 48;
const CHECKER_MIN_TILE = 6;
const checkerTile = (screen: Size): number =>
  Math.max(CHECKER_MIN_TILE, Math.round(Math.min(screen.width, screen.height) / CHECKER_DIVISOR));
// Deux cases par cycle, en diagonale : lent. Des valeurs concrètes, jamais `var()` dans des keyframes CSS, que Chrome
// ne sait pas confier à la carte graphique : l'animation tournerait sur le fil principal, et saccaderait.
const CHECKER_DRIFT_MS = 20_000;

const isSameFraming = (a: Framing | null, b: Framing) =>
  a?.zoomPercent === b.zoomPercent && a.isArrival === b.isArrival;

const MIDDLE_BUTTON = 1;
// Pendant un glissement ou un pincement, les pills s'effacent en fondu (CDC 2026) : le CSS lit cet attribut.
const PANNING_ATTRIBUTE = "data-panning";

const toPointerInput = (event: PointerEvent): PointerInput => ({
  pointerId: event.pointerId,
  pointerType: event.pointerType,
  button: event.button,
  point: { x: event.clientX, y: event.clientY },
});

const isSameCell = (a: Cell | null, b: Cell | null) => a?.x === b?.x && a?.y === b?.y;

export function createCanvasScene(
  surface: HTMLCanvasElement,
  store: CanvasStore,
  draftStore: DraftStore,
  options: SceneOptions,
): CanvasScene {
  const context = surface.getContext("2d");
  if (!context) throw new Error("canvas-scene : contexte 2d indisponible");
  const image = createCanvasImage();
  const tracker = createGestureTracker({ isTouchTracing: () => draftStore.getView().isTouchTracing });
  let screen: Size = { width: 0, height: 0 };
  let pixelRatio = 1;
  const root = document.documentElement;
  let shades = getSceneShades(root);
  let viewport = options.initialViewport;
  let targetCell: Cell | null = null;
  let lastTracedCell: Cell | null = null;
  let isImageStale = true;
  let frameRequest = 0;
  let lastFraming: Framing | null = null;

  const canvasSize = (): Size => {
    const { width, height } = store.getView();
    return { width, height };
  };

  const reportFraming = (current: Viewport, canvas: Size) => {
    const framing = {
      zoomPercent: zoomPercent(current, screen, canvas),
      isArrival: isArrivalView(current, screen, canvas),
    };
    if (isSameFraming(lastFraming, framing)) return;
    lastFraming = framing;
    options.onFraming(framing);
  };

  // Le damier défile en CSS, accroché à l'écran : seul son cadre suit le canvas, sans jamais en dépasser.
  let checkerDrift: Animation | null = null;
  let driftTile = 0;
  const driftChecker = (tile: number) => {
    if (tile === driftTile) return;
    driftTile = tile;
    checkerDrift?.cancel();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const shift = `${2 * tile}px`;
    checkerDrift = options.checkerTiles.animate(
      [{ transform: "translate3d(0, 0, 0)" }, { transform: `translate3d(${shift}, ${shift}, 0)` }],
      { duration: CHECKER_DRIFT_MS, iterations: Number.POSITIVE_INFINITY, easing: "linear" },
    );
  };

  const clipChecker = (current: Viewport, canvas: Size) => {
    const right = screen.width - (current.offsetX + canvas.width * current.scale);
    const bottom = screen.height - (current.offsetY + canvas.height * current.scale);
    const inset = [current.offsetY, right, bottom, current.offsetX].map((side) => `${Math.max(0, side)}px`);
    options.checker.style.setProperty("--lp-checker-clip", `inset(${inset.join(" ")})`);
  };

  const render = () => {
    frameRequest = 0;
    const view = store.getView();
    if (view.width === 0 || screen.width === 0) return;
    const canvas = { width: view.width, height: view.height };
    viewport ??= fitViewport(screen, canvas);
    reportFraming(viewport, canvas);
    clipChecker(viewport, canvas);
    if (isImageStale) {
      image.repaint(view);
      isImageStale = false;
    }
    // Le brouillon ne se voit qu'en Dessin, le viseur qu'en Vue (CDC 2026).
    const draftView = draftStore.getView();
    const isDrafting = draftView.mode === "draft";
    renderScene(context, {
      screen,
      pixelRatio,
      viewport,
      canvas,
      image: image.source,
      shades,
      targetCell,
      inspectedCell: isDrafting ? null : view.inspection,
      draft: isDrafting ? [...draftView.draft.values()] : [],
      palette: view.palette,
      colorIndexAt: (x, y) => view.pixels[toStateOffset(x, y, view.width)] ?? TRANSPARENT_COLOR_INDEX,
    });
  };

  // Au plus un dessin par rafraîchissement de l'écran, et aucun si rien n'a bougé.
  const requestRender = () => {
    if (frameRequest === 0) frameRequest = requestAnimationFrame(render);
  };

  const setPanning = (isPanning: boolean) => {
    root.toggleAttribute(PANNING_ATTRIBUTE, isPanning);
  };

  // Les pills reviennent quand le dernier doigt se lève : lever un doigt d'un pincement ne les montre pas encore.
  const pressedPointers = new Set<number>();
  const liftPointer = (pointerId: number) => {
    pressedPointers.delete(pointerId);
    if (pressedPointers.size === 0) setPanning(false);
  };

  const moveViewport = (next: Viewport) => {
    viewport = next;
    options.onViewportMove(next);
    requestRender();
  };

  const setTargetCell = (cell: Cell | null) => {
    if (isSameCell(cell, targetCell)) return;
    targetCell = cell;
    requestRender();
  };

  // Les cases entre la dernière case tracée et celle-ci : un geste rapide ne laisse aucun trou (CDC 2026).
  const traceTo = (cell: Cell | null) => {
    if (!cell) return;
    draftStore.traceCells(cellLine(lastTracedCell ?? cell, cell));
    lastTracedCell = cell;
  };

  const cellAt = (current: Viewport, point: ScreenPoint) => viewportToCell(current, point, canvasSize());

  // Un clic immobile ou un tap (A5 du plan du J10) : en Dessin, la case entre dans le brouillon ou en sort ;
  // en Vue, elle s'inspecte, et un clic dans le vide ferme l'inspection (CDC 2026).
  const tap = (current: Viewport, point: ScreenPoint) => {
    const cell = cellAt(current, point);
    setTargetCell(cell);
    if (draftStore.getView().mode === "draft") {
      if (cell) draftStore.toggleCell(cell.x, cell.y);
    } else if (cell) store.inspect(cell.x, cell.y);
    else store.closeInspection();
  };

  const applyTrace = (current: Viewport, gesture: Gesture) => {
    if (gesture.kind === "traceEnd") return draftStore.endTrace();
    if (gesture.kind !== "trace" && gesture.kind !== "target") return;
    const cell = cellAt(current, gesture.point);
    setTargetCell(cell);
    // Le début d'un tracé part de la case visée : l'abonnement au brouillon la trace.
    if (gesture.kind === "trace" && !draftStore.getView().isTracing) draftStore.startTrace();
    else if (draftStore.getView().isTracing) traceTo(cell);
  };

  const apply = (gesture: Gesture) => {
    // Avant le `welcome`, le canvas n'a pas de taille : rien à déplacer.
    if (!viewport || store.getView().width === 0) return;
    switch (gesture.kind) {
      case "pan":
        setPanning(true);
        moveViewport(panBy(viewport, gesture.dx, gesture.dy));
        break;
      case "zoom":
        moveViewport(zoomAt(viewport, gesture.point, gesture.factor, zoomLimits(screen, canvasSize())));
        break;
      case "pinch": {
        setPanning(true);
        const panned = panBy(viewport, gesture.dx, gesture.dy);
        moveViewport(zoomAt(panned, gesture.point, gesture.factor, zoomLimits(screen, canvasSize())));
        break;
      }
      default:
        applyTrace(viewport, gesture);
    }
  };

  // Le relâcher qui vise une case est un clic ou un tap, pas un survol.
  const release = (gesture: Gesture) => {
    if (gesture.kind === "target" && viewport && store.getView().width > 0) tap(viewport, gesture.point);
    else apply(gesture);
  };

  const resizeObserver = new ResizeObserver(([entry]) => {
    if (!entry) return;
    screen = { width: entry.contentRect.width, height: entry.contentRect.height };
    pixelRatio = window.devicePixelRatio;
    surface.width = Math.round(screen.width * pixelRatio);
    surface.height = Math.round(screen.height * pixelRatio);
    const tile = checkerTile(screen);
    options.checker.style.setProperty("--lp-checker-tile", `${tile}px`);
    driftChecker(tile);
    requestRender();
  });
  resizeObserver.observe(surface);

  // Le thème change (bouton, Préférences, ou le système en auto) : nouvelles teintes. Le damier suit seul, en CSS.
  const themeObserver = new MutationObserver(() => {
    shades = getSceneShades(root);
    requestRender();
  });
  themeObserver.observe(root, { attributes: true, attributeFilter: ["data-theme"] });

  const unsubscribe = store.subscribe(() => {
    isImageStale = true;
    requestRender();
  });

  let wasTracing = false;
  const unsubscribeDraft = draftStore.subscribe(() => {
    const { isTracing, mode } = draftStore.getView();
    if (isTracing !== wasTracing) {
      lastTracedCell = null;
      if (isTracing) traceTo(targetCell);
      wasTracing = isTracing;
    }
    // En Dessin, un clic ne vise plus l'auteur d'une case : l'inspection se ferme.
    if (mode === "draft" && store.getView().inspection) store.closeInspection();
    requestRender();
  });

  const listening = new AbortController();
  const { signal } = listening;
  surface.addEventListener(
    "pointerdown",
    (event) => {
      // Le glissement continue même quand la souris sort de la fenêtre.
      surface.setPointerCapture(event.pointerId);
      pressedPointers.add(event.pointerId);
      apply(tracker.press(toPointerInput(event)));
    },
    { signal },
  );
  surface.addEventListener("pointermove", (event) => apply(tracker.move(toPointerInput(event))), { signal });
  surface.addEventListener(
    "pointerup",
    (event) => {
      liftPointer(event.pointerId);
      release(tracker.release(toPointerInput(event)));
    },
    { signal },
  );
  surface.addEventListener(
    "pointercancel",
    (event) => {
      liftPointer(event.pointerId);
      apply(tracker.cancel(event.pointerId));
    },
    { signal },
  );
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
    zoomBy(factor) {
      apply({ kind: "zoom", point: { x: screen.width / 2, y: screen.height / 2 }, factor });
    },
    // Recentrer revient à l'arrivée, sur l'écran d'aujourd'hui.
    recenter() {
      if (viewport && store.getView().width > 0) moveViewport(fitViewport(screen, canvasSize()));
    },
    dispose() {
      cancelAnimationFrame(frameRequest);
      resizeObserver.disconnect();
      checkerDrift?.cancel();
      themeObserver.disconnect();
      setPanning(false);
      unsubscribe();
      unsubscribeDraft();
      listening.abort();
    },
  };
}
