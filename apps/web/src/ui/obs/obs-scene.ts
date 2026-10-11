// La scène de la vue OBS (CDC 2026, Vue OBS) : sa surface, son image, ses effets, et un dessin seulement quand quelque chose a changé
// ou qu'un effet court. Les mêmes animations que le jeu, par le même état (revealer.ts, arrival-fades.ts) et le même pinceau
// (render-scene.ts) : la mosaïque à l'apparition, le fondu de l'ancienne fresque quand la source en suit une autre, et les cases
// des autres joueurs en fondu décalé, à l'heure où le stream les montre. Dans la vue OBS, toutes les cases sont celles des autres.
// Créée dans un `useEffect` : `window` et `ResizeObserver` n'existent que dans le navigateur.

import { TRANSPARENT_COLOR_INDEX, toStateOffset } from "@liveplace/domain";
import { backgroundImagePath } from "../../shared/background-image-path";
import type { ObsStore, ObsView } from "../../state/obs-store";
import { createArrivalFades } from "../canvas/arrival-fades";
import { createBackdropImage, createPropertyReader, toBackdrop } from "../canvas/canvas-background";
import { createCanvasImage } from "../canvas/canvas-image";
import { type Handoff, takeLeftBehind } from "../canvas/handoff";
import type { Ghost, Reveal } from "../canvas/render-scene";
import { createRevealer, ghostOver } from "../canvas/revealer";
import { renderObs } from "./render-obs";

// `login` : celui de la page, qui nomme l'adresse de l'image du fond. `handoff` : le passage d'une scène à la suivante, quand la
// source suit une autre fresque.
export type ObsSceneOptions = { login: string; handoff?: Handoff | undefined };

export type ObsScene = { dispose(): void };

type Rect = { left: number; top: number; width: number; height: number };

// La surface en pixels physiques, à sa taille affichée : nette sur un écran Retina.
const sizeSurface = (element: HTMLCanvasElement): { width: number; height: number } => {
  const ratio = window.devicePixelRatio || 1;
  const [width, height] = [Math.round(element.clientWidth * ratio), Math.round(element.clientHeight * ratio)];
  if (element.width !== width) element.width = width;
  if (element.height !== height) element.height = height;
  return { width, height };
};

// Le cadre du canvas dans la surface : rempli sans déformation, centré.
const fitRect = (surface: { width: number; height: number }, view: ObsView): Rect => {
  const scale = Math.min(surface.width / view.width, surface.height / view.height);
  const [width, height] = [view.width * scale, view.height * scale];
  return { left: (surface.width - width) / 2, top: (surface.height - height) / 2, width, height };
};

// La surface est réutilisée par la scène suivante : ce qu'elle montre, copié, est ce que la nouvelle garde à l'écran.
const copyOf = (element: HTMLCanvasElement): HTMLCanvasElement => {
  const copy = document.createElement("canvas");
  copy.width = element.width;
  copy.height = element.height;
  const context = copy.getContext("2d");
  if (!context) throw new Error("obs-scene : contexte 2d indisponible");
  context.drawImage(element, 0, 0);
  return copy;
};

export function createObsScene(
  element: HTMLCanvasElement,
  store: ObsStore,
  { login, handoff }: ObsSceneOptions,
): ObsScene {
  const context = element.getContext("2d");
  if (!context) throw new Error("obs-scene : contexte 2d indisponible");
  const root = document.documentElement;
  const image = createCanvasImage();
  const backdropImage = createBackdropImage(() => requestPaint());
  const getProperty = createPropertyReader(element);
  const revealer = createRevealer(root);
  const fades = createArrivalFades(root);
  // Avant que la nouvelle image soit là, la surface garde l'ancienne telle quelle (rien n'est dessiné) ; sa copie s'efface ensuite.
  let ghostSurface = takeLeftBehind(handoff);
  let hasPainted = false;
  let frame = 0;

  const advanceGhost = (reveal: Reveal | null): Ghost | null => {
    const ghost = ghostSurface ? ghostOver(ghostSurface, reveal) : null;
    if (!ghost) ghostSurface = null;
    return ghost;
  };

  const paint = (now: number): void => {
    frame = 0;
    const view = store.getView();
    if (!view.isReady) return;
    image.repaint(view);
    const surface = sizeSurface(element);
    backdropImage.set(view.backgroundImageAt ? backgroundImagePath(login, view.backgroundImageAt) : null);
    const reveal = revealer.advance(now, { ...view, isLoaded: view.isReady });
    renderObs(context, {
      surface,
      frame: fitRect(surface, view),
      canvas: view,
      image: image.source,
      palette: view.palette,
      backdrop: toBackdrop(view.background, backdropImage.get(), view.backgroundImageOpacity, getProperty),
      reveal,
      arriving: fades.advance(
        now,
        view,
        (x, y) => view.pixels[toStateOffset(x, y, view.width)] ?? TRANSPARENT_COLOR_INDEX,
      ),
      ghost: advanceGhost(reveal),
    });
    hasPainted = true;
    // Une image de plus tant qu'un effet court ; ensuite, plus rien n'est attendu (§9.3).
    if (revealer.isRunning() || fades.isRunning()) requestPaint();
  };
  // Une image par `requestAnimationFrame`, seulement quand quelque chose a changé (§9.3).
  const requestPaint = (): void => {
    if (!frame) frame = requestAnimationFrame(paint);
  };

  const unsubscribe = store.subscribe(requestPaint);
  // Les cases paraissent à l'heure du stream, après le délai OBS : c'est là que leur fondu part, pas à leur réception.
  const unlistenArrived = store.listenArrived((lot) => {
    fades.start(lot, revealer.isSettled());
    requestPaint();
  });
  // Le streamer change la taille de sa source : la surface suit.
  const resizeObserver = new ResizeObserver(requestPaint);
  resizeObserver.observe(element);
  requestPaint();

  return {
    dispose() {
      if (hasPainted && handoff) {
        handoff.surface = copyOf(element);
        handoff.leftAt = performance.now();
      }
      backdropImage.dispose();
      unsubscribe();
      unlistenArrived();
      resizeObserver.disconnect();
      cancelAnimationFrame(frame);
    },
  };
}
