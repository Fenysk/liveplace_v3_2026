// L'aperçu de pixels (JOURNAL 2026-09-25) : le canvas à son format, sur son damier, dans sa bordure, avec ces pixels
// seuls, nets. Un petit dessin est cadré de près (preview-area.ts). Une case gommée : comme la gomme du brouillon.

import { TRANSPARENT_COLOR_INDEX } from "@liveplace/domain";
import type { Pixel } from "@liveplace/domain/ports";
import { useEffect, useMemo, useRef } from "react";
import { fillErased } from "../canvas/render-scene";
import { getSceneShades } from "../canvas/scene-shades";
import { type PreviewArea, toPreviewArea } from "./preview-area";

const PREVIEW_SIDE = 640; // pixels physiques du plus grand côté : net sur un écran Retina, à 320 px CSS
const ERASER_LINE_RATIO = 8; // la croix de la gomme : un huitième de case

type PixelPreviewProps = {
  width: number; // la taille du canvas, en cases
  height: number;
  palette: readonly string[];
  pixels: readonly Pixel[];
  label: string; // l'aperçu est une image : son nom pour un lecteur d'écran
};

const paint = (
  surface: HTMLCanvasElement,
  area: PreviewArea,
  pixels: readonly Pixel[],
  palette: readonly string[],
) => {
  const cellSize = Math.max(1, Math.floor(PREVIEW_SIDE / Math.max(area.width, area.height)));
  surface.width = area.width * cellSize;
  surface.height = area.height * cellSize;
  const context = surface.getContext("2d");
  if (!context) throw new Error("pixel-preview : contexte 2d indisponible");
  const shades = getSceneShades(document.documentElement);
  context.strokeStyle = shades.outlineIn;
  context.lineWidth = Math.max(1, cellSize / ERASER_LINE_RATIO);
  for (const { x, y, colorIndex } of pixels) {
    const rect = {
      left: (x - area.x) * cellSize,
      top: (y - area.y) * cellSize,
      width: cellSize,
      height: cellSize,
    };
    if (colorIndex === TRANSPARENT_COLOR_INDEX) fillErased(context, rect, undefined, shades);
    else {
      context.fillStyle = palette[colorIndex] ?? shades.void;
      context.fillRect(rect.left, rect.top, rect.width, rect.height);
    }
  }
};

export const PixelPreview = ({ width, height, palette, pixels, label }: PixelPreviewProps) => {
  const surface = useRef<HTMLCanvasElement>(null);
  const area = useMemo(() => toPreviewArea(pixels, { width, height }), [pixels, width, height]);
  useEffect(() => {
    const element = surface.current;
    if (!element) return;
    paint(element, area, pixels, palette);
    // Le thème change : la gomme suit, comme sur le canvas. Le damier et la bordure suivent seuls, en CSS.
    const themeObserver = new MutationObserver(() => paint(element, area, pixels, palette));
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => themeObserver.disconnect();
  }, [area, pixels, palette]);
  return (
    <div className="lp-preview" style={{ aspectRatio: `${area.width} / ${area.height}` }}>
      <canvas ref={surface} className="lp-preview-surface" role="img" aria-label={label} />
    </div>
  );
};
