// Le canvas vivant (§9.3) : sa taille, son viewport, la case visée, les gestes, le brouillon, et un dessin seulement quand quelque chose a changé.
// Créé dans un `useEffect` : la taille de l'écran, `window` et `ResizeObserver` n'existent que dans le navigateur.

import {
  BACKGROUND_IMAGE_OPACITY,
  type CellKey,
  OBS_BACKGROUND,
  TRANSPARENT_COLOR_INDEX,
  toCellKey,
  toStateOffset,
} from "@liveplace/domain";
import { backgroundImagePath } from "../../shared/background-image-path";
import type { ArrivedPixel, CanvasStore, CanvasView, ConfirmedPixel } from "../../state/canvas-store";
import type { Draft } from "../../state/draft";
import type { DraftMode, DraftStore } from "../../state/draft-store";
import { BOTTOM_BAR_HEIGHT } from "../design/bottom-bar";
import { easingCurve, motionEasing, motionMs } from "../design/motion";
import { COARSE_POINTER_QUERY, SIDE_COLUMN_QUERY } from "../design/use-media-query";
import {
  type ArrivalClock,
  arrivalDelay,
  arrivalProgress,
  type ColorLayer,
  isArrivalDone,
  MAX_ARRIVALS,
  shownLayers,
} from "./arrival";
import {
  measureArrivalInsets,
  measureDraftInsets,
  observeZone,
  ZONE_ABOVE_ATTRIBUTE,
} from "./arrival-insets";
import { createBackdropImage, createPropertyReader, toBackdrop } from "./canvas-background";
import { createCanvasImage, toLevelCanvases } from "./canvas-image";
import { cellLine } from "./cell-line";
import { draftFadeStarts, MAX_DRAFT_FADES } from "./draft-fade";
import { freeArea, type PointerGrain, tapZoomTarget, zoomFrame } from "./draft-zoom";
import {
  createGestureTracker,
  type Gesture,
  isWheelNotch,
  movesViewport,
  type PointerInput,
  wheelFactor,
} from "./gestures";
import { mosaicLevels, REVEAL_STEPS } from "./mosaic";
import { createNavigationWatch, type NavigationKind } from "./navigation-watch";
import {
  type ArrivingCell,
  type DraftFade,
  type Ghost,
  type Reveal,
  renderGhost,
  renderScene,
  type SettlingBatch,
} from "./render-scene";
import { getSceneShades } from "./scene-shades";
import {
  type Cell,
  clampCell,
  type Framing,
  fitViewport,
  type Insets,
  isArrivalView,
  NO_INSETS,
  panBy,
  panToShow,
  type ScreenPoint,
  type Size,
  type Viewport,
  viewportToCell,
  zoomAt,
  zoomLimits,
  zoomPercent,
  zoomTowards,
} from "./viewport";

export type CanvasScene = {
  zoomBy(factor: number): void;
  recenter(): void;
  moveTarget(dx: number, dy: number): void; // la première fois, la case visée paraît sans bouger
  pickTarget(): void; // Espace, pipette armée
  discardTarget(): void; // Retour arrière
  dispose(): void;
};

