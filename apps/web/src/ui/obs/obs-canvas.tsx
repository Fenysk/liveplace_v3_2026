// La surface de la vue OBS (CDC 2026, Vue OBS) : les pixels seuls, sur le fond de la fresque (transparent, noir ou blanc) et son image
// (Écart §9.1, JOURNAL 2026-10-10). Le canvas remplit la source sans se déformer, centré : une case peut faire 4 px et sa voisine
// 5 px (JOURNAL 2026-09-25). Ni geste, ni curseur.

import { useEffect, useRef } from "react";
import { backgroundImagePath } from "../../shared/background-image-path";
import type { ObsStore, ObsView } from "../../state/obs-store";
import {
  createBackdropImage,
  createPropertyReader,
  renderBackdrop,
  toBackdrop,
} from "../canvas/canvas-background";
import { createCanvasImage } from "../canvas/canvas-image";
import { useTexts } from "../locale/use-locale";
import { OBS_TEXTS } from "./obs-texts";

// `login` : celui de la page, qui nomme l'adresse de l'image du fond.
type ObsCanvasProps = { store: ObsStore; login: string };

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

export const ObsCanvas = ({ store, login }: ObsCanvasProps) => {
  const surface = useRef<HTMLCanvasElement>(null);
  const t = useTexts(OBS_TEXTS);

  useEffect(() => {
    const element = surface.current;
    if (!element) return;
    const context = element.getContext("2d");
    if (!context) throw new Error("obs-canvas : contexte 2d indisponible");
    const image = createCanvasImage();
    const backdropImage = createBackdropImage(() => requestPaint());
    const getProperty = createPropertyReader(element);
    let frame = 0;

    const paint = (): void => {
      frame = 0;
      const view = store.getView();
      if (!view.isReady) return;
      image.repaint(view);
      const { width, height } = sizeSurface(element);
      const { left, top, width: drawnWidth, height: drawnHeight } = fitRect({ width, height }, view);
      context.clearRect(0, 0, width, height);
      // CDC 2026 §1, Écart §9.1 (JOURNAL 2026-10-10) : le fond noir ou blanc, puis l'image par-dessus à son opacité, sous les pixels,
      // dans le cadre du canvas seulement. Sans fond, l'image se pose sur la transparence : OBS montre sa source à travers.
      backdropImage.set(view.backgroundImageAt ? backgroundImagePath(login, view.backgroundImageAt) : null);
      renderBackdrop(
        context,
        { left, top, width: drawnWidth, height: drawnHeight },
        toBackdrop(view.background, backdropImage.get(), view.backgroundImageOpacity, getProperty),
      );
      context.imageSmoothingEnabled = false;
      context.drawImage(image.source, left, top, drawnWidth, drawnHeight);
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
      backdropImage.dispose();
      unsubscribe();
      resizeObserver.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [store, login]);

  return <canvas ref={surface} className="lp-obs-surface" aria-label={t.surfaceLabel} />;
};
