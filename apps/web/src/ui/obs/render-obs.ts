// Une image de la vue OBS (CDC 2026, Vue OBS), dans l'ordre : le fond de la fresque, les pixels (ou leur mosaïque à l'apparition),
// les cases des autres joueurs en fondu, puis la fresque que la source vient de quitter, qui s'efface. Le dessin du jeu
// (render-scene.ts) en prête les morceaux : la vue OBS n'en a pas un second. Tout est en pixels physiques.

import { type Backdrop, renderBackdrop } from "../canvas/canvas-background";
import {
  type ArrivingCell,
  cellRectAt,
  type Ghost,
  type Reveal,
  renderArriving,
  renderImage,
  renderLeftBehind,
} from "../canvas/render-scene";

export type ObsFrame = {
  surface: { width: number; height: number };
  frame: { left: number; top: number; width: number; height: number }; // le cadre de la fresque dans la surface
  canvas: { width: number; height: number }; // la fresque, en cases
  image: CanvasImageSource;
  palette: readonly string[];
  backdrop: Backdrop;
  reveal: Reveal | null;
  arriving: readonly ArrivingCell[];
  ghost: Ghost | null;
};

export function renderObs(context: CanvasRenderingContext2D, scene: ObsFrame): void {
  const { surface, frame, canvas } = scene;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, surface.width, surface.height);
  // CDC 2026 §1, Écart §9.1 (JOURNAL 2026-10-10) : le fond noir ou blanc, puis l'image par-dessus à son opacité, sous les pixels,
  // dans le cadre du canvas seulement. Sans fond, l'image se pose sur la transparence : OBS montre sa source à travers.
  renderBackdrop(context, frame, scene.backdrop);
  context.imageSmoothingEnabled = false;
  renderImage(context, scene, frame);
  // Une case de 4 px et sa voisine de 5 (JOURNAL 2026-09-25) : les rectangles suivent le cadre, comme l'image.
  const cellRect = cellRectAt(frame.left, frame.top, frame.width / canvas.width);
  renderArriving(context, scene, frame, (x, y) => cellRect(x, y, 1, 1));
  renderLeftBehind(context, scene);
}