// `initialViewport` : le viewport retrouvé après F5, ou `null` pour l'arrivée.
// `onFraming` : à chaque changement du pourcentage de zoom ou du « la vue a bougé », pour la pill Pratique.
// `checker` : la couche CSS du damier, sous le canvas. La scène lui donne le rectangle du canvas et la taille des cases,
// et fait dériver son motif (`checkerTiles`).
// `isFramedInFreeArea` (Écart §9.3, JOURNAL 2026-10-08) : la page a un en-tête de pills, et sur mobile l'arrivée se cadre dessous.
// `onGesture` (Écart §8.1, JOURNAL 2026-10-08) : une action reconnue sur le canvas (déplacer, pincer, zoomer, ouvrir une case).
// `onNavigate` (Écart §8.1, JOURNAL 2026-10-08) : un déplacement ou un zoom réussi, pour le conseil de première visite.
// `login` (Écart §9.1, JOURNAL 2026-10-10) : celui de la page, qui nomme l'adresse de l'image du fond.
// `handoff` : le passage d'une scène à la suivante, quand la page suit une autre fresque.
type SceneOptions = {
  login: string;
  initialViewport: Viewport | null;
  isFramedInFreeArea: boolean;
  onNavigate?: ((kind: NavigationKind) => void) | undefined;
  onViewportMove(viewport: Viewport): void;
  onFraming(framing: Framing): void;
  onGesture(): void;
  handoff?: Handoff | undefined;
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

const isSameInsets = (a: Insets, b: Insets) =>
  a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left;

const MIDDLE_BUTTON = 1;
// Au clavier, la case visée garde ses distances avec les bords de l'écran et les pills qui y flottent (CDC 2026).
const KEY_MARGIN = 48;
// Pendant un glissement ou un pincement, les pills s'effacent en fondu (CDC 2026) : le CSS lit cet attribut.
const PANNING_ATTRIBUTE = "data-panning";

const toPointerInput = (event: PointerEvent): PointerInput => ({
  pointerId: event.pointerId,
  pointerType: event.pointerType,
  button: event.button,
  point: { x: event.clientX, y: event.clientY },
});

const isSameCell = (a: Cell | null, b: Cell | null) => a?.x === b?.x && a?.y === b?.y;

// Les cases d'un ack se posent en douceur, de l'aspect brouillon à l'aspect posé, sur `--lp-dur` et `--lp-ease` lus à l'ack.
// `startedAt` : l'instant de la première image qui les peint, pour qu'une image tardive n'en saute pas le début.
type Settle = {
  pixels: readonly ConfirmedPixel[];
  duration: number;
  ease: (progress: number) => number;
  startedAt: number | null;
};

// Une case qui entre au brouillon, ou y change de couleur (`from`), en fondu sur `--lp-dur-fast` et `--lp-ease`.
type DraftFadeRun = {
  from: number | null;
  duration: number;
  ease: (progress: number) => number;
  startedAt: number | null;
};

// Le passage d'une scène à la suivante quand la page suit une autre fresque (use-follow-active-canvas.ts) : la dernière surface
// peinte de celle qui s'en va, que la nouvelle garde à l'écran jusqu'à l'arrivée de la sienne. Périmée au bout de 2 s.
export type Handoff = { surface: HTMLCanvasElement | null; leftAt: number };
export const createHandoff = (): Handoff => ({ surface: null, leftAt: 0 });
const HANDOFF_MAX_AGE_MS = 2000;

const takeLeftBehind = (handoff: Handoff | undefined): HTMLCanvasElement | null => {
  if (!handoff) return null;
  const { surface, leftAt } = handoff;
  handoff.surface = null;
  return performance.now() - leftAt <= HANDOFF_MAX_AGE_MS ? surface : null;
};

// Une case posée par un autre joueur : son fondu de `base` (ce qu'elle montrait) vers `colorIndex`, sur `--lp-dur-arrival`
// et `--lp-ease`, après son tour dans le lot.
type ArrivalRun = ArrivalClock & {
  x: number;
  y: number;
  base: readonly ColorLayer[];
  colorIndex: number;
};

// L'apparition en mosaïque, sur `--lp-dur-reveal` partagée en REVEAL_STEPS étapes égales, chacune sur `--lp-ease`.
type RevealRun = {
  levels: HTMLCanvasElement[];
  stepMs: number;
  ease: (progress: number) => number;
  startedAt: number | null;
};

// Le viseur qui glisse depuis `from`, sur `--lp-dur` et `--lp-ease`.
type ReticleGlide = {
  from: Cell;
  duration: number;
  ease: (progress: number) => number;
  startedAt: number;
};

// Mouvement réduit : la durée vaut 0, le viseur saute à la nouvelle case.
const startGlide = (root: Element, from: Cell, startedAt: number): ReticleGlide | null => {
  const duration = motionMs(root, "--lp-dur");
  return duration > 0 ? { from, duration, ease: easingCurve(motionEasing(root)), startedAt } : null;
};

// Où en est le glissement vers `to` à l'instant `now` : sa place entre les deux cases, nul une fois arrivé.
const glidePosition = (
  { from, duration, ease, startedAt }: ReticleGlide,
  to: Cell,
  now: number,
): Cell | null => {
  const progress = (now - startedAt) / duration;
  if (progress >= 1) return null;
  const eased = ease(progress);
  return { x: from.x + (to.x - from.x) * eased, y: from.y + (to.y - from.y) * eased };
};

export function createCanvasScene(
  surface: HTMLCanvasElement,
  store: CanvasStore,
  draftStore: DraftStore,
  options: SceneOptions,
): CanvasScene {
  const context = surface.getContext("2d");
  if (!context) throw new Error("canvas-scene : contexte 2d indisponible");
  const image = createCanvasImage();
  const backdropImage = createBackdropImage(() => requestRender());
  const tracker = createGestureTracker({ isTouchTracing: () => draftStore.getView().isTouchTracing });
  const navigation = createNavigationWatch((kind) => options.onNavigate?.(kind));
  let screen: Size = { width: 0, height: 0 };
  let pixelRatio = 1;
  const root = document.documentElement;
  let shades = getSceneShades(root);
  const getProperty = createPropertyReader(root);
  let viewport = options.initialViewport;
  // Les marges du cadrage d'arrivée, et si la vue est restée à l'arrivée : un viewport retrouvé après F5, ou déplacé, n'est
  // jamais recadré quand elles changent.
  let insets: Insets = NO_INSETS;
  let isAtArrival = false;
  const measureInsets = (): Insets => {
    if (!options.isFramedInFreeArea) return NO_INSETS;
    const { insets: measured, zone } = measureArrivalInsets(root, screen, canvasSize());
    root.toggleAttribute(ZONE_ABOVE_ATTRIBUTE, zone === "above");
    return measured;
  };
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
      zoomPercent: zoomPercent(current, screen, canvas, insets),
      isArrival: isArrivalView(current, screen, canvas, insets),
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

  // La fresque paraît en mosaïque la première fois que son image est là, dans cette scène. Mouvement réduit : la durée vaut 0,
  // elle paraît d'un coup. Les cases arrivées pendant l'apparition ne sont pas perdues : la dernière étape est l'image du moment.
  let hasRevealed = false;
  let reveal: RevealRun | null = null;
  const advanceReveal = (now: number, view: CanvasView): Reveal | null => {
    if (!hasRevealed && view.isImageLoaded) {
      hasRevealed = true;
      const duration = motionMs(root, "--lp-dur-reveal");
      if (duration > 0)
        reveal = {
          levels: toLevelCanvases(mosaicLevels(view.pixels, view.palette, view)),
          stepMs: duration / REVEAL_STEPS,
          ease: easingCurve(motionEasing(root)),
          startedAt: null,
        };
    }
    if (!reveal) return null;
    reveal.startedAt ??= now;
    const elapsed = now - reveal.startedAt;
    if (elapsed >= reveal.stepMs * REVEAL_STEPS) {
      reveal = null;
      return null;
    }
    requestRender();
    const step = Math.floor(elapsed / reveal.stepMs);
    return {
      levels: reveal.levels,
      step,
      progress: reveal.ease((elapsed - step * reveal.stepMs) / reveal.stepMs),
    };
  };

  // La fresque que la page vient de quitter reste à l'écran jusqu'à l'arrivée de celle-ci, puis s'efface pendant la première étape.
  let ghostSurface = takeLeftBehind(options.handoff);
  let hasPainted = false;
  const holdsGhost = (view: CanvasView): boolean => {
    if (!ghostSurface || view.isImageLoaded) return false;
    renderGhost(context, ghostSurface);
    return true;
  };
  const advanceGhost = (current: Reveal | null): Ghost | null => {
    if (!ghostSurface) return null;
    if (!current || current.step > 0) {
      ghostSurface = null;
      return null;
    }
    return { source: ghostSurface, alpha: 1 - current.progress };
  };

  // Les cases des autres joueurs ne passent d'un coup que pendant la mosaïque, le mouvement réduit et au-delà du plafond.
  const arrivals = new Map<CellKey, ArrivalRun>();
  let lastFrameAt = 0; // un fondu qu'une réécriture interrompt repart de ce qu'il montrait à la dernière image
  const advanceArrivals = (now: number, view: CanvasView): ArrivingCell[] => {
    const cells: ArrivingCell[] = [];
    for (const [key, run] of arrivals) {
      run.startedAt ??= now;
      if (isArrivalDone(run, now) || run.x >= view.width || run.y >= view.height) arrivals.delete(key);
      else {
        const { x, y, base, colorIndex } = run;
        cells.push({ x, y, base, colorIndex, progress: arrivalProgress(run, now) });
      }
    }
    lastFrameAt = now;
    if (arrivals.size > 0) requestRender();
    return cells;
  };
  const fadeArrivals = (lot: readonly ArrivedPixel[], duration: number) => {
    const ease = easingCurve(motionEasing(root));
    lot.forEach(({ x, y, colorIndex, previousColorIndex }, index) => {
      const key = toCellKey(x, y);
      const running = arrivals.get(key);
      const base = running
        ? shownLayers(running.base, running.colorIndex, arrivalProgress(running, lastFrameAt))
        : [{ colorIndex: previousColorIndex, alpha: 1 }];
      arrivals.set(key, {
        x,
        y,
        base,
        colorIndex,
        delay: arrivalDelay(index, lot.length),
        duration,
        ease,
        startedAt: null,
      });
    });
  };
  // Un lot qui ne tient pas dans la place restante paraît en entier d'un coup, jamais à moitié animé.
  const startArrivals = (lot: readonly ArrivedPixel[]) => {
    const duration = motionMs(root, "--lp-dur-arrival");
    const isFading = hasRevealed && !reveal && duration > 0;
    const fresh = lot.filter(({ x, y }) => !arrivals.has(toCellKey(x, y))).length;
    if (isFading && arrivals.size + fresh <= MAX_ARRIVALS) fadeArrivals(lot, duration);
    else for (const { x, y } of lot) arrivals.delete(toCellKey(x, y));
    requestRender();
  };

  let settles: Settle[] = [];
  // Une pose qui arrive au bout s'en va : l'image porte déjà son but. Une case que le canvas a quittée (un autre joueur la
  // reprend, une nouvelle taille) ne se pose plus.
  const advanceSettles = (now: number, view: CanvasView): SettlingBatch[] => {
    const running: Settle[] = [];
    const batches: SettlingBatch[] = [];
    for (const settle of settles) {
      settle.startedAt ??= now;
      const progress = (now - settle.startedAt) / settle.duration;
      if (progress >= 1) continue;
      running.push(settle);
      const pixels = settle.pixels.filter(
        ({ x, y, colorIndex }) =>
          x < view.width && y < view.height && view.pixels[toStateOffset(x, y, view.width)] === colorIndex,
      );
      batches.push({ pixels, progress: settle.ease(progress) });
    }
    settles = running;
    // Une image de plus tant qu'une pose se fait ; ensuite, plus rien n'est attendu.
    if (running.length > 0) requestRender();
    return batches;
  };

  // Le viseur de l'inspection glisse de la case d'avant à la nouvelle, en cases de la fresque : un déplacement ou un zoom
  // pendant le glissement le laisse juste. Il paraît sur place la première fois, et part d'un coup à la fermeture.
  let reticleTarget: Cell | null = null;
  let reticleShown: Cell | null = null; // où il s'est dessiné à la dernière image : un nouveau choix repart de là
  let reticleGlide: ReticleGlide | null = null;
  const advanceReticle = (now: number, inspected: Cell | null): Cell | null => {
    if (!inspected) {
      reticleTarget = reticleShown = reticleGlide = null;
      return null;
    }
    const target = { x: inspected.x, y: inspected.y };
    if (!reticleTarget || !reticleShown) {
      reticleTarget = reticleShown = target;
      return target;
    }
    if (!isSameCell(target, reticleTarget)) {
      reticleGlide = startGlide(root, reticleShown, now);
      reticleTarget = target;
    }
    const gliding = reticleGlide && glidePosition(reticleGlide, target, now);
    if (gliding) requestRender();
    else reticleGlide = null;
    reticleShown = gliding ?? target;
    return reticleShown;
  };

  const draftFades = new Map<CellKey, DraftFadeRun>();
  // Hors Dessin, le brouillon ne se voit pas : plus de fondu. Un fondu fini s'en va ; une image de plus tant qu'il en reste.
  const advanceDraftFades = (now: number, isDrafting: boolean): Map<CellKey, DraftFade> => {
    if (!isDrafting) draftFades.clear();
    const fades = new Map<CellKey, DraftFade>();
    for (const [key, run] of draftFades) {
      run.startedAt ??= now;
      const progress = (now - run.startedAt) / run.duration;
      if (progress >= 1) draftFades.delete(key);
      else fades.set(key, { from: run.from, progress: run.ease(progress) });
    }
    if (draftFades.size > 0) requestRender();
    return fades;
  };

  // Écart §9.1 (JOURNAL 2026-10-10) : le fond de la fresque et son image, sous les pixels ; le damier ne se retire que pour un fond plein.
  const getBackdrop = (params: CanvasView["params"]) => {
    const imageAt = params?.backgroundImageAt;
    backdropImage.set(imageAt ? backgroundImagePath(options.login, imageAt) : null);
    const backdrop = toBackdrop(
      params?.obsBackground ?? OBS_BACKGROUND,
      backdropImage.get(),
      params?.backgroundImageOpacity ?? BACKGROUND_IMAGE_OPACITY,
      getProperty,
    );
    options.checker.hidden = backdrop.fill !== null;
    return backdrop;
  };

  const render = (now: number) => {
    frameRequest = 0;
    const view = store.getView();
    if (holdsGhost(view) || view.width === 0 || screen.width === 0) return;
    const canvas = { width: view.width, height: view.height };
    if (!viewport) {
      // Les pills ont eu le temps de se mesurer depuis la création de la scène : la première arrivée les relit.
      insets = measureInsets();
      viewport = fitViewport(screen, canvas, insets);
      isAtArrival = true;
    }
    reportFraming(viewport, canvas);
    clipChecker(viewport, canvas);
    if (isImageStale) {
      image.repaint(view);
      isImageStale = false;
    }
    const backdrop = getBackdrop(view.params);
    // Le brouillon ne se voit qu'en Dessin, le viseur qu'en Vue (CDC 2026).
    const draftView = draftStore.getView();
    const isDrafting = draftView.mode === "draft";
    const revealing = advanceReveal(now, view);
    renderScene(context, {
      screen,
      pixelRatio,
      viewport,
      canvas,
      image: image.source,
      backdrop,
      reveal: revealing,
      ghost: advanceGhost(revealing),
      shades,
      targetCell,
      inspectedCell: advanceReticle(now, isDrafting ? null : view.inspection),
      draft: isDrafting ? [...draftView.draft.values()] : [],
      draftFades: advanceDraftFades(now, isDrafting),
      arriving: advanceArrivals(now, view),
      settling: advanceSettles(now, view),
      palette: view.palette,
      colorIndexAt: (x, y) => view.pixels[toStateOffset(x, y, view.width)] ?? TRANSPARENT_COLOR_INDEX,
      confirmedColorIndexAt: (x, y) => store.confirmedColorIndexAt(x, y),
    });
    hasPainted = true;
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
    if (pressedPointers.size > 0) return;
    setPanning(false);
    navigation.end();
  };

  const commitViewport = (next: Viewport) => {
    viewport = next;
    isAtArrival = false;
    options.onViewportMove(next);
    requestRender();
  };

  // Les zooms animés (un toucher sur une case trop petite, + et −, Recentrer, un cran de molette) avancent
  // image par image sur l'état de la vue, jamais par un transform CSS qui décalerait la visée des cases. Tout geste de
  // l'utilisateur sur la vue l'interrompt là où il est : seul `moveViewport` y mène. `zoomGoal` : la vue où il va, pour qu'un
  // zoom de plus parte de son but et que les clics rapprochés s'additionnent.
  let zoomRequest = 0;
  let zoomGoal: Viewport | null = null;
  const stopZoom = () => {
    cancelAnimationFrame(zoomRequest);
    zoomRequest = 0;
    zoomGoal = null;
  };

  const moveViewport = (next: Viewport) => {
    stopZoom();
    commitViewport(next);
  };

  // Le pointeur principal décide de la taille de case qui reste facile à viser.
  const pointerGrain = (): PointerGrain =>
    window.matchMedia(COARSE_POINTER_QUERY).matches ? "coarse" : "fine";

  const animateZoom = (from: Viewport, to: Viewport, startedAt: number, onDone?: () => void) => {
    const duration = motionMs(root, "--lp-dur");
    const finish = () => {
      zoomGoal = null;
      onDone?.();
    };
    // Mouvement réduit : la durée vaut 0, la vue saute à son but.
    if (duration === 0) {
      commitViewport(to);
      return finish();
    }
    zoomGoal = to;
    const ease = easingCurve(motionEasing(root));
    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      zoomRequest = progress < 1 ? requestAnimationFrame(step) : 0;
      commitViewport(zoomFrame(from, to, ease(progress)));
      if (progress >= 1) finish();
    };
    zoomRequest = requestAnimationFrame(step);
  };

  // Une image d'attente, puis le zoom part de la vue d'alors : l'événement qui le décide n'a pas encore été peint.
  const startZoom = (to: Viewport, onDone?: () => void) => {
    stopZoom();
    zoomRequest = requestAnimationFrame((startedAt) => {
      zoomRequest = 0;
      if (viewport) animateZoom(viewport, to, startedAt, onDone);
    });
  };

  // Le cadrage d'arrivée, avec les marges d'aujourd'hui : l'arrivée elle-même, Recentrer, une nouvelle taille de canvas.
  const frameArrival = (canvas: Size) => {
    moveViewport(fitViewport(screen, canvas, insets));
    isAtArrival = true;
  };

  // Les pills se mesurent après le premier cadrage (le thème arrive, l'encoche change) : si la vue n'a pas bougé depuis
  // l'arrivée, elle suit la nouvelle zone libre ; sinon, seul le pourcentage du zoom se relit.
  const refreshInsets = () => {
    // Écart §9.3 (JOURNAL 2026-10-09) : pas en Dessin, où la bande Thème, plus étroite, passe sur deux lignes et recadrerait la vue.
    if (screen.width === 0 || draftStore.getView().mode === "draft") return;
    const next = measureInsets();
    if (isSameInsets(next, insets)) return;
    insets = next;
    if (viewport && isAtArrival && store.getView().width > 0) frameArrival(canvasSize());
    else requestRender();
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

  // La barre du bas se mesure (pill.tsx) : la case visée au clavier reste au-dessus. En colonne sur le côté, la zone libre la borne.
  const keyInsets = (): Insets => {
    if (window.matchMedia(SIDE_COLUMN_QUERY).matches) {
      // En Dessin le panneau tient la droite : la zone d'arrivée, peut-être au-dessus de la colonne, n'est plus la zone libre.
      const free = draftStore.getView().mode === "draft" ? measureDraftInsets(root, screen) : insets;
      return {
        top: KEY_MARGIN,
        right: KEY_MARGIN + free.right,
        bottom: KEY_MARGIN + free.bottom,
        left: KEY_MARGIN + free.left,
      };
    }
    const bottomBar = Number.parseFloat(getComputedStyle(root).getPropertyValue(BOTTOM_BAR_HEIGHT)) || 0;
    return { top: KEY_MARGIN, right: KEY_MARGIN, bottom: KEY_MARGIN + bottomBar, left: KEY_MARGIN };
  };

  // La première flèche : la case inspectée, sinon celle du centre de l'écran, bornée au canvas (CDC 2026).
  const firstKeyTarget = (current: Viewport, canvas: Size): Cell => {
    const { inspection } = store.getView();
    if (inspection) return { x: inspection.x, y: inspection.y };
    const x = Math.floor((screen.width / 2 - current.offsetX) / current.scale);
    const y = Math.floor((screen.height / 2 - current.offsetY) / current.scale);
    return clampCell({ x, y }, canvas);
  };

  // Un clic immobile ou un tap (A5 du plan du J10) : en Dessin, la case entre dans le brouillon ou en sort ;
  // en Vue, elle s'inspecte, et un clic dans le vide ferme l'inspection (CDC 2026). Écart §9.3 (JOURNAL 2026-10-09) : une case
  // trop petite pour viser ne s'inspecte pas, la vue zoome sous le doigt ; un zoom, pour le conseil et la pill Canvas.
  const tap = (current: Viewport, point: ScreenPoint) => {
    const cell = cellAt(current, point);
    setTargetCell(cell);
    if (draftStore.getView().mode === "draft") {
      if (cell) draftStore.toggleCell(cell.x, cell.y);
    } else if (cell) {
      const limits = zoomLimits(screen, canvasSize(), insets);
      const target = tapZoomTarget(current, point, pointerGrain(), freeArea(screen, insets), limits);
      options.onGesture();
      if (target) {
        options.onNavigate?.("zoom");
        startZoom(target);
      } else store.inspect(cell.x, cell.y);
    } else store.closeInspection();
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

  // Un zoom d'un seul coup (un bouton, un cran de molette) s'anime au lieu de sauter, vers un but qui s'ajoute à celui d'avant.
  const zoomView = (current: Viewport, point: ScreenPoint, factor: number, isSmooth: boolean) => {
    const limits = zoomLimits(screen, canvasSize(), insets);
    if (!isSmooth) return moveViewport(zoomAt(current, point, factor, limits));
    const goalScale = (zoomGoal ?? current).scale;
    const goal = zoomTowards(current, goalScale, point, factor, limits);
    if (goal.scale !== goalScale) startZoom(goal);
  };

  const apply = (gesture: Gesture, isSmooth = false) => {
    // Avant le `welcome`, le canvas n'a pas de taille : rien à déplacer.
    if (!viewport || store.getView().width === 0) return;
    if (movesViewport(gesture)) options.onGesture();
    navigation.watch(gesture);
    switch (gesture.kind) {
      case "pan":
        setPanning(true);
        moveViewport(panBy(viewport, gesture.dx, gesture.dy));
        break;
      case "zoom":
        zoomView(viewport, gesture.point, gesture.factor, isSmooth);
        break;
      case "pinch": {
        setPanning(true);
        const panned = panBy(viewport, gesture.dx, gesture.dy);
        moveViewport(zoomAt(panned, gesture.point, gesture.factor, zoomLimits(screen, canvasSize(), insets)));
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
    // Un autre écran, d'autres marges : la vue, elle, ne bouge pas (elle n'a jamais été recadrée à un redimensionnement).
    insets = measureInsets();
    surface.width = Math.round(screen.width * pixelRatio);
    surface.height = Math.round(screen.height * pixelRatio);
    const tile = checkerTile(screen);
    options.checker.style.setProperty("--lp-checker-tile", `${tile}px`);
    driftChecker(tile);
    requestRender();
  });
  resizeObserver.observe(surface);

  // L'apparence change (bouton, Mon compte, ou le système en auto) : nouvelles teintes. Le damier suit seul, en CSS.
  const appearanceObserver = new MutationObserver(() => {
    shades = getSceneShades(root);
    requestRender();
  });
  appearanceObserver.observe(root, { attributes: true, attributeFilter: ["data-appearance"] });

  // Les pills publient leur taille sur <html> (pill.tsx) : un thème qui paraît ou change de hauteur change la zone libre.
  const insetsObserver = new MutationObserver(refreshInsets);
  insetsObserver.observe(root, { attributes: true, attributeFilter: ["style"] });
  // Une charnière ou une posture change la zone sans changer l'écran : la boîte de la zone le dit. Un autre écran ne recadre
  // jamais la vue (l'observateur ci-dessus relit les marges seul).
  const refreshZone = () => {
    if (surface.clientWidth === screen.width && surface.clientHeight === screen.height) refreshInsets();
  };
  const unobserveZone = options.isFramedInFreeArea ? observeZone(root, refreshZone) : () => undefined;

  // §5.3 : une nouvelle taille ramène la vue à l'arrivée. Écart §9.3 (JOURNAL 2026-10-09) : sa forme dit aussi la zone d'arrivée.
  let knownSize: Size | null = null;
  const unsubscribe = store.subscribe(() => {
    const { width, height } = store.getView();
    const isFirstSize = knownSize === null && width > 0;
    const isResized = knownSize !== null && (width !== knownSize.width || height !== knownSize.height);
    if (width > 0) knownSize = { width, height };
    if (isResized && viewport && width > 0) {
      insets = measureInsets();
      frameArrival({ width, height });
    } else if (isFirstSize) refreshInsets();
    isImageStale = true;
    requestRender();
  });

  const unsubscribeArrived = store.listenArrived(startArrivals);

  // Mouvement réduit : la durée vaut 0, la case passe pleine d'un coup.
  const unsubscribeConfirmed = store.listenConfirmed((pixels) => {
    const duration = motionMs(root, "--lp-dur");
    if (duration === 0) return;
    settles.push({ pixels, duration, ease: easingCurve(motionEasing(root)), startedAt: null });
    requestRender();
  });

  // Une case retirée part d'un coup. Les cases neuves ou repeintes entrent en fondu, sauf au-delà du plafond : un brouillon
  // gardé (rendu avant d'entrer en Dessin) ou le mouvement réduit les fait paraître d'un coup.
  const startDraftFades = (previous: Draft, next: Draft, mode: DraftMode) => {
    for (const key of draftFades.keys()) if (!next.has(key)) draftFades.delete(key);
    const duration = motionMs(root, "--lp-dur-fast");
    if (mode !== "draft" || duration === 0) return;
    const ease = easingCurve(motionEasing(root));
    for (const { key, from } of draftFadeStarts(previous, next, MAX_DRAFT_FADES - draftFades.size))
      draftFades.set(key, { from, duration, ease, startedAt: null });
  };

  let lastDraft = draftStore.getView().draft;
  let wasTracing = false;
  // Écart §9.3 (JOURNAL 2026-10-09) : entrer en Dessin, comme en sortir, ne touche pas à la vue.
  const unsubscribeDraft = draftStore.subscribe(() => {
    const { isTracing, mode, draft } = draftStore.getView();
    if (draft !== lastDraft) {
      startDraftFades(lastDraft, draft, mode);
      lastDraft = draft;
    }
    if (isTracing !== wasTracing) {
      lastTracedCell = null;
      wasTracing = isTracing; // avant traceTo : il republie, et l'abonnement rentre à nouveau
      if (isTracing) traceTo(targetCell);
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
      stopZoom();
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
      const isNotch = isWheelNotch(event.deltaY, event.deltaMode, event.ctrlKey);
      apply({ kind: "zoom", point: { x: event.clientX, y: event.clientY }, factor }, isNotch);
    },
    { passive: false, signal },
  );

  return {
    zoomBy(factor) {
      apply({ kind: "zoom", point: { x: screen.width / 2, y: screen.height / 2 }, factor }, true);
    },
    // Recentrer revient à l'arrivée, sur l'écran d'aujourd'hui, en douceur ; la vue n'est à l'arrivée qu'une fois arrivée.
    // Écart §8.1 (JOURNAL 2026-10-09) : comme un déplacement, il replie la pill Canvas.
    recenter() {
      if (!viewport || store.getView().width === 0) return;
      options.onGesture();
      insets = measureInsets();
      startZoom(fitViewport(screen, canvasSize(), insets), () => {
        isAtArrival = true;
      });
    },
    // Au clavier (CDC 2026, raccourcis) : pendant un tracé, chaque case visée entre au brouillon, sans trou.
    moveTarget(dx, dy) {
      if (!viewport || store.getView().width === 0) return;
      const canvas = canvasSize();
      const next = targetCell
        ? clampCell({ x: targetCell.x + dx, y: targetCell.y + dy }, canvas)
        : firstKeyTarget(viewport, canvas);
      setTargetCell(next);
      if (draftStore.getView().isTracing) traceTo(next);
      const shown = panToShow(viewport, next, screen, keyInsets());
      if (shown !== viewport) moveViewport(shown);
    },
    pickTarget() {
      if (targetCell && draftStore.getView().isPicking) draftStore.toggleCell(targetCell.x, targetCell.y);
    },
    discardTarget() {
      if (targetCell) draftStore.discardCell(targetCell.x, targetCell.y);
    },
    dispose() {
      cancelAnimationFrame(frameRequest);
      stopZoom();
      resizeObserver.disconnect();
      checkerDrift?.cancel();
      appearanceObserver.disconnect();
      insetsObserver.disconnect();
      unobserveZone();
      setPanning(false);
      root.removeAttribute(ZONE_ABOVE_ATTRIBUTE);
      backdropImage.dispose();
      if (hasPainted && options.handoff) {
        options.handoff.surface = surface;
        options.handoff.leftAt = performance.now();
      }
      unsubscribe();
      unsubscribeConfirmed();
      unsubscribeArrived();
      unsubscribeDraft();
      listening.abort();
    },
  };
}
