// Le canvas à l'écran : un pixel par case, agrandi sans lissage (§9.3).

import { type PointerEvent, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { CanvasStore } from "../../state/canvas-store";

type Rgba = [number, number, number, number];

const TRANSPARENT: Rgba = [0, 0, 0, 0];

// "#rrggbb" ou "#rrggbbaa" : la palette arrive en hexadécimal dans le `welcome` (§4.3).
const toRgba = (hex: string): Rgba => {
  const channel = (start: number) => Number.parseInt(hex.slice(start, start + 2), 16);
  return [channel(1), channel(3), channel(5), hex.length > 7 ? channel(7) : 255];
};

type PixelCanvasProps = { store: CanvasStore; colorIndex: number };

export const PixelCanvas = ({ store, colorIndex }: PixelCanvasProps) => {
  const view = useSyncExternalStore(store.subscribe, store.getView, store.getView);
  const surface = useRef<HTMLCanvasElement>(null);
  const colorTable = useMemo(() => view.palette.map(toRgba), [view.palette]);

  // Repeint tout à chaque changement : 65 536 cases, assez court jusqu'au rendu par lignes du J9.
  useEffect(() => {
    const context = surface.current?.getContext("2d");
    if (!context || view.width === 0) return;
    const image = context.createImageData(view.width, view.height);
    view.pixels.forEach((index, offset) => {
      image.data.set(colorTable[index] ?? TRANSPARENT, offset * 4);
    });
    context.putImageData(image, 0, 0);
  }, [view, colorTable]);

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const x = Math.floor(((event.clientX - box.left) / box.width) * view.width);
    const y = Math.floor(((event.clientY - box.top) / box.height) * view.height);
    store.place(x, y, colorIndex);
  };

  return (
    <canvas
      ref={surface}
      width={view.width}
      height={view.height}
      onPointerDown={onPointerDown}
      style={{
        width: "min(92vw, 80vh, 768px)",
        aspectRatio: "1",
        imageRendering: "pixelated",
        background: "#f4f1ea",
        cursor: "crosshair",
        touchAction: "none",
      }}
    />
  );
};
